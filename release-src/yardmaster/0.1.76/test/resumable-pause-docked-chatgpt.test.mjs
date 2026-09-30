import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {
  pauseCheckpointPath,writePauseCheckpoint,readPauseCheckpoint,clearPauseCheckpoint,
  resumeStrategy,setProcessTreeState,partialResumeCommand,capturePauseCheckpoint
} from '../automation/play-store-resume.mjs';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'ym-pause-resume-'));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('true Play Store pause checkpoint survives Yardmaster restart and prefers the exact same process',()=>{
  const dir=tmp();
  try{
    process.env.YARDMASTER_TEST_PROCESS_ALIVE_PID='424242';
    const runDir=path.join(dir,'run');fs.mkdirSync(runDir,{recursive:true});
    const saved=writePauseCheckpoint(dir,{kind:'play-store',rootPid:424242,runId:'same-run-123',runDir,currentTest:'chromium test 88',progress:47});
    assert.equal(fs.existsSync(pauseCheckpointPath(dir)),true);
    assert.equal(readPauseCheckpoint(dir).runId,'same-run-123');
    assert.deepEqual(resumeStrategy(saved),{kind:'same-process',runId:'same-run-123',pid:424242,reason:'The original release-gate process is still alive.'});
    process.env.YARDMASTER_TEST_PROCESS_STATE_STUB='1';
    assert.deepEqual(setProcessTreeState(root,424242,'Suspend'),{ok:true,stubbed:true,pid:424242,action:'Suspend'});
    assert.deepEqual(setProcessTreeState(root,424242,'Resume'),{ok:true,stubbed:true,pid:424242,action:'Resume'});
  }finally{
    delete process.env.YARDMASTER_TEST_PROCESS_ALIVE_PID;delete process.env.YARDMASTER_TEST_PROCESS_STATE_STUB;
    fs.rmSync(dir,{recursive:true,force:true});
  }
});

test('Yardmaster-owned pause suspends the outer test process tree while retaining the inner release-gate identity',()=>{
  const dir=tmp();try{
    process.env.YARDMASTER_TEST_PROCESS_STATE_STUB='1';
    const cp=capturePauseCheckpoint({dataDir:dir,appRoot:root,repoPath:dir,ownedPid:11111,runInfo:{pid:22222,runId:'inner-gate',runDir:path.join(dir,'gate'),statePath:path.join(dir,'gate','runner-state.json')},stateRun:{currentTest:'fixture',progress:33},workflow:{state:'testing',closedLoop:true},config:{branch:'testing',testType:'full'}});
    assert.equal(cp.rootPid,11111);assert.equal(cp.runId,'inner-gate');assert.equal(cp.runDir,path.join(dir,'gate'));
  }finally{delete process.env.YARDMASTER_TEST_PROCESS_STATE_STUB;fs.rmSync(dir,{recursive:true,force:true})}
});

test('WINDOWS: true pause freezes and resumes a disposable process tree',{skip:process.platform!=='win32'},async()=>{
  const dir=tmp(),file=path.join(dir,'ticks.txt');
  const child=spawn(process.execPath,['-e',`const fs=require('fs');const f=process.argv[1];setInterval(()=>fs.appendFileSync(f,'x'),80)`,file],{windowsHide:true,stdio:'ignore'});
  const delay=ms=>new Promise(r=>setTimeout(r,ms));
  try{
    await delay(500);const before=fs.existsSync(file)?fs.statSync(file).size:0;assert.ok(before>1);
    setProcessTreeState(root,child.pid,'Suspend');const frozen=fs.statSync(file).size;await delay(650);const whilePaused=fs.statSync(file).size;assert.ok(whilePaused-frozen<=1,'suspended fixture kept producing output');
    setProcessTreeState(root,child.pid,'Resume');await delay(500);const after=fs.statSync(file).size;assert.ok(after>whilePaused+1,'resumed fixture did not continue');
  }finally{try{child.kill('SIGKILL')}catch{}fs.rmSync(dir,{recursive:true,force:true})}
});

test('lost Play Store process falls back only to verified 86 Chaos partial checkpoint and never silently restarts full gate',()=>{
  const dir=tmp();
  try{
    const runDir=path.join(dir,'run');fs.mkdirSync(runDir,{recursive:true});
    const cp=writePauseCheckpoint(dir,{kind:'play-store',rootPid:99999999,runId:'interrupted-run',runDir});
    assert.equal(resumeStrategy(cp).kind,'manual-required');
    fs.writeFileSync(path.join(runDir,'playwright-progress.jsonl'),'fixture durable journal\n');
    const strategy=resumeStrategy(cp);assert.equal(strategy.kind,'partial-checkpoint');assert.equal(strategy.runId,'interrupted-run');
    const repo=path.join(dir,'repo');fs.mkdirSync(repo);fs.writeFileSync(path.join(repo,'RUN_86CHAOS_PARTIAL_RESUME_RELEASE_GATE.ps1'),'# fixture');
    assert.match(partialResumeCommand(repo),/RUN_86CHAOS_PARTIAL_RESUME_RELEASE_GATE\.ps1/);
    const server=read('server.mjs');
    assert.match(server,/resumeSavedProcess/);assert.match(server,/partialResumeCommand/);assert.match(server,/paused-play-store/);
    assert.match(server,/will not silently restart the complete Play Store gate/i);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('Stop clears a pause checkpoint while ordinary Yardmaster shutdown preserves a suspended release gate',()=>{
  const server=read('server.mjs');
  assert.match(server,/function stopRun\(\).*clearPauseCheckpoint\(dataDir\)/s);
  assert.match(server,/if\(activeProcess&&!pausedCheckpoint\)terminateProcessTree/);
  assert.match(server,/if\(adoptedRunController&&!pausedCheckpoint\)/);
  const updater=read('scripts/Update-Yardmaster.ps1');assert.match(updater,/Do not use \/T here/);assert.doesNotMatch(updater,/taskkill\.exe \/PID \$_\.Id \/T \/F/);
});

test('paused Play Store update records a durable resume marker instead of waiting for the run to finish',()=>{
  const server=read('server.mjs');
  assert.match(server,/pausedCheckpoint&&state\.run\?\.state==='paused'/);
  assert.match(server,/resumeAfterUpdate:\{kind:'paused-play-store',checkpoint:pausedCheckpoint\}/);
  assert.match(server,/The Play Store run remains suspended/);
  assert.match(server,/Press Resume when you are ready/);
});

test('docked ChatGPT uses a persistent sandboxed Electron WebContentsView and localhost-only DevTools bridge',()=>{
  const desktop=read('desktop.cjs'),preload=read('preload.cjs'),bridge=read('automation/chatgpt.mjs'),html=read('public/index.html'),app=read('public/app.js');
  assert.match(desktop,/WebContentsView/);
  assert.match(desktop,/persist:yardmaster-chatgpt-dock/);assert.match(desktop,/x:-2200,y:0,width:1280,height:800/,'hidden dock must remain full-size offscreen so automation sees a normal ChatGPT layout');
  assert.match(desktop,/remote-debugging-port','9224/);
  assert.match(desktop,/remote-debugging-address','127\.0\.0\.1/);
  assert.match(desktop,/contextIsolation:true,nodeIntegration:false,sandbox:true/);
  assert.match(preload,/yardmaster:chatgpt-dock/);
  assert.match(html,/id="chatgptDockHost"/);assert.match(html,/Work without browser popups/);
  assert.match(app,/syncChatGPTDock/);assert.match(app,/setChatGPTDock/);
  assert.match(bridge,/Prefer the Electron WebContentsView dock/);
  assert.match(bridge,/purpose:'docked-'\+purpose/);
  assert.match(bridge,/--headless=new/,'automation fallback must stay headless instead of popping a browser window');
});

test('Windows recovery regressions keep PowerShell PID names safe and retry transient clipboard contention',()=>{
  const processHelper=read('scripts/Set-ProcessTreeState.ps1'),operator=read('automation/windows-operator.mjs'),chatgpt=read('automation/chatgpt.mjs');
  assert.doesNotMatch(processHelper,/function\s+Get-Descendants\(\[int\]\$Pid\)/i);
  assert.doesNotMatch(processHelper,/function\s+Set-State\(\[int\]\$Pid/i);
  assert.match(processHelper,/\$ProcessId/);
  assert.match(operator,/for\(\$i=0;\$i -lt 12;\$i\+\+\)/);
  assert.match(operator,/after '\+clipboardAttempts\+' verified attempts/);
  assert.match(chatgpt,/Input\.insertText/);
  assert.match(chatgpt,/attempt<=3/);
});

test('version-6 migration regression is locked after the Operations Intelligence defaults upgrade',()=>{
  const server=read('server.mjs'),operator=read('test/operator.integration.test.mjs'),contracts=read('test/static-contracts.test.mjs');
  assert.match(server,/automationDefaultsVersion:6/);
  assert.match(operator,/automationDefaultsVersion,6/);
  assert.match(contracts,/automationDefaultsVersion:6/);
});

test('new feature registry requires Play Store and Playwright coverage for pause/resume and docked ChatGPT',()=>{
  const registry=JSON.parse(read('YARDMASTER_FEATURES.json'));
  for(const id of ['durable-play-store-pause-resume','docked-chatgpt-workspace']){
    const f=registry.features.find(x=>x.id===id);assert.ok(f,id+' missing');
    assert.ok(f.playStoreTests.includes('test/resumable-pause-docked-chatgpt.test.mjs'));
    assert.ok(f.playwrightTests.includes('test/playwright/resumable-pause-docked-chatgpt.e2e.spec.mjs'));
  }
});
