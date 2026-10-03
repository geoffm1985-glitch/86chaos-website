import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {FirebaseSession,newFirebaseRun} from '../automation/firebase-target.mjs';
import {firebaseFixture} from './helpers/firebase-fixture.mjs';
import {eventually} from './helpers/continuous-loop-fixture.mjs';

test('Play Store: repaired local SDK gets a bounded warmup beyond three quick failures',async()=>{
 const s=new FirebaseSession({timeoutMs:3000});s.status='running';s.bridge={projectId:'demo-86chaos'};let checks=0;
 s.ready=async()=>{checks++;if(checks<=5)throw Error('Readiness HTTP 503')};
 assert.equal(await s.start(newFirebaseRun({})),s.bridge);assert.equal(checks,6);assert.equal(s.status,'running');
});
test('Play Store: local SDK warmup remains cancellable and never substitutes live',async()=>{
 const s=new FirebaseSession({timeoutMs:3000});s.status='running';s.ready=async()=>{throw Error('Readiness HTTP 503')};
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),50);
 try{await assert.rejects(s.start(newFirebaseRun({}),{signal:abort.signal}),/cancelled/)}finally{clearTimeout(timer)}
});
test('Play Store: source archive creation yields to connection requests and has a timeout',async()=>{
 const source=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('async function buildHandoff('),source.indexOf('function selfHealCheckpoint('));
 let beats=0,options;const timer=setInterval(()=>beats++,5),ctx={continuousLoopFixture:null,fs:{mkdirSync(){}},path,dataDir:'/fixture',__dirname:'/app',Date,state:{},repositoryPathOrThrow:()=>'/repo',failureSummary:()=>'',execFileAsync:async(_file,_args,opts)=>{options=opts;await new Promise(r=>setTimeout(r,60))}};
 try{await vm.runInNewContext(fn+';buildHandoff()',ctx);assert.ok(beats>=2);assert.equal(options.timeout,180000)}finally{clearInterval(timer)}
});
test('Play Store: failed emulator startup automatically retries saved delta and completes',async()=>{
 const f=await firebaseFixture();
 try{
  const cli=path.join(f.repo,'node_modules/firebase-tools/lib/bin/firebase.js'),marker=path.join(f.repo,'emulator-first-attempt');
  const prefix=`if(!require('fs').existsSync(${JSON.stringify(marker)})){require('fs').writeFileSync(${JSON.stringify(marker)},'retry');console.error('Controlled transient emulator startup failure');process.exit(1)};`;
  fs.writeFileSync(cli,prefix+fs.readFileSync(cli,'utf8'));f.git(['add','.']);f.git(['commit','-m','Transient startup regression']);
  await f.start();await f.api('/api/action',{action:'start'});
  const done=await eventually(async()=>{const s=await f.status();return s.workflow.state==='complete'&&s},{timeout:60000});
  assert.equal(done.workflow.firebaseRecoveryAttempts,1);assert.equal(done.run.state,'passed');assert.equal(done.workflow.firebase.fallbackAttempted,false);
  assert.deepEqual(f.runs().map(r=>[r.type,r.target]),[['delta','emulator']]);
 }finally{await f.close()}
});
