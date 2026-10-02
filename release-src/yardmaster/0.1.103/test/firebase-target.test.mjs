import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {firebaseFixture} from './helpers/firebase-fixture.mjs';
import {eventually,createContinuousLoopFixture,driveFirebaseCycles} from './helpers/continuous-loop-fixture.mjs';
import {firebaseSettings,newFirebaseRun,firebasePhase,finishFirebasePhase,firebaseEnvironment,firebaseCommand,readFirebaseBridge} from '../automation/firebase-target.mjs';
import {canaryHealthCheck} from '../automation/ops-intelligence.mjs';
import {runSelfHealProcess} from '../automation/self-heal.mjs';
import {createPlaywrightConfig} from '../playwright.config.mjs';

test('Play Store: new/unset targets default to Emulator, explicit settings persist, invalid modes block',()=>{
  assert.deepEqual(firebaseSettings(),{mode:'emulator',livePhase:'verification'});
  for(const mode of ['emulator','live','both'])assert.equal(newFirebaseRun({firebaseMode:mode}).mode,mode);
  assert.throws(()=>firebaseSettings({firebaseMode:'production'}));assert.throws(()=>firebaseSettings({firebaseLivePhase:'automatic'}));
});
test('Play Store: BOTH requires full emulator first; Verification Only and Full Live Suite never cross-route',()=>{
  for(const livePhase of ['verification','full']){
    const f=newFirebaseRun({firebaseMode:'both',firebaseLivePhase:livePhase});assert.deepEqual(firebasePhase(f,'delta'),{target:'emulator',type:'full'});
    assert.equal(finishFirebasePhase(f,1),'failed');assert.equal(firebasePhase(f,'delta',{retry:true}).target,'emulator');
    assert.equal(finishFirebasePhase(f,0),'live-next');assert.deepEqual(firebasePhase(f,'delta',{retry:true}),{target:'live',type:livePhase});
    assert.equal(finishFirebasePhase(f,0,{liveFirebaseContacted:false}),'complete');assert.equal(f.emulatorPhases,2);assert.equal(f.livePhases,1);
  }
});
test('Play Store: live failure requires local repair and local delta before exactly one live recheck, including restart/pause',()=>{
  let f=newFirebaseRun({firebaseMode:'both'});firebasePhase(f,'full');finishFirebasePhase(f,0);firebasePhase(f,'delta');finishFirebasePhase(f,1);
  assert.equal(f.phase,'local-repair-required');f=newFirebaseRun({firebaseMode:'live'},JSON.parse(JSON.stringify(f)));assert.equal(f.mode,'both');
  assert.deepEqual(firebasePhase(f,'full',{retry:true}),{target:'emulator',type:'delta'});finishFirebasePhase(f,0);assert.equal(firebasePhase(f,'delta').type,'verification');
  assert.equal(f.liveVerificationAttempts,2);assert.equal(f.fallbackAttempted,false);
});
test('Play Store: all five emulators start with demo project, verified Hub and bridge; session reuse and cancellation leave no processes',async()=>{
  const f=await firebaseFixture(),s=f.session();try{
    await s.start(newFirebaseRun({}));assert.equal(s.status,'running');assert.equal(s.children.length,2);const pids=s.children.map(c=>c.pid);
    const args=JSON.parse(fs.readFileSync(path.join(s.dataDir,'cli-args.json')));assert.ok(args.includes('emulators:start'));assert.ok(args.includes('demo-86chaos'));assert.ok(args.includes('auth,firestore,functions,database,storage'));assert.equal(f.git(['status','--porcelain']),'');
    await s.start(newFirebaseRun({}));assert.deepEqual(s.children.map(c=>c.pid),pids);await s.stop();
    for(const pid of pids)assert.throws(()=>process.kill(pid,0));assert.equal(s.children.length,0);
  }finally{await s.stop();await f.close()}
});
test('Play Store: missing CLI, bad configuration, unavailable emulator and crash block without fallback',async()=>{
  const f=await firebaseFixture();let fatal=null;let s=f.session({detect:()=>{throw new Error('Firebase CLI missing')}});
  try{
    await assert.rejects(s.start(newFirebaseRun({})),/CLI missing/);assert.equal(s.status,'blocked');assert.equal(s.children.length,0);
    fs.writeFileSync(path.join(f.repo,'yardmaster.firebase.json'),JSON.stringify({...f.bridge,products:['auth','firestore']}));
    s=f.session({onFatal:e=>fatal=e});await s.start(newFirebaseRun({}));const child=s.children[0];child.kill('SIGTERM');await eventually(()=>fatal);assert.match(fatal.message,/exited/);await s.stop();
    fs.writeFileSync(path.join(f.repo,'yardmaster.firebase.json'),JSON.stringify({...f.bridge,projectId:'chaos-test-d1601'}));assert.throws(()=>readFirebaseBridge(f.repo),/Invalid/);
  }finally{await s.stop();await f.close()}
});
test('Play Store: emulator environment scrubs live credentials and targets; spawned Node processes cannot contact live Firebase',async()=>{
  const f=await firebaseFixture();try{
    const bridge=readFirebaseBridge(f.repo),env=firebaseEnvironment({run:newFirebaseRun({}),bridge,base:{...process.env,GCLOUD_PROJECT:'cheers-34b8d',GOOGLE_APPLICATION_CREDENTIALS:'secret.json',FIREBASE_TOKEN:'secret',VITE_FIREBASE_PROJECT_ID:'chaos-test-d1601'}});
    assert.equal(env.GCLOUD_PROJECT,'demo-86chaos');assert.equal(env.FIREBASE_TOKEN,undefined);assert.equal(env.GOOGLE_APPLICATION_CREDENTIALS,undefined);
    for(const key of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_FUNCTIONS_EMULATOR_HOST','FIREBASE_DATABASE_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST'])assert.match(env[key],/^127\.0\.0\.1:/);
    const result=spawnSync(process.execPath,['-e',"const net=require('net'),assert=require('assert');assert.throws(()=>net.connect({host:'firestore.googleapis.com',port:443}),/blocked non-local/);assert.throws(()=>net.connect({host:'chaos-test-d1601.firebaseio.com',port:443}),/blocked non-local/);const child=require('child_process').spawnSync(process.execPath,['-e',\"require('assert').throws(()=>require('net').connect(443,'firestore.googleapis.com'),/blocked non-local/)\"],{env:process.env});assert.equal(child.status,0)"],{env,encoding:'utf8'});assert.equal(result.status,0,result.stderr);
    const live=firebaseEnvironment({run:newFirebaseRun({firebaseMode:'live'}),base:env,liveUrl:'https://testing.86chaos.com'});assert.equal(live.GCLOUD_PROJECT,'chaos-test-d1601');assert.equal(live.FIRESTORE_EMULATOR_HOST,undefined);assert.equal(live.CHAOS_BLOCK_LIVE_FIREBASE,undefined);assert.doesNotMatch(live.NODE_OPTIONS,/firebase-network-guard/);
  }finally{await f.close()}
});
test('Play Store: full Play Store and complete Playwright commands preserve the full inventory; missing bounded live check blocks',async()=>{
  const f=await firebaseFixture();try{
    const b=readFirebaseBridge(f.repo);assert.equal(firebaseCommand(f.repo,{type:'full'},b),'npm run test:play-store');assert.equal(firebaseCommand(f.repo,{type:'playwright'},b),'npm run test:playwright');
    const pkg=JSON.parse(fs.readFileSync(path.join(f.repo,'package.json')));delete pkg.scripts['test:firebase:live-verification'];fs.writeFileSync(path.join(f.repo,'package.json'),JSON.stringify(pkg));assert.throws(()=>firebaseCommand(f.repo,{type:'verification'}),/will not be substituted/);
    assert.deepEqual(createPlaywrightConfig().projects.map(p=>p.name),['desktop-and-regressions','mobile-android']);
  }finally{await f.close()}
});
for(const [mode,livePhase,types] of [['emulator','verification',['full']],['live','verification',['full']],['both','verification',['full','verification']],['both','full',['full','full']]])test(`Play Store: real operator routes FULL workflow ${mode}/${livePhase}, forwards child environment and cleans up`,async()=>{
  const f=await firebaseFixture({mode,livePhase});try{
    await f.start();await f.api('/api/config',{testType:'full'});await f.api('/api/action',{action:'start'});
    const done=await eventually(async()=>{const s=await f.status();if(s.workflow.state==='firebase-blocked')throw new Error(s.workflow.error);return s.run.state==='passed'&&s.workflow.state!=='testing'&&s});
    assert.deepEqual(f.runs().map(r=>r.type),types);assert.deepEqual(f.runs().map(r=>r.target),mode==='both'?['emulator','live']:[mode]);
    assert.equal(done.workflow.firebase.fallbackAttempted,false);assert.equal(done.workflow.firebase.liveFirebaseContacted,false);
    if(mode!=='live')await eventually(async()=>(await f.status()).firebase.emulator.status==='stopped');
  }finally{await f.close()}
});
test('Play Store: BOTH live failure resumes locally despite changed settings, retains session and performs only one next live attempt',async()=>{
  const f=await firebaseFixture({mode:'both',failLive:true});try{
    await f.start();await f.api('/api/config',{testType:'playwright'});await f.api('/api/action',{action:'start'});await eventually(async()=>(await f.status()).workflow.state==='failed-manual');assert.deepEqual(f.runs().map(r=>r.target),['emulator','live']);
    await f.api('/api/config',{firebaseMode:'live',firebaseLivePhase:'full'});f.repair();await f.api('/api/action',{action:'resume'});
    await eventually(async()=>{const s=await f.status();return s.workflow.firebase.phase==='complete'&&s.run.state==='passed'});
    assert.deepEqual(f.runs().map(r=>[r.target,r.type]),[['emulator','full'],['live','verification'],['emulator','delta'],['live','verification']]);
    assert.equal((await f.status()).workflow.firebase.livePhase,'verification');
  }finally{await f.close()}
});
test('Play Store: settings survive operator restart; interrupted emulator run keeps its mode; stop cleans owned session',async()=>{
  const f=await firebaseFixture({gateDelay:4000});try{
    await f.start();await f.api('/api/config',{firebaseMode:'emulator',testType:'full'});await f.stop();await f.start();assert.equal((await f.status()).config.firebaseMode,'emulator');
    await f.api('/api/action',{action:'start'});await eventually(()=>f.runs().length===1);const pids=(await f.status()).firebase.emulator.pids;
    await f.api('/api/action',{action:'pause'});const saved=JSON.parse(fs.readFileSync(path.join(f.data,'play-store-pause.json')));assert.equal(saved.workflow.firebase.mode,'emulator');assert.equal(saved.workflow.firebase.phase,'emulator-full');
    await f.api('/api/config',{firebaseMode:'live'});await f.api('/api/action',{action:'resume'});assert.equal((await f.status()).workflow.firebase.mode,'emulator');
    await f.api('/api/action',{action:'stop'});await eventually(async()=>(await f.status()).firebase.emulator.status==='stopped');for(const pid of pids)assert.throws(()=>process.kill(pid,0));
  }finally{await f.close()}
});
test('Play Store: native and hosted mobile expose matching persistent target, live phase and timestamped telemetry controls',()=>{
  for(const name of ['public/index.html','test/fixtures/website/yardmaster.astro']){const s=fs.readFileSync(new URL('../'+name,import.meta.url),'utf8');for(const id of ['firebaseMode','firebaseLivePhase','firebaseStatus'])assert.ok(s.includes('id="'+id+'"'));for(const mode of ['emulator','live','both'])assert.ok(s.includes('value="'+mode+'"'))}
});

for(const mode of ['emulator','both'])test('Play Store: connected FULL emulator -> failure -> handoff -> delayed reply -> versioned ZIP apply -> local delta -> '+mode+' completion',async()=>{const f=await createContinuousLoopFixture({firebaseMode:mode});try{await f.api('/api/action',{action:'start'});await driveFirebaseCycles(f,{mode})}finally{await f.close()}});

test('Play Store: operator crash triggers IPC watchdog cleanup, preserves local run for restart and never leaves orphan emulators',async()=>{const f=await firebaseFixture({gateDelay:4000});try{await f.start();await f.api('/api/action',{action:'start'});await eventually(()=>f.runs().length===1);const pids=(await f.status()).firebase.emulator.pids;await f.crash();await eventually(()=>pids.every(pid=>{try{process.kill(pid,0);return false}catch{return true}}));await f.start();assert.equal((await f.status()).workflow.firebase.mode,'emulator');assert.equal((await f.status()).workflow.firebase.target,'emulator')}finally{await f.close()}});


test('Play Store: assistant RUN Playwright retains the saved BOTH target and repairs locally before one bounded live recheck',async()=>{const f=await firebaseFixture({mode:'both',failLive:true});try{await f.start();await f.api('/api/config',{testType:'playwright'});await f.api('/api/action',{action:'start'});await eventually(async()=>(await f.status()).workflow.state==='failed-manual');await f.api('/api/config',{firebaseMode:'live',firebaseLivePhase:'full'});f.repair();await f.api('/api/command',{text:'YARDMASTER\nRUN playwright\nEND'});await eventually(async()=>(await f.status()).workflow.firebase.phase==='complete');assert.deepEqual(f.runs().map(r=>r.target+':'+r.type),['emulator:full','live:verification','emulator:delta','live:verification'])}finally{await f.close()}});

test('Play Store: self-heal test children inherit the saved target and block remote Firebase even without a ready bridge',async()=>{const env=firebaseEnvironment({run:newFirebaseRun({firebaseMode:'emulator'})});const r=await runSelfHealProcess(process.execPath,['-e',"const a=require('assert');a.equal(process.env.YARDMASTER_FIREBASE_MODE,'emulator');a.equal(process.env.GCLOUD_PROJECT,'demo-86chaos');a.throws(()=>require('net').connect(443,'firestore.googleapis.com'),/blocked non-local/)"],{env,timeoutMs:10000});assert.equal(r.code,0,r.stderr);const canary=await canaryHealthCheck((await import('./helpers/firebase-fixture.mjs')).appRoot,{env});assert.equal(canary.firebaseMode,'emulator')});
