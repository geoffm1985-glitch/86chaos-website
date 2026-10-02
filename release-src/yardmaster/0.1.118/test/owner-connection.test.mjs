import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {ownerConnectionIdentity,signedConnection,trustedOwnerSession,DISCOVERY_URL} from '../automation/owner-connection.mjs';
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ym-owner-test-'));
const identity=ownerConnectionIdentity(directory),old='https://old-owner.trycloudflare.com',current='https://new-owner.trycloudflare.com';
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)}};
function browser(transport,local=storage(),tab=storage(),network={onLine:true}){
 const context={localStorage:local,sessionStorage:tab,fetch:transport,crypto:crypto.webcrypto,navigator:network,TextEncoder,Uint8Array,atob,AbortSignal};
 vm.runInNewContext(fs.readFileSync(new URL('./fixtures/website/connection.js',import.meta.url),'utf8'),context);
 const link=new context.YardmasterConnection();link.base=old;local.setItem('yardmaster:url',old);link.remember({id:identity.id,publicKey:identity.publicKey,discoveryUrl:DISCOVERY_URL});return {link,local,tab};
}
test.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
test('release gate: trusted phone has no timed expiry; explicit revocation ends access',()=>{
 const devices={phone:{credential:{id:'registered'}}},session={deviceId:'phone',expiresAt:1};
 assert.equal(trustedOwnerSession(session,devices),true);delete devices.phone;assert.equal(trustedOwnerSession(session,devices),false);
 assert.equal(trustedOwnerSession({deviceId:'stranger'},devices),false);
});
test('release gate: owner identity survives PC/service restart and signs current tunnel',()=>{
 assert.deepEqual(ownerConnectionIdentity(directory),identity);const record=signedConnection(identity,current);
 assert.equal(crypto.verify('sha256',Buffer.from(record.payload),crypto.createPublicKey({key:identity.publicKey,format:'jwk'}),Buffer.from(record.signature,'base64')),true);
 assert.throws(()=>signedConnection(identity,'https://attacker.invalid'));
});
test('release gate: owner credential survives a new mobile tab and temporary network loss',async()=>{
 const local=storage(),tab=storage();tab.setItem('yardmaster:session','saved-owner');const {link}=browser(()=>{throw Error('offline')},local,tab,{onLine:false});
 assert.equal(link.credential,'saved-owner');await assert.rejects(link.request('/api/status'),e=>e.kind==='network-offline');
 const next=browser(()=>{},local).link;assert.equal(next.credential,'saved-owner');
});
test('release gate: stale tunnel is rediscovered and verified before credential transmission',async()=>{
 const calls=[];const {link}=browser(async(url,options)=>{
  calls.push({url,options});if(url.startsWith(DISCOVERY_URL))return {ok:true,json:async()=>signedConnection(identity,current)};
  if(url===current+'/api/remote/health')return {ok:true,json:async()=>({ok:true,connectionId:identity.id})};
  if(url.startsWith(old))throw Error('dead tunnel');return {ok:true,json:async()=>({reconnected:true})};
 });link.saveCredential('saved-owner');assert.equal((await link.request('/api/status')).reconnected,true);
 assert.equal(link.base,current);assert.equal(calls.find(c=>c.url.endsWith('/api/remote/health')).options.headers,undefined);
 assert.equal(calls.at(-1).options.headers.Authorization,'Bearer saved-owner');assert.ok(calls.every(c=>c.options.cache==='no-store'));
});
test('release gate: modified discovery record cannot redirect the trusted credential',async()=>{
 const calls=[];const record=signedConnection(identity,current);record.payload=record.payload.replace('new-owner','evil-owner');
 const {link}=browser(async(url)=>{calls.push(url);if(url.startsWith(old))throw Error('offline');return {ok:true,json:async()=>record}});
 link.saveCredential('saved-owner');await assert.rejects(link.request('/api/status'),e=>e.kind==='tunnel-unavailable');assert.equal(link.credential,'saved-owner');assert.ok(!calls.some(c=>c.includes('evil-owner')));
});
test('release gate: confirmed revoked credential requires unlock, without deleting passkey identity',async()=>{
 const {link,local}=browser(async url=>url.startsWith(DISCOVERY_URL)?{ok:true,json:async()=>signedConnection(identity,old)}:url.endsWith('/api/remote/health')?{ok:true,json:async()=>({ok:true,connectionId:identity.id})}:{ok:false,status:401});
 local.setItem('yardmaster:deviceId','phone');link.saveCredential('revoked');await assert.rejects(link.request('/api/status'),e=>e.kind==='authentication-rejected');assert.equal(link.credential,'');assert.equal(local.getItem('yardmaster:deviceId'),'phone');
});
test('release gate: lost response does not duplicate POST control actions',async()=>{
 let posts=0;const {link}=browser(async(url,opt)=>{if(opt.method==='POST'){posts++;throw Error('response lost')}return {ok:true,json:async()=>url.startsWith(DISCOVERY_URL)?signedConnection(identity,current):{ok:true,connectionId:identity.id}}});
 await assert.rejects(link.request('/api/action',{method:'POST',body:'{}'}));assert.equal(posts,1);assert.equal(link.base,current);
});
