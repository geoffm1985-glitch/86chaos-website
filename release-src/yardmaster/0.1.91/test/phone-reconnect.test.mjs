import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readWebsite} from './helpers/website-push-fixture.mjs';

const source=readWebsite('mobile.js');
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}}
function fixture(overrides={}){
  const events=[],classes=new Set();
  const c={mobile:true,base:'https://fixture.trycloudflare.com',deviceId:'trusted-phone',token:'saved-session',window:{},document:{body:{classList:{contains:x=>classes.has(x)}}},Date,
    api:async path=>{events.push(path);return {}},render:()=>events.push('render'),hidePair:()=>{classes.add('ym-authenticated');events.push('unlocked')},
    showPair:message=>events.push(['pair',message]),showReconnect:message=>events.push(['reconnect',message]),renderMobileIntelligence:async()=>{},...overrides};
  vm.runInNewContext(source.slice(source.indexOf('let refreshBusy=false;'),source.indexOf("$('#phoneReconnectRetry')"))+';this.refresh=refresh;',c);
  return {c,events};
}
test('authenticated status unlocks the phone before slow intelligence completes',async()=>{
  const held=deferred(),f=fixture({renderMobileIntelligence:()=>held.promise});
  try{await f.c.refresh();assert.deepEqual(f.events.slice(-3),['/api/status','render','unlocked']);assert.equal(f.c.token,'saved-session')}
  finally{held.resolve()}
});
test('overlapping refresh ticks share one authenticated status request',async()=>{
  const held=deferred();let count=0;const f=fixture({api:async()=>{count++;return held.promise}});
  const runs=[f.c.refresh(),f.c.refresh(),f.c.refresh()];assert.equal(count,1);held.resolve({});await Promise.all(runs);assert.ok(f.events.includes('unlocked'));
});
test('intelligence requests remain single-flight while status polling continues',async()=>{
  const held=deferred();let count=0;const c={loadMobileIntelligence:()=>{count++;return held.promise}};
  vm.runInNewContext(source.slice(source.indexOf('let intelligenceRefresh=null;'),source.indexOf('async function loadMobileIntelligence()'))+';this.load=renderMobileIntelligence;',c);
  const calls=[c.load(),c.load(),c.load()];assert.equal(count,1);held.resolve();await Promise.all(calls);await c.load();assert.equal(count,2);
});
test('temporary API failure preserves trusted identity and automatically recovers',async()=>{
  let offline=true;const f=fixture({api:async()=>{if(offline)throw new Error('offline');return {}}});
  await f.c.refresh();assert.ok(f.events.some(e=>e[0]==='reconnect'&&e[1]?.includes('saved sign-in')));assert.equal(f.c.deviceId,'trusted-phone');assert.equal(f.c.token,'saved-session');assert.ok(!f.events.some(e=>e[0]==='pair'));
  offline=false;await f.c.refresh();assert.ok(f.events.includes('unlocked'));
});
test('rejected session keeps controls locked and offers the existing passkey',async()=>{
  const f=fixture();f.c.api=async()=>{f.c.token='';throw new Error('Unauthorized')};await f.c.refresh();
  assert.ok(!f.events.includes('unlocked'));assert.ok(f.events.some(e=>e[0]==='pair'&&e[1].includes('saved passkey')));assert.equal(f.c.deviceId,'trusted-phone');
});
test('hung phone API requests have a finite deadline and retain the session',async()=>{
  let deadline;const c={base:'https://fixture.trycloudflare.com',token:'saved-session',KEY:'yardmaster:',validRemote:()=>true,sessionStorage:{removeItem:()=>assert.fail('Network timeout is not logout')},
    AbortSignal:{timeout:ms=>{deadline=ms;return AbortSignal.timeout(10)}},fetch:async(url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))};
  vm.runInNewContext(source.slice(source.indexOf('function auth()'),source.indexOf('function showPair('))+';this.request=api;',c);
  // AbortSignal.timeout timers are unref'd; this handle keeps the test alive.
  const keepAlive=setTimeout(()=>{},1000);
  try{await assert.rejects(c.request('/api/status'),/cannot reach its API/);assert.equal(deadline,12000);assert.equal(c.token,'saved-session')}
  finally{clearTimeout(keepAlive)}
});
