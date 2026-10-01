import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import {runPowerShellClipboardCommand,adoptRunningReleaseGate} from './windows-operator.mjs';

const delay=ms=>new Promise(r=>setTimeout(r,ms));

function crc32(buffer){
  let crc=0xffffffff;
  for(const byte of buffer){
    crc^=byte;
    for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}
function dosDateTime(){
  const d=new Date(),year=Math.max(1980,d.getFullYear()),month=d.getMonth()+1,day=d.getDate(),hour=d.getHours(),minute=d.getMinutes(),second=d.getSeconds();
  return {time:(hour<<11)|(minute<<5)|(second>>1),date:((year-1980)<<9)|(month<<5)|day};
}
function storedZip(entries){
  const local=[],central=[];let offset=0;const {time,date}=dosDateTime();
  for(const entry of entries){
    const name=String(entry.name).replace(/\\/g,'/'),data=Buffer.isBuffer(entry.data)?entry.data:Buffer.from(String(entry.data),'utf8'),nameBuf=Buffer.from(name,'utf8'),crc=crc32(data);
    const l=Buffer.alloc(30);l.writeUInt32LE(0x04034b50,0);l.writeUInt16LE(20,4);l.writeUInt16LE(0x0800,6);l.writeUInt16LE(0,8);l.writeUInt16LE(time,10);l.writeUInt16LE(date,12);l.writeUInt32LE(crc,14);l.writeUInt32LE(data.length,18);l.writeUInt32LE(data.length,22);l.writeUInt16LE(nameBuf.length,26);
    local.push(l,nameBuf,data);
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x0800,8);c.writeUInt16LE(0,10);c.writeUInt16LE(time,12);c.writeUInt16LE(date,14);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(nameBuf.length,28);c.writeUInt32LE(offset,42);
    central.push(c,nameBuf);offset+=30+nameBuf.length+data.length;
  }
  const centralBuffer=Buffer.concat(central),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(centralBuffer.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,centralBuffer,end]);
}
function filesRecursive(root){
  const out=[];
  const walk=dir=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory()){if(entry.name!=='.git'&&entry.name!=='node_modules')walk(full)}else if(entry.isFile())out.push(full)}};
  walk(root);return out.sort();
}
function zipDirectory(root,outPath,extra=[]){
  const entries=filesRecursive(root).map(full=>({name:path.relative(root,full).replace(/\\/g,'/'),data:fs.readFileSync(full)}));
  entries.push(...extra);
  fs.mkdirSync(path.dirname(outPath),{recursive:true});
  fs.writeFileSync(outPath,storedZip(entries));
  return outPath;
}
function git(cwd,args,opts={}){const out=execFileSync('git',args,{cwd,encoding:'utf8',windowsHide:true,stdio:opts.stdio||['ignore','pipe','pipe']});return typeof out==='string'?out.trim():''}
function safeRemove(p){try{fs.rmSync(p,{recursive:true,force:true,maxRetries:5,retryDelay:100})}catch{}}

export function createSandboxFixture(dataDir,{id=Date.now().toString()}={}){
  const root=path.join(dataDir,'self-test',String(id)),repo=path.join(root,'repo'),remote=path.join(root,'remote.git');
  safeRemove(root);fs.mkdirSync(path.join(repo,'src'),{recursive:true});fs.mkdirSync(path.join(repo,'fixture-files'),{recursive:true});
  fs.writeFileSync(path.join(repo,'package.json'),JSON.stringify({
    name:'yardmaster-self-test-fixture',version:'0.0.1',private:true,type:'module',
    scripts:{test:'node test.mjs','test:play-store:delta':'node test.mjs','test:current-release-targeted':'node test.mjs','test:play-store':'node test.mjs'}
  },null,2)+'\n');
  fs.writeFileSync(path.join(repo,'src','value.js'),"export const value='BROKEN';\n");
  fs.writeFileSync(path.join(repo,'test.mjs'),"import assert from 'node:assert/strict';import {value} from './src/value.js';assert.equal(value,'REPAIRED');console.log('tests 1');console.log('pass 1');\n");
  fs.writeFileSync(path.join(repo,'README.md'),'Disposable Yardmaster full-process self-test fixture.\n');
  for(let i=0;i<64;i++)fs.writeFileSync(path.join(repo,'fixture-files',String(i).padStart(2,'0')+'.txt'),'yardmaster-self-test-'+i+'\n');
  git(root,['init','--bare',remote],{stdio:'ignore'});
  git(repo,['init','-b','testing'],{stdio:'ignore'});
  git(repo,['config','user.email','yardmaster-self-test@example.invalid']);
  git(repo,['config','user.name','Yardmaster Self Test']);
  git(repo,['remote','add','origin',remote]);
  git(repo,['add','-A']);git(repo,['commit','-m','self-test baseline']);git(repo,['push','-u','origin','testing'],{stdio:'ignore'});
  return {root,repo,remote};
}

export async function runFixtureTest(repo,{timeoutMs=15000}={}){
  const started=Date.now();
  return await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,['test.mjs'],{cwd:repo,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='',done=false;
    const finish=(err,result)=>{if(done)return;done=true;clearTimeout(timer);err?reject(err):resolve({...result,elapsedMs:Date.now()-started,stdout,stderr})};
    child.stdout.on('data',d=>stdout+=String(d));child.stderr.on('data',d=>stderr+=String(d));
    child.on('error',e=>finish(e));
    child.on('close',code=>finish(null,{code:Number(code)}));
    const timer=setTimeout(()=>{try{child.kill()}catch{}finish(new Error('Sandbox fixture test timed out.'))},timeoutMs);
  });
}

function sandboxGatePaths(workspace,runId){
  const root=path.join(workspace.repo,'test-results','86chaos-play-store-release-gate'),runDir=path.join(root,runId);
  return {root,runDir,statePath:path.join(runDir,'runner-state.json'),lockPath:path.join(root,'.current-run.lock'),lastPath:path.join(root,'.last-run.json'),logDir:path.join(runDir,'runner-logs')};
}
export function startSandboxManualGate(workspace,{mode='failed+new'}={}){
  const runId='sandbox-'+Date.now(),p=sandboxGatePaths(workspace,runId);fs.mkdirSync(p.logDir,{recursive:true});
  const runner=path.join(workspace.root,'sandbox-manual-gate-runner.mjs');
  const source=`import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
const runDir=${JSON.stringify(p.runDir)},statePath=${JSON.stringify(p.statePath)},logDir=${JSON.stringify(p.logDir)},repo=${JSON.stringify(workspace.repo)};
const save=o=>fs.writeFileSync(statePath,JSON.stringify(o,null,2));
const state={runId:${JSON.stringify(runId)},mode:${JSON.stringify(mode)},currentPhase:'environment-preflight',status:'running',playwrightStarted:false,playwrightCompleted:false,lastCompletedStep:'',blockingReason:'',finalExitCode:null,startedAt:new Date().toISOString()};
save(state);await new Promise(r=>setTimeout(r,450));state.currentPhase='playwright';state.playwrightStarted=true;save(state);
const result=spawnSync(process.execPath,['test.mjs'],{cwd:repo,encoding:'utf8'});fs.writeFileSync(path.join(logDir,'sandbox-play-store.log'),String(result.stdout||'')+String(result.stderr||''));
state.playwrightCompleted=true;state.lastCompletedStep='sandbox fixture';state.currentPhase='report-collection';state.finalExitCode=Number(result.status||0);state.status=state.finalExitCode===0?'passed':'failed';state.finishedAt=new Date().toISOString();save(state);await new Promise(r=>setTimeout(r,400));process.exit(state.finalExitCode);`;
  fs.writeFileSync(runner,source,'utf8');
  const child=spawn(process.execPath,[runner],{cwd:workspace.root,windowsHide:true,stdio:'ignore'});
  fs.writeFileSync(p.lockPath,JSON.stringify({runId,pid:child.pid,startedAt:new Date().toISOString(),runDir:p.runDir},null,2));
  fs.writeFileSync(p.lastPath,JSON.stringify({runId,runDir:p.runDir,mode,updatedAt:new Date().toISOString()},null,2));
  child.on('close',()=>{try{fs.rmSync(p.lockPath,{force:true})}catch{}});
  return {child,...p,runId,mode};
}
export async function adoptSandboxManualGate(workspace,{mode='failed+new',onLine=()=>{},onState=()=>{}}={}){
  startSandboxManualGate(workspace,{mode});
  return await new Promise((resolve,reject)=>{
    let controller;
    const deadline=Date.now()+6000;
    const connect=()=>{
      try{
        controller=adoptRunningReleaseGate({repoPath:workspace.repo,onLine,onState,onFinish:(code,snapshot)=>resolve({code,snapshot,controller})});
      }catch(error){
        if(Date.now()>=deadline){reject(error);return}
        setTimeout(connect,100);
      }
    };
    connect();
  });
}

export function buildSandboxHandoff(workspace,outPath){
  const prompt=[
    'YARDMASTER FULL PROCESS SANDBOX TEST',
    '',
    'This is a disposable Yardmaster fixture, NOT the 86 Chaos application.',
    'FIRST, before creating the repaired ZIP, return exactly one Yardmaster PowerShell instruction block that creates the marker file:',
    'YARDMASTER',
    'POWERSHELL',
    "Set-Content -LiteralPath '.\\chatgpt-powershell-marker.txt' -Value 'CHATGPT-POWERSHELL-ROUNDTRIP'",
    'END_POWERSHELL',
    'END',
    '',
    'Wait for Yardmaster to send the PowerShell command result back to you.',
    'THEN make exactly this tiny repair:',
    "- Change src/value.js so it exports value='REPAIRED'.",
    '- Bump package.json version from 0.0.1 to 0.0.2.',
    '- Preserve every other file.',
    '- Return ONE COMPLETE APPLICATION ZIP containing the entire repaired fixture.',
    '- Do not use GitHub, Vercel, Firebase, 86 Chaos, credentials, or any external deployment.'
  ].join('\n');
  return zipDirectory(workspace.repo,outPath,[{name:'YARDMASTER_PROMPT.txt',data:prompt+'\n'}]);
}
export function sandboxChatPrompt(){
  return "Yardmaster full-process sandbox test. The attached ZIP contains YARDMASTER_PROMPT.txt. Follow it in order: FIRST return the exact POWERSHELL instruction block from the file so Yardmaster can copy/paste your command into PowerShell and report the result back to you. AFTER that result returns, repair the tiny disposable fixture and return ONE COMPLETE APPLICATION ZIP. Do not access or modify 86 Chaos, GitHub, Vercel, Firebase, production, or any external service.";
}

export function createKnownGoodSandboxRepair(workspace,outPath){
  const temp=path.join(workspace.root,'known-good-repair');safeRemove(temp);fs.cpSync(workspace.repo,temp,{recursive:true,filter:src=>!src.split(path.sep).includes('.git')});
  fs.writeFileSync(path.join(temp,'src','value.js'),"export const value='REPAIRED';\n");
  const pkg=JSON.parse(fs.readFileSync(path.join(temp,'package.json'),'utf8'));pkg.version='0.0.2';fs.writeFileSync(path.join(temp,'package.json'),JSON.stringify(pkg,null,2)+'\n');
  const result=zipDirectory(temp,outPath);safeRemove(temp);return result;
}

export function applySandboxRepair({appRoot,workspace,repairPath}){
  if(process.platform!=='win32')throw new Error('The full sandbox apply test currently requires Windows.');
  const script=path.join(appRoot,'scripts','Apply-Repair.ps1');
  execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-RepoPath',workspace.repo,'-ZipPath',repairPath],{cwd:appRoot,encoding:'utf8',windowsHide:true,maxBuffer:10*1024*1024});
  const pkg=JSON.parse(fs.readFileSync(path.join(workspace.repo,'package.json'),'utf8'));
  if(pkg.version!=='0.0.2')throw new Error('Sandbox repair did not bump the fixture version to 0.0.2.');
  return pkg.version;
}
export function commitAndPushSandbox(workspace){
  git(workspace.repo,['add','-A']);
  const status=git(workspace.repo,['status','--porcelain']);
  if(!status)throw new Error('Sandbox repair produced no Git changes.');
  git(workspace.repo,['commit','-m','Yardmaster self-test repair']);
  git(workspace.repo,['push','origin','testing'],{stdio:'ignore'});
  const local=git(workspace.repo,['rev-parse','HEAD']),remote=git(workspace.root,['--git-dir',workspace.remote,'rev-parse','refs/heads/testing']);
  if(local!==remote)throw new Error('Sandbox local Git push identity did not match the local bare remote.');
  return local;
}
export function verifySandboxDeploymentIdentity(workspace,commit){
  const remote=git(workspace.root,['--git-dir',workspace.remote,'rev-parse','refs/heads/testing']);
  if(remote!==commit)throw new Error('Sandbox deployment identity did not match the pushed commit.');
  return {gitBranch:'testing',gitCommit:remote};
}
function checkCanceled(shouldCancel){if(shouldCancel?.())throw new Error('Yardmaster self-test was stopped by the user.')}
function selfTestDiagnosticPaths(dataDir,id){
  const root=path.join(dataDir,'self-test-diagnostics');fs.mkdirSync(root,{recursive:true});
  return {root,json:path.join(root,'Yardmaster-Self-Test-Diagnostic-'+id+'.json'),zip:path.join(root,'Yardmaster-Self-Test-Diagnostic-'+id+'.zip')};
}
function safeDiagnosticFiles(dir,prefix){
  const entries=[];if(!dir||!fs.existsSync(dir))return entries;
  for(const full of filesRecursive(dir)){
    const rel=path.relative(dir,full).replace(/\\/g,'/');
    if(/clipboard-command\.ps1$|clipboard-paste\.ps1$|powershell-bootstrap\.ps1$|powershell-startup-error\.txt$|powershell-pid\.txt$|powershell-launch\.cmd$|powershell-launch-exit\.txt$|powershell-transcript\.txt$|ready\.txt$|done\.json$|ui-state\.json$/i.test(rel))entries.push({name:prefix+'/'+rel,data:fs.readFileSync(full)});
  }
  return entries;
}
function writeSelfTestTrace(paths,trace){
  fs.writeFileSync(paths.json,JSON.stringify(trace,null,2)+'\n','utf8');
}
function finalizeSelfTestDiagnostic(paths,trace,{powerShellDir=null,workspace=null}={}){
  writeSelfTestTrace(paths,trace);
  const entries=[{name:'self-test-trace.json',data:JSON.stringify(trace,null,2)+'\n'}];
  entries.push(...safeDiagnosticFiles(powerShellDir,'powershell'));
  if(workspace?.root){
    for(const rel of ['chatgpt-powershell-marker.txt','powershell-paste-result.txt']){
      const file=path.join(workspace.repo,rel);if(fs.existsSync(file))entries.push({name:'sandbox/'+rel,data:fs.readFileSync(file)});
    }
    const results=path.join(workspace.repo,'test-results','86chaos-play-store-release-gate');
    if(fs.existsSync(results)){
      for(const full of filesRecursive(results)){
        const rel=path.relative(results,full).replace(/\\/g,'/');
        if(/runner-state\.json$|\.last-run\.json$|\.log$/i.test(rel))entries.push({name:'release-gate/'+rel,data:fs.readFileSync(full)});
      }
    }
  }
  const tempZip=paths.zip+'.tmp';fs.writeFileSync(tempZip,storedZip(entries));fs.renameSync(tempZip,paths.zip);
  const stat=fs.statSync(paths.zip);
  return {name:path.basename(paths.zip),path:paths.zip,jsonPath:paths.json,bytes:stat.size,powerShellDir:powerShellDir||null,stage:trace.stage,error:trace.error||null};
}

export async function runFullSandboxSelfTest({dataDir,appRoot,chatSettings,submitRepair,onStatus=()=>{},onState=()=>{},shouldCancel=()=>false}){
  const startedAt=Date.now(),id=new Date().toISOString().replace(/[-:.]/g,'').replace('Z','')+'-'+crypto.randomBytes(2).toString('hex'),diagnosticPaths=selfTestDiagnosticPaths(dataDir,id);
  const steps={featureParity:'pending',sandbox:'pending',manualGateAdoption:'pending',handoff:'pending',chatgpt:'pending',chatgptPowerShellRoundTrip:'pending',download:'pending',apply:'pending',retest:'pending',gitPush:'pending',deployment:'pending',postDeployAdoption:'pending'};
  const trace={id,version:'0.1.96',state:'running',stage:'starting',detail:'Starting full isolated process test.',startedAt:new Date(startedAt).toISOString(),steps:{...steps},events:[]};
  let workspace=null,powerShellDir=null;
  const record=(type,detail={})=>{trace.events.push({at:new Date().toISOString(),type,...detail});trace.events=trace.events.slice(-500);writeSelfTestTrace(diagnosticPaths,trace)};
  const update=(stage,state='running',detail='')=>{
    if(stage&&stage in steps)steps[stage]=state;
    trace.state='running';trace.stage=stage;trace.detail=detail;trace.steps={...steps};trace.elapsedMs=Date.now()-startedAt;record('stage',{stage,state,detail});
    onState({state:'running',stage,detail,steps:{...steps},startedAt,elapsedMs:Date.now()-startedAt,workspaceId:id});
  };
  record('self-test-start',{chatMode:chatSettings.mode,model:chatSettings.model,thinkingEffort:chatSettings.thinkingEffort});
  try{
    checkCanceled(shouldCancel);update('featureParity','running','Verifying Yardmaster 1.85 control-parity, mobile-tab, no-zoom, timestamp, icon, and ChatGPT route contracts.');
    const pkg=JSON.parse(fs.readFileSync(path.join(appRoot,'package.json'),'utf8')),html=fs.readFileSync(path.join(appRoot,'public','index.html'),'utf8'),app=fs.readFileSync(path.join(appRoot,'public','app.js'),'utf8'),server=fs.readFileSync(path.join(appRoot,'server.mjs'),'utf8'),desktop=fs.readFileSync(path.join(appRoot,'desktop.cjs'),'utf8');
    if(pkg.version!=='0.1.96')throw new Error('Full process expected Yardmaster 0.1.96.');
    for(const marker of ['maximum-scale=1','user-scalable=no','mobile-tabbar','liveStatusTimestamp','chatLoopPlan'])if(!html.includes(marker))throw new Error('Full process missing UI contract: '+marker);
    for(const marker of ['chatLoopEnabled','nextChatLoopSelection','resumeStartedAt'])if(!server.includes(marker))throw new Error('Full process missing server contract: '+marker);
    if(!app.includes('gesturestart')||!desktop.includes("com.chiltonappworks.yardmaster"))throw new Error('Full process missing mobile no-zoom or Windows taskbar identity contract.');
    steps.featureParity='pass';record('feature-parity-pass',{version:pkg.version});onStatus('Yardmaster 1.85 feature-parity preflight passed.');
    checkCanceled(shouldCancel);update('sandbox','running','Creating isolated throwaway repository.');workspace=createSandboxFixture(dataDir,{id});steps.sandbox='pass';record('sandbox-created');onStatus('Self-test sandbox created. No 86 Chaos files are in use.');
    checkCanceled(shouldCancel);update('manualGateAdoption','running','Starting a disposable Play Store-style gate outside Yardmaster, then adopting it.');const adoptedFail=await adoptSandboxManualGate(workspace,{mode:'failed+new',onLine:line=>{record('adopted-gate-log',{line:String(line).slice(0,1000)});onStatus('Adopted gate: '+line)},onState:s=>{record('adopted-gate-state',s);onStatus('Adopted gate phase: '+s.currentPhase)}});if(adoptedFail.code===0)throw new Error('Sandbox adopted gate unexpectedly passed before repair.');steps.manualGateAdoption='pass';record('adopted-gate-failed-as-expected',{snapshot:adoptedFail.snapshot});onStatus('Yardmaster adopted the manually started failing gate and captured its result.');
    checkCanceled(shouldCancel);const handoffPath=path.join(workspace.root,'Yardmaster-Self-Test-Handoff.zip');update('handoff','running','Packaging the adopted failure handoff.');buildSandboxHandoff(workspace,handoffPath);steps.handoff='pass';record('handoff-built',{size:fs.statSync(handoffPath).size});onStatus('Tiny sandbox handoff ZIP created.');
    const marker=path.join(workspace.repo,'chatgpt-powershell-marker.txt');
    let protocolCount=0;
    const onAssistantProtocol=async text=>{
      protocolCount++;update('chatgptPowerShellRoundTrip','running','Executing the PowerShell command returned by ChatGPT through Windows clipboard → Ctrl+V → Enter.');
      record('chatgpt-protocol-received',{length:String(text||'').length});
      const source=String(text||''),match=source.match(/(?:^|\n)POWERSHELL\s*\r?\n([\s\S]*?)\r?\nEND_POWERSHELL(?=\r?\n|$)/i);
      if(!match)throw new Error('ChatGPT did not return the required POWERSHELL block during the sandbox self-test.');
      if(!/chatgpt-powershell-marker\.txt/i.test(match[1])||!/CHATGPT-POWERSHELL-ROUNDTRIP/.test(match[1]))throw new Error('ChatGPT returned a PowerShell block, but it was not the exact sandbox marker command requested.');
      const psEvents=[];
      let psResult;
      try{
        psResult=await runPowerShellClipboardCommand({dataDir,cwd:workspace.repo,script:match[1],timeoutMs:45000,onOutput:line=>{record('powershell-output',{line:String(line).slice(0,1000)});onStatus('PowerShell: '+line)},onEvent:event=>{psEvents.push(event);record('powershell-event',event)}});
      }catch(error){
        powerShellDir=error.powerShellDiagnostic?.dir||powerShellDir;record('powershell-error',{message:error.message,diagnostic:error.powerShellDiagnostic||null});throw error;
      }
      powerShellDir=psResult.diagnosticDir||powerShellDir;
      if(psResult.code!==0)throw new Error('ChatGPT-originated PowerShell command exited with code '+psResult.code+'.');
      if(!psResult.clipboardVerified||!psResult.pastedWithCtrlV)throw new Error('ChatGPT-originated PowerShell command did not complete through the real clipboard/Ctrl+V path.');
      if(!fs.existsSync(marker)||!/CHATGPT-POWERSHELL-ROUNDTRIP/.test(fs.readFileSync(marker,'utf8')))throw new Error('ChatGPT-originated PowerShell command ran, but the expected sandbox marker file was not created.');
      steps.chatgptPowerShellRoundTrip='pass';trace.steps={...steps};record('chatgpt-powershell-roundtrip-pass',{code:psResult.code,pastedWithCtrlV:psResult.pastedWithCtrlV,clipboardVerified:psResult.clipboardVerified});
      onStatus('ChatGPT → Yardmaster → clipboard → Ctrl+V → PowerShell → result-back round trip passed.');
      return 'POWERSHELL exit=0 clipboardVerified=true pastedWithCtrlV=true marker=CHATGPT-POWERSHELL-ROUNDTRIP verified';
    };
    checkCanceled(shouldCancel);update('chatgpt','running','Sending the sandbox handoff to ChatGPT and requiring a PowerShell instruction before the repaired ZIP.');const result=await submitRepair({mode:chatSettings.mode,model:chatSettings.model,thinkingEffort:chatSettings.thinkingEffort,prompt:sandboxChatPrompt(),artifactPath:handoffPath,dataDir,onStatus:m=>{record('chatgpt-status',{message:String(m).slice(0,1000)});onStatus('Self-test: '+m)},shouldCancel,onAssistantProtocol});
    if(result?.state==='login_required'){trace.state='waiting-login';trace.stage='chatgpt';trace.detail='ChatGPT sign-in required.';trace.steps={...steps};writeSelfTestTrace(diagnosticPaths,trace);return {state:'login_required',steps,workspace,startedAt,elapsedMs:Date.now()-startedAt}}
    if(protocolCount<1||steps.chatgptPowerShellRoundTrip!=='pass')throw new Error('ChatGPT returned a repair ZIP without completing the required ChatGPT-originated PowerShell round trip.');
    if(!result?.repairPath)throw new Error('Self-test did not receive a repaired ZIP from ChatGPT.');steps.chatgpt='pass';steps.download='pass';record('repair-downloaded',{name:path.basename(result.repairPath)});onStatus('Sandbox repair ZIP downloaded from ChatGPT.');
    checkCanceled(shouldCancel);update('apply','running','Applying the downloaded repair to the sandbox repository.');applySandboxRepair({appRoot,workspace,repairPath:result.repairPath});steps.apply='pass';record('repair-applied');onStatus('Downloaded repair applied only to the sandbox.');
    checkCanceled(shouldCancel);update('retest','running','Re-running the repaired fixture test.');const retest=await runFixtureTest(workspace.repo);if(retest.code!==0)throw new Error('Sandbox repair was applied, but the repaired fixture test still failed.');steps.retest='pass';record('retest-pass');onStatus('Repaired sandbox test passed.');
    checkCanceled(shouldCancel);update('gitPush','running','Committing and pushing to a local throwaway Git remote.');const commit=commitAndPushSandbox(workspace);steps.gitPush='pass';record('local-push-pass',{commit});onStatus('Sandbox Git commit pushed to the local throwaway remote.');
    checkCanceled(shouldCancel);update('deployment','running','Verifying the pushed commit identity in the local deployment simulator.');const identity=verifySandboxDeploymentIdentity(workspace,commit);steps.deployment='pass';record('deployment-identity-pass',identity);onStatus('Sandbox deployment identity verified.');
    checkCanceled(shouldCancel);update('postDeployAdoption','running','Starting a second disposable Play Store-style gate after deployment and adopting it to PASS.');const adoptedPass=await adoptSandboxManualGate(workspace,{mode:'failed+new',onLine:line=>{record('post-deploy-gate-log',{line:String(line).slice(0,1000)});onStatus('Post-deploy adopted gate: '+line)},onState:s=>{record('post-deploy-gate-state',s);onStatus('Post-deploy phase: '+s.currentPhase)}});if(adoptedPass.code!==0)throw new Error('Sandbox post-deployment adopted gate failed.');steps.postDeployAdoption='pass';record('post-deploy-pass',{snapshot:adoptedPass.snapshot});
    const finished={state:'passed',stage:'complete',detail:'Full isolated Yardmaster process passed, including the ChatGPT-originated PowerShell round trip.',steps:{...steps},startedAt,finishedAt:Date.now(),elapsedMs:Date.now()-startedAt,workspaceId:id,commit,identity};
    trace.state='passed';trace.stage='complete';trace.detail=finished.detail;trace.steps={...steps};trace.finishedAt=new Date().toISOString();trace.elapsedMs=finished.elapsedMs;writeSelfTestTrace(diagnosticPaths,trace);
    onState(finished);onStatus('Full Yardmaster sandbox process passed.');return {...finished,workspace};
  }catch(error){
    const failedStage=(trace.stage&&trace.stage in steps)?trace.stage:(Object.entries(steps).find(([,v])=>v==='running')?.[0]||'unknown');
    for(const [name,value] of Object.entries(steps))if(value==='running')steps[name]=name===failedStage?'failed':'interrupted';
    if(failedStage in steps)steps[failedStage]='failed';
    trace.state='failed';trace.stage=failedStage;trace.detail=error.message;trace.error=error.message;trace.steps={...steps};trace.finishedAt=new Date().toISOString();trace.elapsedMs=Date.now()-startedAt;
    record('self-test-failed',{stage:failedStage,message:error.message,powerShellDiagnostic:error.powerShellDiagnostic||null});
    const diagnostic=finalizeSelfTestDiagnostic(diagnosticPaths,trace,{powerShellDir:error.powerShellDiagnostic?.dir||powerShellDir,workspace});
    error.selfTest={state:'failed',stage:failedStage,detail:error.message,steps:{...steps},startedAt,finishedAt:Date.now(),elapsedMs:Date.now()-startedAt,workspaceId:id,diagnostic};
    onState(error.selfTest);throw error;
  }
}

