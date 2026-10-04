// Controlled process/Hub/bridge fixtures. No Firebase SDK or cloud service is
// mocked inside Yardmaster; production still launches the official Firebase CLI.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {FirebaseSession} from '../../automation/firebase-target.mjs';
import {fixtureFirebaseTools} from './firebase-fixture-tooling.mjs';
import {stopFixture} from './fixture-cleanup.mjs';
import {eventually} from './continuous-loop-fixture.mjs';
export const appRoot=fileURLToPath(new URL('../../',import.meta.url));
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p}
export async function firebaseFixture({mode='emulator',livePhase='verification',failFull=false,failLive=false,gateDelay=0}={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster-firebase-')),repo=path.join(root,'repo'),data=path.join(root,'operator');fs.mkdirSync(repo,{recursive:true});fs.mkdirSync(data);
  const products=['auth','firestore','functions','database','storage'],emulators={};
  for(const p of [...products,'hub'])emulators[p]={host:'127.0.0.1',port:await freePort()};
  const appPort=await freePort(),operatorPort=await freePort(),url='http://127.0.0.1:'+operatorPort;
  const bridge={schema:1,projectId:'demo-86chaos',products,localApp:{url:'http://127.0.0.1:'+appPort,startScript:'local-app',readyPath:'/api/firebase-target'},scripts:{full:'test:play-store',delta:'test:play-store:delta',playwright:'test:playwright',liveVerification:'test:firebase:live-verification'}};
  const scripts={'local-app':'node local-app.mjs','test:play-store':'node gate.mjs full','test:play-store:delta':'node gate.mjs delta','test:playwright':'node gate.mjs playwright','test:firebase:live-verification':'node gate.mjs verification'};
  fs.writeFileSync(path.join(repo,'package.json'),JSON.stringify({name:'86chaos',version:'1.0.0',type:'module',scripts}));
  fs.writeFileSync(path.join(repo,'yardmaster-firebase-fixture.marker'),'isolated Firebase process fixture');
  fs.writeFileSync(path.join(repo,'yardmaster.firebase.json'),JSON.stringify(bridge));fs.writeFileSync(path.join(repo,'firebase.json'),JSON.stringify({emulators}));
  const fakeCli=path.join(repo,'node_modules/firebase-tools/lib/bin/firebase.js');fs.mkdirSync(path.dirname(fakeCli),{recursive:true});
  fs.writeFileSync(fakeCli,`const http=require('http'),fs=require('fs');const args=process.argv.slice(2);fs.writeFileSync('cli-args.json',JSON.stringify(args));if(args[0]!=='emulators:start'||args[args.indexOf('--project')+1]!=='demo-86chaos')process.exit(2);const cfg=JSON.parse(fs.readFileSync(args[args.indexOf('--config')+1]));const entries=Object.fromEntries(Object.entries(cfg.emulators).filter(([k])=>!['ui','singleProjectMode'].includes(k)));const servers=Object.entries(entries).map(([name,e])=>http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(name==='hub'?entries:{ready:true}))}).listen(e.port,e.host));process.on('SIGTERM',()=>{for(const s of servers)s.close();process.exit(0)});`);
  fs.writeFileSync(path.join(repo,'local-app.mjs'),`import http from 'node:http';const products=${JSON.stringify(products)};const server=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({target:process.env.CHAOS_FIREBASE_TARGET,projectId:process.env.GCLOUD_PROJECT,blockLiveFirebase:process.env.CHAOS_BLOCK_LIVE_FIREBASE==='1',products}))}).listen(${appPort},'127.0.0.1');process.on('SIGTERM',()=>server.close(()=>process.exit(0)));`);
  fs.writeFileSync(path.join(repo,'gate.mjs'),`import fs from 'node:fs';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';const type=process.argv[2],file='phase-runs.json';const runs=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):[];const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/FIREBASE|EMULATOR|GCLOUD|BASE_URL|NODE_OPTIONS/.test(k)));assert.equal(env.GCLOUD_PROJECT,env.YARDMASTER_FIREBASE_TARGET==='live'?'chaos-test-d1601':'demo-86chaos');if(env.YARDMASTER_FIREBASE_TARGET==='emulator'){assert.ok(env.FIRESTORE_EMULATOR_HOST);assert.ok(env.FIREBASE_AUTH_EMULATOR_HOST);assert.ok(env.FIREBASE_STORAGE_EMULATOR_HOST);assert.ok(env.FIREBASE_DATABASE_EMULATOR_HOST);assert.ok(env.FIREBASE_FUNCTIONS_EMULATOR_HOST);assert.equal(env.CHAOS_BLOCK_LIVE_FIREBASE,'1');assert.ok(env.PLAYWRIGHT_BASE_URL.startsWith('http://127.0.0.1:'));}else assert.equal(env.FIRESTORE_EMULATOR_HOST,undefined);runs.push({type,target:env.YARDMASTER_FIREBASE_TARGET,mode:env.YARDMASTER_FIREBASE_MODE,env});fs.writeFileSync(file,JSON.stringify(runs));if(type==='full'||type==='playwright'){const nested=spawnSync(process.execPath,['-e',"const assert=require('assert');assert.equal(process.env.GCLOUD_PROJECT,'"+env.GCLOUD_PROJECT+"');assert.equal(process.env.YARDMASTER_FIREBASE_TARGET,'"+env.YARDMASTER_FIREBASE_TARGET+"')"],{env:process.env});assert.equal(nested.status,0)}if(env.YARDMASTER_FIREBASE_TARGET==='live'&&process.env.YARDMASTER_FIREBASE_TELEMETRY_FILE)fs.writeFileSync(process.env.YARDMASTER_FIREBASE_TELEMETRY_FILE,JSON.stringify({liveFirebaseContacted:false,fixture:true}));await new Promise(r=>setTimeout(r,${gateDelay}));const fail=(type==='full'&&env.YARDMASTER_FIREBASE_TARGET==='emulator'&&fs.existsSync('fail-full'))||(env.YARDMASTER_FIREBASE_TARGET==='live'&&fs.existsSync('fail-live'));console.log('tests 1');console.log(fail?'fail 1':'pass 1');process.exitCode=fail?1:0;`);
  if(failFull)fs.writeFileSync(path.join(repo,'fail-full'),'1');if(failLive)fs.writeFileSync(path.join(repo,'fail-live'),'1');
  const git=args=>execFileSync('git',args,{cwd:repo,encoding:'utf8',stdio:'pipe'}).trim();git(['init','-b','testing']);git(['config','user.email','fixture@example.invalid']);git(['config','user.name','Firebase Fixture']);git(['add','.']);git(['commit','-m','fixture']);
  fs.writeFileSync(path.join(data,'config.json'),JSON.stringify({repositoryPath:repo,branch:'testing',firebaseMode:mode,firebaseLivePhase:livePhase,testType:'delta',autoHandoff:false,autoUpdateOperator:false,autoSelfHeal:false,autoPush:false,waitForDeploy:false,automationDefaultsVersion:7}));
  let app=null,output='',crashFailure='';const sessions=new Set();
  const api=async(route,body)=>{const r=await fetch(url+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const result=await r.json();if(!r.ok)throw new Error(result.error);return result};
  const start=async()=>{app=spawn(process.execPath,['server.mjs'],{cwd:appRoot,env:{...process.env,YARDMASTER_PORT:String(operatorPort),YARDMASTER_DATA_DIR:data,YARDMASTER_DISABLE_UPDATE_CHECKS:'1',YARDMASTER_TEST_PROCESS_STATE_STUB:'1',YARDMASTER_TEST_FIREBASE_TOOLS:'1'},stdio:'pipe'});app.once('close',()=>{app.yardmasterFixtureClosed=true});app.stdout.on('data',x=>output+=x);app.stderr.on('data',x=>output+=x);await eventually(async()=>{if(app.exitCode!==null)throw new Error(output);return (await api('/api/status')).online})};
  const stop=async()=>{
    if(!app||app.yardmasterFixtureClosed)return;
    const owned=(await api('/api/status')).firebase.emulator;
    const pids=[...(owned.pids||[]),...(owned.testPids||[])];
    // Windows cleanup inventories descendants and terminates their trees with
    // separate 15-second deadlines. Do not kill the operator halfway through
    // that cleanup with the shared fixture's shorter eight-second grace period.
    await stopFixture({child:app,graceMs:45000,shutdown:()=>api('/api/action',{action:'shutdown-operator'}),remove:()=>{}});
    await eventually(()=>pids.every(pid=>{try{process.kill(pid,0);return false}catch{return true}}),{timeout:30000});
  };
  const runs=()=>{try{return JSON.parse(fs.readFileSync(path.join(repo,'phase-runs.json')))}catch{return []}};
  const session=(options={})=>{const s=new FirebaseSession({repo,appRoot,dataDir:path.join(root,'session'),timeoutMs:30000,detect:fixtureFirebaseTools,...options});sessions.add(s);return s};
  return {root,repo,data,url,bridge,emulators,api,runs,git,start,stop,session,output:()=>output,status:()=>api('/api/status'),async crash(){const owned=(await api('/api/status')).firebase.emulator;const pids=[...(owned.pids||[]),...(owned.testPids||[])];const done=new Promise(r=>app.once('close',r));app.kill('SIGKILL');await done;await eventually(()=>pids.every(pid=>{try{process.kill(pid,0);return false}catch{return true}})).catch(error=>{crashFailure='Crash cleanup left owned PIDs '+pids.filter(pid=>{try{process.kill(pid,0);return true}catch{return false}}).join(',')+' alive. Operator output: '+output.slice(-4000);throw new Error(crashFailure,{cause:error})})},repair(){for(const f of ['fail-full','fail-live'])fs.rmSync(path.join(repo,f),{force:true})},async close(){await stop();await Promise.all([...sessions].map(s=>s.stop()));await fs.promises.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100}).catch(error=>{let last;try{last=JSON.parse(fs.readFileSync(path.join(data,'state.json'),'utf8'))}catch{}throw new Error((crashFailure||'Fixture cleanup failed')+'\n'+error.message+'\nLast operator state: '+JSON.stringify({workflow:last?.workflow,firebase:last?.firebase,run:last?.run,output:output.slice(-4000)}),{cause:error})})}};
}
