import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
export const DISCOVERY_URL='https://raw.githubusercontent.com/geoffm1985-glitch/yardmaster/yardmaster-connections/connection.json';
const REPOSITORY='https://github.com/geoffm1985-glitch/yardmaster.git';
export function trustedOwnerSession(session,devices){return !!session?.deviceId&&!!devices[session.deviceId]?.credential}
export function ownerConnectionIdentity(dataDir){
  const file=path.join(dataDir,'owner-connection-key.json');
  if(fs.existsSync(file))return JSON.parse(fs.readFileSync(file,'utf8'));
  const {privateKey,publicKey}=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
  const identity={id:crypto.randomUUID(),privateKey:privateKey.export({type:'pkcs8',format:'pem'}),publicKey:publicKey.export({format:'jwk'})};
  fs.mkdirSync(dataDir,{recursive:true});fs.writeFileSync(file,JSON.stringify(identity),{mode:0o600});return identity;
}
export function signedConnection(identity,url,availability='online',now=Date.now()){
  if(url&&!/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i.test(url))throw new Error('Invalid discovery tunnel URL.');
  const payload=JSON.stringify({schema:1,id:identity.id,url,availability,updatedAt:now});
  return {payload,signature:crypto.sign('sha256',Buffer.from(payload),identity.privateKey).toString('base64'),publicKey:identity.publicKey};
}
export function createConnectionPublisher({dataDir,identity,run=exec,now=Date.now}){
  const cwd=path.join(dataDir,'connection-discovery');let pending=Promise.resolve(),lastPayload='';
  const git=async args=>run('git',args,{cwd,encoding:'utf8',windowsHide:true,timeout:20000,maxBuffer:1024*1024,env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
  return (url,availability='online')=>{
    const value=signedConnection(identity,url,availability,now()),key=url+' '+availability;
    // A publication on each endpoint/lifecycle change is sufficient; no branch
    // updates or website deployments are needed for ordinary phone polling.
    if(key===lastPayload)return pending;
    pending=pending.catch(()=>{}).then(async()=>{
      fs.mkdirSync(cwd,{recursive:true});
      if(!fs.existsSync(path.join(cwd,'.git'))){
        await git(['init','--initial-branch=yardmaster-connections']);
        await git(['remote','add','origin',REPOSITORY]);
        await git(['config','user.name','Yardmaster Owner Connection']);
        await git(['config','user.email','yardmaster@users.noreply.github.com']);
      }
      // Fetching the publication branch also avoids overwriting another writer.
      let fetched=false;try{await git(['fetch','origin','yardmaster-connections']);fetched=true}catch(error){
        if(!/couldn.t find remote ref/i.test(String(error.stderr||error.message)))throw error;
      }
      if(fetched)await git(['reset','--hard','FETCH_HEAD']);
      fs.writeFileSync(path.join(cwd,'connection.json'),JSON.stringify(value,null,2)+'\n');
      await git(['add','connection.json']);await git(['commit','-m','Update signed owner connection [skip ci]']);
      await git(['push','origin','HEAD:yardmaster-connections']);lastPayload=key;
    });return pending;
  };
}
