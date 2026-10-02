import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import crypto from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {stopFixture} from './fixture-cleanup.mjs';
import {sourceEntries,storedZipEntries} from './continuous-loop-boundaries.mjs';
import {writeStoredZip} from '../../automation/handoff-diagnostics.mjs';
export const projectRoot=fileURLToPath(new URL('../../',import.meta.url));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function eventually(fn,{timeout=45000}={}){const end=Date.now()+timeout;let last;while(Date.now()<end){try{const value=await fn();if(value)return value}catch(e){if(e.fatal)throw e;last=e}await pause(process.platform==='win32'?150:50)}throw last||new Error('Continuous loop fixture timed out')}
const chatHTML='<!doctype html><title>Simulated ChatGPT</title><div id="selection"></div><form><input type="file"><textarea></textarea><button type="submit">Send</button></form><main></main><script>document.querySelector("form").onsubmit=e=>{e.preventDefault();const a=document.createElement("article");a.dataset.messageAuthorRole="user";a.textContent=document.querySelector("textarea").value;document.querySelector("main").append(a);const b=document.createElement("button");b.id="generation";b.setAttribute("aria-label","Stop generating");b.textContent="Stop generating";document.body.append(b)};</script>';
export async function createContinuousLoopFixture({chatPage=null,initialLevel=0,firebaseMode=null,repairMetadataCollision=false}={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster-continuous-')),data=path.join(root,'data'),sandbox=path.join(data,'sandbox'),repo=path.join(sandbox,'repo'),remote=path.join(sandbox,'remote.git'),trace=path.join(data,'gate-runs.json');fs.mkdirSync(repo,{recursive:true});fs.writeFileSync(path.join(sandbox,'fixture.marker'),'isolated continuous loop');
  const git=args=>execFileSync('git',args,{cwd:repo,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  fs.mkdirSync(path.join(repo,'src'));fs.writeFileSync(path.join(repo,'src/value.json'),JSON.stringify({level:initialLevel}));
  const pkg={name:'yardmaster-continuous-loop-fixture',version:'1.0.0',type:'module',scripts:{'test:play-store':'node gate.mjs full','test:play-store:delta':'node gate.mjs delta','test:current-release-targeted':'node gate.mjs targeted'}};fs.writeFileSync(path.join(repo,'package.json'),JSON.stringify(pkg,null,2));
  fs.writeFileSync(path.join(repo,'gate.mjs'),`import fs from 'node:fs';import assert from 'node:assert/strict';const file=process.env.YARDMASTER_LOOP_TEST_TRACE;const runs=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):[];const level=JSON.parse(fs.readFileSync('src/value.json')).level;const run={index:runs.length+1,type:process.argv[2],level};runs.push(run);fs.writeFileSync(file,JSON.stringify(runs));console.log('tests 1');try{assert.ok(level>=1,'initial fixture requires a repair');if(run.index===3)assert.ok(level>=2,'post-deployment failure requires a second repair');console.log('pass 1')}catch(e){console.error(e.message);console.log('fail 1');process.exitCode=1}`);
  fs.mkdirSync(path.join(repo,'fixture-files'));for(let i=0;i<60;i++)fs.writeFileSync(path.join(repo,'fixture-files',i+'.txt'),'preserved fixture '+i);
  if(firebaseMode){const {firebaseFixture}=await import('./firebase-fixture.mjs'),em=await firebaseFixture();try{for(const name of ['yardmaster.firebase.json','firebase.json','local-app.mjs','node_modules/firebase-tools/lib/bin/firebase.js','yardmaster-firebase-fixture.marker']){const target=path.join(repo,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(em.repo,name),target)}pkg.scripts['local-app']='node local-app.mjs';pkg.scripts['test:playwright']='node gate.mjs playwright';pkg.scripts['test:firebase:live-verification']='node gate.mjs verification';fs.writeFileSync(path.join(repo,'package.json'),JSON.stringify(pkg,null,2));let gate=fs.readFileSync(path.join(repo,'gate.mjs'),'utf8');gate=gate.replace('const run={index:runs.length+1,type:process.argv[2],level};','const run={index:runs.length+1,type:process.argv[2],level,target:process.env.YARDMASTER_FIREBASE_TARGET};if(run.target==="emulator"){assert.equal(process.env.GCLOUD_PROJECT,"demo-86chaos");assert.ok(process.env.FIRESTORE_EMULATOR_HOST)}');gate=gate.replace("if(run.index===3)assert.ok(level>=2,'post-deployment failure requires a second repair')","if(run.target===\"live\")assert.ok(level>=2,'bounded live verification requires a second repair')");fs.writeFileSync(path.join(repo,'gate.mjs'),gate);}finally{await em.close()}}
  git(['init','-b','testing']);git(['config','user.email','continuous-loop@example.invalid']);git(['config','user.name','Yardmaster Loop Fixture']);git(['add','.']);git(['commit','-m','fixture baseline']);execFileSync('git',['init','--bare',remote],{stdio:'ignore'});git(['remote','add','origin',remote]);git(['push','-u','origin','testing']);const baseline=git(['rev-parse','HEAD']);
  const calls=[],chats=[],identityChecks=[],downloads=[],errors=[];let currentChat=null,readyCommit=null,readyBranch='testing',app=null,output='';
  const json=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value))};
  const httpServer=http.createServer(async(req,res)=>{try{
    const url=new URL(req.url,'http://127.0.0.1');
    if(url.pathname==='/api/build-identity'){const commit=git(['--git-dir',remote,'rev-parse','refs/heads/testing']);identityChecks.push({commit,readyCommit,branch:readyBranch});return json(res,{gitBranch:readyBranch,gitCommit:readyCommit||baseline})}
    if(url.pathname==='/chat'){res.writeHead(200,{'Content-Type':'text/html'});return res.end(chatHTML)}
    if(url.pathname.startsWith('/chat/repair/')){res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="repair-'+currentChat.cycle+'.zip"'});return res.end(fs.readFileSync(currentChat.repair))}
    let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw||'{}');calls.push({path:url.pathname,body});
    if(url.pathname==='/chat/start'){
      const cycle=chats.length+1,job={...body,cycle,released:false,activityPolls:0,entries:storedZipEntries(body.artifactPath)};chats.push(job);currentChat=job;
      if(chatPage){await chatPage.goto(base+'/chat?cycle='+cycle);await chatPage.locator('#selection').evaluate((e,text)=>e.textContent=text,body.mode+' | '+body.model+' | '+body.thinkingEffort);await chatPage.locator('input').setInputFiles(body.artifactPath);await chatPage.locator('textarea').fill(body.prompt);await chatPage.getByRole('button',{name:'Send',exact:true}).click()}
      return json(res,{ok:true});
    }
    if(url.pathname==='/chat/eval'){
      const e=body.expression;let value;
      if(e.includes('YM_CHAT_RESPONSE_ACTIVITY'))currentChat.activityPolls++;
      if(chatPage)value=await chatPage.evaluate(e);
      else if(e.includes('YM_CHAT_RESPONSE_ACTIVITY'))value={generating:!currentChat.released,assistantMessages:currentChat.released?1:0,assistantText:currentChat.released?'Complete repair.zip':'',href:base+'/chat?cycle='+currentChat.cycle};
      else if(e.includes('YM_LATEST_ASSISTANT_TEXT'))value=currentChat.released?'Complete repair.zip':'';
      else if(e.includes('const zip=')){value=!!currentChat.released;if(value){const file=path.join(currentChat.downloads,'repair-'+currentChat.cycle+'.zip');fs.copyFileSync(currentChat.repair,file);downloads.push(file)}}
      else value='';
      return json(res,{value});
    }
    return json(res,{error:'Unknown fixture request'},404);
  }catch(error){errors.push(error.stack);json(res,{error:error.message},500)}});
  await new Promise(r=>httpServer.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+httpServer.address().port;
  const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));const url='http://127.0.0.1:'+port;
  fs.writeFileSync(path.join(data,'config.json'),JSON.stringify({...(firebaseMode?{firebaseMode}:{}),repositoryPath:repo,branch:'testing',testType:'full-then-delta',testingUrl:base,autoUpdateOperator:false,autoSelfHeal:false,autoHandoff:true,repoUpdateMode:'automatic',waitForDeploy:true,runAfterDeploy:true,automationDefaultsVersion:7,chatLoopEnabled:true,chatLoopPlan:'Work | GPT-5.6 Sol | High\nChat | GPT-6 Astra | Medium'}));
  const bearer='continuous-loop-fixture-token',deviceId='continuous-phone';fs.writeFileSync(path.join(data,'devices.json'),JSON.stringify({[deviceId]:{name:'Continuous fixture phone',hasPasskey:true}}));fs.writeFileSync(path.join(data,'sessions.json'),JSON.stringify({[crypto.createHash('sha256').update(bearer).digest('hex')]:{deviceId,expiresAt:Date.now()+3600000}}));
  const onDownload=async download=>{try{const file=path.join(currentChat.downloads,'repair-'+currentChat.cycle+'.zip');await download.saveAs(file);downloads.push(file)}catch(e){errors.push(e.stack)}};chatPage?.on('download',onDownload);
  app=spawn(process.execPath,['server.mjs'],{cwd:projectRoot,stdio:'pipe',env:{...process.env,YARDMASTER_DATA_DIR:data,YARDMASTER_PORT:String(port),YARDMASTER_DISABLE_UPDATE_CHECKS:'1',YARDMASTER_TEST_CONTINUOUS_LOOP:'1',...(firebaseMode?{YARDMASTER_TEST_FIREBASE_TOOLS:'1'}:{}),YARDMASTER_LOOP_TEST_TRACE:trace}});app.once('close',()=>{app.yardmasterFixtureClosed=true});app.stdout.on('data',c=>output+=c);app.stderr.on('data',c=>output+=c);
  const api=async(route,body,headers={})=>{const response=await fetch(url+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw new Error(result.error||JSON.stringify(result));return result};
  const status=()=>api('/api/status'),runs=()=>fs.existsSync(trace)?JSON.parse(fs.readFileSync(trace,'utf8')):[];
  const close=async()=>{chatPage?.off('download',onDownload);if(app&&!app.yardmasterFixtureClosed)await stopFixture({child:app,shutdown:()=>api('/api/action',{action:'shutdown-operator'}),remove:()=>{}});httpServer.closeAllConnections();await new Promise(r=>httpServer.close(r));await fs.promises.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100})};
  try{await eventually(async()=>{if(app.exitCode!==null)throw new Error(output);return (await status()).online})}catch(e){await close();throw e}
  return {root,data,repo,remote,url,base,bearer,deviceId,baseline,calls,chats,identityChecks,downloads,errors,api,status,runs,git,close,
    async releaseReply(cycle){const job=chats[cycle-1];const entries=sourceEntries(repo).map(e=>e.name==='package.json'?{name:e.name,data:JSON.stringify({...JSON.parse(e.data),version:'1.0.'+cycle},null,2)}:e.name==='src/value.json'?{name:e.name,data:JSON.stringify({level:cycle})}:e);job.repair=path.join(data,'repair-'+cycle+'.zip');writeStoredZip(job.repair,entries);
      if(repairMetadataCollision){
        const bytes=fs.readFileSync(job.repair),time=bytes.readUInt16LE(10),date=bytes.readUInt16LE(12),stamp=new Date(1980+(date>>9),((date>>5)&15)-1,date&31,time>>11,(time>>5)&63,(time&31)*2);
        for(const name of ['package.json','src/value.json']){const file=path.join(repo,name),incoming=entries.find(e=>e.name===name);if(Buffer.byteLength(incoming.data)!==fs.statSync(file).size)throw new Error('Metadata collision regression requires equal file lengths');fs.utimesSync(file,stamp,stamp)}
      }
      job.released=true;
      if(chatPage)await chatPage.evaluate(cycle=>{document.querySelector('#generation')?.remove();const a=document.createElement('article');a.dataset.messageAuthorRole='assistant';a.textContent='Complete application repair '+cycle;const link=document.createElement('a');link.href='/chat/repair/'+cycle;link.textContent='Download repair.zip';link.download='repair-'+cycle+'.zip';a.append(link);document.querySelector('main').append(a)},cycle);
    },
    releaseDeployment(commit,{branch='testing'}={}){readyCommit=commit;readyBranch=branch}
  };
}

export async function driveContinuousCycles(f,{onPhase=async()=>{}}={}){
  const {default:assert}=await import('node:assert/strict');let previous=f.baseline;
  for(let cycle=1;cycle<=2;cycle++){
    const chat=await eventually(()=>f.chats[cycle-1]?.activityPolls>=1&&f.chats[cycle-1]);
    const held=await f.status();assert.equal(held.workflow.state,'chatgpt');assert.equal(held.workflow.closedLoop,true);assert.equal(held.workflow.fullFirstComplete,true);assert.equal(f.runs().length,cycle===1?1:3);
    assert.equal(JSON.parse(fs.readFileSync(path.join(f.repo,'src/value.json'))).level,cycle-1);
    const inputLevel=JSON.parse(chat.entries.find(e=>e.name==='src/value.json').data.toString()).level;assert.equal(inputLevel,cycle-1);
    assert.ok(chat.entries.some(e=>e.name==='evidence/current-failure.txt'));assert.ok(chat.prompt.includes('COMPLETE APPLICATION ZIP'));
    assert.equal(chat.mode,cycle===1?'Work':'Chat');assert.equal(chat.model,cycle===1?'GPT-5.6 Sol':'GPT-6 Astra');
    await onPhase('waiting-reply',cycle,held);await f.releaseReply(cycle);
    const waiting=await eventually(async()=>{const s=await f.status();if(s.workflow.state==='handoff-error'||s.workflow.state==='push-error')throw new Error(s.workflow.error||JSON.stringify(s.activity.slice(-5)));return s.deployment.state==='Waiting'&&s.deployment.expectedCommit!==previous&&s},{timeout:120000});
    const commit=waiting.deployment.expectedCommit;assert.equal(f.runs().length,cycle===1?2:4);assert.notEqual(commit,previous);
    assert.equal(f.git(['--git-dir',f.remote,'rev-parse','refs/heads/testing']),commit);assert.equal(JSON.parse(fs.readFileSync(path.join(f.repo,'package.json'))).version,'1.0.'+cycle);
    assert.equal(waiting.config.testType,'full-then-delta');assert.equal(waiting.run.testType,'delta');
    await eventually(()=>f.identityChecks.some(x=>x.commit===commit));await onPhase('waiting-deployment',cycle,waiting);
    // Matching the commit on the wrong branch must never launch local tests.
    f.releaseDeployment(commit,{branch:'main'});await eventually(()=>f.identityChecks.some(x=>x.commit===commit&&x.branch==='main'));
    assert.equal(f.runs().length,cycle===1?2:4);assert.equal((await f.status()).deployment.state,'Waiting');
    f.releaseDeployment(commit);previous=commit;
  }
  const done=await eventually(async()=>{const s=await f.status();return s.workflow.state==='complete'&&!s.workflow.closedLoop&&s.run.state==='passed'&&s});
  assert.deepEqual(f.runs().map(x=>x.type),['full','delta','delta','delta','delta']);assert.deepEqual(f.runs().map(x=>x.level),[0,1,1,2,2]);assert.equal(done.workflow.repairAttempts,2);assert.equal(f.chats.length,2);assert.equal(f.downloads.length,2);assert.deepEqual(f.errors,[]);
  const history=done.runHistory.slice(0,5).reverse();assert.deepEqual(history.map(x=>x.exitCode),[1,0,1,0,0]);assert.deepEqual(history.map(x=>x.testType),['full','delta','delta','delta','delta']);
  assert.equal(done.deployment.deployedCommit,previous);assert.equal(done.config.testType,'full-then-delta');await onPhase('complete',2,done);return done;
}

export async function driveFirebaseCycles(f,{mode='emulator',onPhase=async()=>{}}={}){
  const {default:assert}=await import('node:assert/strict');let pids=null;
  for(let cycle=1;cycle<=(mode==='both'?2:1);cycle++){
    // The next handoff spans ZIP application, local delta and live verification.
    // Use the same bounded cycle budget as completion, including native npm startup.
    const chat=await eventually(async()=>{const s=await f.status();if(['firebase-blocked','handoff-error'].includes(s.workflow.state))throw Object.assign(new Error(JSON.stringify({workflow:s.workflow,firebase:s.firebase,run:s.run,activity:s.activity.slice(-10)})),{fatal:true});return f.chats[cycle-1]?.activityPolls>=1&&f.chats[cycle-1]},{timeout:120000}).catch(async error=>{const s=await f.status();throw new Error(error.message+'\nWaiting for Firebase repair handoff '+cycle+': '+JSON.stringify({workflow:s.workflow,run:s.run,activity:s.activity.slice(-10),runs:f.runs()}),{cause:error})});const held=await f.status();
    assert.equal(held.workflow.firebase.mode,mode);assert.equal(held.workflow.firebase.target,'emulator');assert.equal(held.firebase.emulator.status,'running');
    if(pids)assert.deepEqual(held.firebase.emulator.pids,pids);else pids=held.firebase.emulator.pids;
    assert.ok(chat.entries.some(e=>e.name==='evidence/current-failure.txt'));assert.equal(JSON.parse(chat.entries.find(e=>e.name==='src/value.json').data.toString()).level,cycle-1);
    await onPhase('waiting-reply',cycle,held);await f.releaseReply(cycle);
  }
  let last;const done=await eventually(async()=>{const s=await f.status();last=s;if(['firebase-blocked','handoff-error','error','repair-error'].includes(s.workflow.state))throw Object.assign(new Error(JSON.stringify({workflow:s.workflow,firebase:s.firebase,activity:s.activity.slice(-8),run:s.run})),{fatal:true});return s.workflow.state==='complete'&&s.run.state==='passed'&&s},{timeout:120000}).catch(error=>{throw new Error(error.message+'\nLast operator state: '+JSON.stringify({workflow:last?.workflow,firebase:last?.firebase,run:last?.run,activity:last?.activity?.slice(-15),runs:f.runs()}),{cause:error})});
  assert.deepEqual(f.runs().map(r=>r.type),mode==='both'?['full','delta','verification','delta','verification']:['full','delta']);
  assert.deepEqual(f.runs().map(r=>r.target),mode==='both'?['emulator','emulator','live','emulator','live']:['emulator','emulator']);
  assert.equal(done.workflow.firebase.fallbackAttempted,false);assert.equal(done.workflow.firebase.liveVerificationAttempts,mode==='both'?2:0);assert.equal(f.identityChecks.length,0);
  assert.equal(f.git(['--git-dir',f.remote,'rev-parse','refs/heads/testing']),f.baseline);await onPhase('complete',mode==='both'?2:1,done);return done;
}
