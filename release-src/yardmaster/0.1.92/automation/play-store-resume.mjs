import {readRunProject} from './run-project.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync,spawn} from 'node:child_process';

const readJson=(file,fallback=null)=>{try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback}};
const writeJson=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n','utf8')};

export function pauseCheckpointPath(dataDir){return path.join(dataDir,'play-store-pause.json')}
export function readPauseCheckpoint(dataDir){return readJson(pauseCheckpointPath(dataDir),null)}
export function writePauseCheckpoint(dataDir,checkpoint){const value={schema:1,...checkpoint,updatedAt:Date.now()};writeJson(pauseCheckpointPath(dataDir),value);return value}
export function clearPauseCheckpoint(dataDir){try{fs.rmSync(pauseCheckpointPath(dataDir),{force:true})}catch{}}

export function pidAlive(pid){
  pid=Number(pid);if(!pid)return false;
  if(process.env.YARDMASTER_TEST_PROCESS_ALIVE_PID&&Number(process.env.YARDMASTER_TEST_PROCESS_ALIVE_PID)===pid)return true;
  try{process.kill(pid,0);return true}catch{}
  if(process.platform==='win32'){
    try{const out=execFileSync('tasklist.exe',['/FI',`PID eq ${pid}`,'/FO','CSV','/NH'],{encoding:'utf8',windowsHide:true,timeout:5000});return new RegExp('"' + pid + '"').test(out)}catch{}
  }
  return false;
}
export function setProcessTreeState(appRoot,pid,action){
  if(!['Suspend','Resume'].includes(action))throw new Error('Unsupported process state action.');
  pid=Number(pid);if(!pid)throw new Error('A valid release-gate process PID is required.');
  if(process.env.YARDMASTER_TEST_PROCESS_STATE_STUB==='1')return {ok:true,stubbed:true,pid,action};
  if(process.platform!=='win32')throw new Error('True Play Store process pause/resume requires Windows.');
  const script=path.join(appRoot,'scripts','Set-ProcessTreeState.ps1');
  if(!fs.existsSync(script))throw new Error('Yardmaster process-tree state helper is missing.');
  execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-RootPid',String(pid),'-Action',action],{windowsHide:true,stdio:'pipe',timeout:30000});
  return {ok:true,pid,action};
}
export function checkpointHasPartialResume(checkpoint){
  const runDir=checkpoint?.runDir;if(!runDir)return false;
  return fs.existsSync(path.join(runDir,'playwright-progress.jsonl'));
}
export function resumeStrategy(checkpoint){
  if(!checkpoint)return {kind:'none',reason:'No saved Play Store pause checkpoint exists.'};
  if(pidAlive(checkpoint.rootPid))return {kind:'same-process',runId:checkpoint.runId||null,pid:Number(checkpoint.rootPid),reason:'The original release-gate process is still alive.'};
  if(checkpointHasPartialResume(checkpoint))return {kind:'partial-checkpoint',runId:checkpoint.runId||null,reason:'The original process stopped, but 86 Chaos durable Playwright progress evidence is available.'};
  return {kind:'manual-required',runId:checkpoint.runId||null,reason:'The original process is gone and no durable Playwright progress journal is available. Yardmaster will not silently restart the full gate.'};
}
export function partialResumeCommand(repoPath){
  const script=path.join(repoPath,'RUN_86CHAOS_PARTIAL_RESUME_RELEASE_GATE.ps1');
  if(!fs.existsSync(script))throw new Error('86 Chaos partial-resume release-gate script is unavailable.');
  return `powershell -NoProfile -ExecutionPolicy Bypass -File "${script.replaceAll('"','\"')}"`;
}
export function capturePauseCheckpoint({dataDir,appRoot,repoPath,runInfo=null,ownedPid=null,stateRun={},workflow={},config={}}={}){
  const rootPid=Number(ownedPid||runInfo?.pid||0);
  if(!rootPid)throw new Error('Yardmaster could not identify the active Play Store process to pause.');
  setProcessTreeState(appRoot,rootPid,'Suspend');
  return writePauseCheckpoint(dataDir,{
    kind:'play-store',
    rootPid,
    runId:runInfo?.runId||stateRun?.runId||null,
    runDir:runInfo?.runDir||stateRun?.adoptedState?.runDir||null,
    statePath:runInfo?.statePath||null,
    source:runInfo?'adopted-or-discovered':'yardmaster-owned',
    branch:config.branch||null,
    testType:config.testType||null,
    command:stateRun.command||null,
    project:stateRun.project||readRunProject(repoPath),
    currentTest:stateRun.currentTest||null,
    progress:Number(stateRun.progress||0),
    startedAt:stateRun.startedAt||null,
    suspendedAt:Date.now(),
    workflow:{state:workflow.state||null,closedLoop:!!workflow.closedLoop,repairAttempts:Number(workflow.repairAttempts||0)}
  });
}
export function resumeSavedProcess({dataDir,appRoot}={}){
  const checkpoint=readPauseCheckpoint(dataDir),strategy=resumeStrategy(checkpoint);
  if(strategy.kind!=='same-process')return {checkpoint,strategy,resumed:false};
  setProcessTreeState(appRoot,checkpoint.rootPid,'Resume');
  return {checkpoint,strategy,resumed:true};
}
export function spawnPartialResume(repoPath,{onLine=()=>{}}={}){
  const script=path.join(repoPath,'RUN_86CHAOS_PARTIAL_RESUME_RELEASE_GATE.ps1');
  if(!fs.existsSync(script))throw new Error('86 Chaos partial-resume release-gate script is unavailable.');
  const child=spawn(process.platform==='win32'?'powershell.exe':'pwsh',['-NoProfile','-ExecutionPolicy','Bypass','-File',script],{cwd:repoPath,windowsHide:true});
  child.stdout?.on('data',d=>String(d).split(/\r?\n/).filter(Boolean).forEach(line=>onLine(line,'stdout')));
  child.stderr?.on('data',d=>String(d).split(/\r?\n/).filter(Boolean).forEach(line=>onLine(line,'stderr')));
  return child;
}
