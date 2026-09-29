import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';

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

export function buildSandboxHandoff(workspace,outPath){
  const prompt=[
    'YARDMASTER FULL PROCESS SANDBOX TEST',
    '',
    'This is a disposable Yardmaster fixture, NOT the 86 Chaos application.',
    'Make exactly this tiny repair:',
    "- Change src/value.js so it exports value='REPAIRED'.",
    '- Bump package.json version from 0.0.1 to 0.0.2.',
    '- Preserve every other file.',
    '- Return ONE COMPLETE APPLICATION ZIP containing the entire repaired fixture.',
    '- Do not use GitHub, Vercel, Firebase, 86 Chaos, credentials, or any external deployment.'
  ].join('\n');
  return zipDirectory(workspace.repo,outPath,[{name:'YARDMASTER_PROMPT.txt',data:prompt+'\n'}]);
}
export function sandboxChatPrompt(){
  return "Yardmaster full-process sandbox test. The attached ZIP is a tiny disposable fixture and contains YARDMASTER_PROMPT.txt with the exact repair. Follow it exactly and return ONE COMPLETE APPLICATION ZIP. Do not access or modify 86 Chaos, GitHub, Vercel, Firebase, production, or any external service.";
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

export async function runFullSandboxSelfTest({dataDir,appRoot,chatSettings,submitRepair,onStatus=()=>{},onState=()=>{},shouldCancel=()=>false}){
  const startedAt=Date.now(),id=new Date().toISOString().replace(/[-:.]/g,'').replace('Z','')+'-'+crypto.randomBytes(2).toString('hex');
  const steps={sandbox:'pending',initialTest:'pending',handoff:'pending',chatgpt:'pending',download:'pending',apply:'pending',retest:'pending',gitPush:'pending',deployment:'pending',postDeployTest:'pending'};
  const update=(stage,state='running',detail='')=>{if(stage&&stage in steps)steps[stage]=state;onState({state:'running',stage,detail,steps:{...steps},startedAt,elapsedMs:Date.now()-startedAt,workspaceId:id})};
  let workspace=null;
  try{
    checkCanceled(shouldCancel);update('sandbox','running','Creating isolated throwaway repository.');workspace=createSandboxFixture(dataDir,{id});steps.sandbox='pass';onStatus('Self-test sandbox created. No 86 Chaos files are in use.');
    checkCanceled(shouldCancel);update('initialTest','running','Running the intentionally failing fixture test.');const initial=await runFixtureTest(workspace.repo);if(initial.code===0)throw new Error('Sandbox fixture unexpectedly passed before repair.');steps.initialTest='pass';onStatus('Sandbox failure reproduced as expected.');
    checkCanceled(shouldCancel);const handoffPath=path.join(workspace.root,'Yardmaster-Self-Test-Handoff.zip');update('handoff','running','Packaging the tiny failure handoff.');buildSandboxHandoff(workspace,handoffPath);steps.handoff='pass';onStatus('Tiny sandbox handoff ZIP created.');
    checkCanceled(shouldCancel);update('chatgpt','running','Sending the sandbox repair through the real ChatGPT handoff.');const result=await submitRepair({mode:chatSettings.mode,model:chatSettings.model,thinkingEffort:chatSettings.thinkingEffort,prompt:sandboxChatPrompt(),artifactPath:handoffPath,dataDir,onStatus:m=>onStatus('Self-test: '+m),shouldCancel});
    if(result?.state==='login_required')return {state:'login_required',steps,workspace,startedAt,elapsedMs:Date.now()-startedAt};
    if(!result?.repairPath)throw new Error('Self-test did not receive a repaired ZIP from ChatGPT.');steps.chatgpt='pass';steps.download='pass';onStatus('Sandbox repair ZIP downloaded from ChatGPT.');
    checkCanceled(shouldCancel);update('apply','running','Applying the downloaded repair to the sandbox repository.');applySandboxRepair({appRoot,workspace,repairPath:result.repairPath});steps.apply='pass';onStatus('Downloaded repair applied only to the sandbox.');
    checkCanceled(shouldCancel);update('retest','running','Re-running the repaired fixture test.');const retest=await runFixtureTest(workspace.repo);if(retest.code!==0)throw new Error('Sandbox repair was applied, but the repaired fixture test still failed.');steps.retest='pass';onStatus('Repaired sandbox test passed.');
    checkCanceled(shouldCancel);update('gitPush','running','Committing and pushing to a local throwaway Git remote.');const commit=commitAndPushSandbox(workspace);steps.gitPush='pass';onStatus('Sandbox Git commit pushed to the local throwaway remote.');
    checkCanceled(shouldCancel);update('deployment','running','Verifying the pushed commit identity in the local deployment simulator.');const identity=verifySandboxDeploymentIdentity(workspace,commit);steps.deployment='pass';onStatus('Sandbox deployment identity verified.');
    checkCanceled(shouldCancel);update('postDeployTest','running','Running the final post-deployment sandbox test.');const post=await runFixtureTest(workspace.repo);if(post.code!==0)throw new Error('Sandbox post-deployment test failed.');steps.postDeployTest='pass';
    const finished={state:'passed',stage:'complete',detail:'Full isolated Yardmaster process passed.',steps:{...steps},startedAt,finishedAt:Date.now(),elapsedMs:Date.now()-startedAt,workspaceId:id,commit,identity};
    onState(finished);onStatus('Full Yardmaster sandbox process passed.');return {...finished,workspace};
  }catch(error){
    error.selfTest={state:'failed',stage:Object.entries(steps).find(([,v])=>v==='running')?.[0]||'unknown',detail:error.message,steps:{...steps},startedAt,finishedAt:Date.now(),elapsedMs:Date.now()-startedAt,workspaceId:id,diagnostic:error.diagnostic||null};
    onState(error.selfTest);throw error;
  }
}
