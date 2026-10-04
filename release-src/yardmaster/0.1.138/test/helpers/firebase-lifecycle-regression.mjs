import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {killManaged} from '../../automation/firebase-target.mjs';
import {createRepositorySnapshotAsync} from '../../automation/ops-intelligence.mjs';
export async function probeGuardianWithoutDisconnect({guardianScript=fileURLToPath(new URL('../../automation/firebase-watchdog.mjs',import.meta.url))}={}){
  const options={stdio:'ignore',detached:process.platform!=='win32',windowsHide:true};
  const owner=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],options),owned=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],options);
  for(const child of [owner,owned])child.once('close',()=>{child.yardmasterClosed=true});
  const guardian=spawn(process.execPath,[guardianScript,String(owner.pid)],{stdio:['ignore','ignore','ignore','ipc'],windowsHide:true});
  guardian.once('close',()=>{guardian.yardmasterClosed=true});
  const limit=(promise)=>Promise.race([promise,new Promise((_,reject)=>{const t=setTimeout(()=>reject(new Error('Guardian did not clean up while its IPC channel stayed open')),8000);t.unref()})]);
  try{
    const ack=once(guardian,'message');guardian.send({type:'owned',pids:[owned.pid]});await limit(ack);
    const done=once(owned,'close'),guardianDone=once(guardian,'exit');await killManaged(owner);
    await limit(done);await limit(guardianDone);return true;
  }finally{await Promise.all([owner,owned,guardian].map(killManaged))}
}
export async function probeSnapshotResponsiveness(f,{snapshot=createRepositorySnapshotAsync}={}){
  // Enough real data to exercise archiving, not a stubbed snapshot function.
  fs.writeFileSync(path.join(f.repo,'snapshot-payload.txt'),'snapshot-data\n'.repeat(100000));f.git(['add','.']);f.git(['commit','-m','snapshot payload']);
  let beats=0;const timer=setInterval(()=>beats++,5);
  try{const file=await snapshot(path.join(f.root,'snapshot-probe'),{repoPath:f.repo,reason:'responsiveness-regression'});if(!fs.existsSync(file)||beats<2)throw new Error('Snapshot blocked the event loop or did not produce an archive');return {beats,file}}finally{clearInterval(timer)}
}

export async function probeHealthRecovery(s){
  let calls=0;s.status='running';s.ready=async()=>{calls++;await new Promise(r=>setTimeout(r,20));throw new Error('transient readiness timeout')};
  await Promise.all([s.checkHealth(),s.checkHealth()]);if(calls!==1||s.status!=='running')throw new Error('Health checks overlapped or blocked after one transient timeout');
  s.ready=async()=>{};await s.checkHealth();if(s.healthFailures!==0)throw new Error('A successful health check did not clear transient failures');
  let reuseCalls=0;s.ready=async()=>{if(++reuseCalls<3)throw new Error('transient repair verification timeout')};await s.start({target:'emulator'});if(reuseCalls!==3)throw new Error('Reusing a healthy session did not retry transient readiness');
  s.ready=async()=>{throw new Error('sustained readiness loss')};await s.checkHealth();await s.checkHealth();await s.checkHealth();await s.stopPromise;await new Promise(r=>setTimeout(r,0));
  if(s.status!=='blocked'||s.error!=='sustained readiness loss')throw new Error('Sustained readiness loss did not block tests');return true;
}
