import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  createSandboxFixture,runFixtureTest,buildSandboxHandoff,createKnownGoodSandboxRepair,
  applySandboxRepair,commitAndPushSandbox,verifySandboxDeploymentIdentity,sandboxChatPrompt,adoptSandboxManualGate,runFullSandboxSelfTest
} from '../automation/full-self-test.mjs';
import {runPowerShellClipboardCommand,buildPowerShellUiPasteScript,buildPowerShellBootstrapScript,buildPowerShellLauncherScript,discoverAdoptableReleaseGate,adoptRunningReleaseGate} from '../automation/windows-operator.mjs';

test('full sandbox engine exercises fail -> handoff -> repair -> retest -> local push -> deployment identity',async t=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster-full-self-test-'));
  try{
    const workspace=createSandboxFixture(temp,{id:'fixture'});
    assert.ok(workspace.repo.startsWith(temp));
    assert.ok(!workspace.repo.toLowerCase().includes(path.join('documents','github','86chaos').toLowerCase()));
    if(process.platform==='win32'){
      const marker=path.join(workspace.root,'clipboard-marker.txt');
      const previous=process.env.YARDMASTER_TEST_POWERSHELL_PASTE_STUB;process.env.YARDMASTER_TEST_POWERSHELL_PASTE_STUB='1';
      try{
        const ps=await runPowerShellClipboardCommand({dataDir:temp,cwd:workspace.repo,script:`$x = "clipboard-'quote'"
Set-Content -LiteralPath '${marker.replaceAll("'","''")}' -Value $x`});
        assert.equal(ps.code,0);assert.equal(ps.clipboardVerified,true);assert.match(fs.readFileSync(marker,'utf8'),/clipboard-'quote'/);
      } finally {if(previous===undefined)delete process.env.YARDMASTER_TEST_POWERSHELL_PASTE_STUB;else process.env.YARDMASTER_TEST_POWERSHELL_PASTE_STUB=previous}
    } else t.diagnostic('PowerShell clipboard transport is Windows-only.');

    const adoptedFail=await adoptSandboxManualGate(workspace,{mode:'failed+new'});
    assert.notEqual(adoptedFail.code,0,'adopted fixture gate must fail before repair');
    assert.equal(adoptedFail.snapshot.source,'adopted-manual');

    const handoff=path.join(workspace.root,'handoff.zip');
    buildSandboxHandoff(workspace,handoff);
    const bytes=fs.readFileSync(handoff);
    assert.equal(bytes.subarray(0,2).toString(),'PK');
    assert.ok(bytes.length<200000,'sandbox handoff should remain tiny and fast');
    const prompt=sandboxChatPrompt();
    assert.match(prompt,/disposable fixture/i);
    assert.match(prompt,/Do not access or modify 86 Chaos/i);

    if(process.platform!=='win32'){t.diagnostic('Windows-only repair overlay portion skipped.');return}
    const repair=path.join(workspace.root,'repair.zip');
    createKnownGoodSandboxRepair(workspace,repair);
    applySandboxRepair({appRoot:path.dirname(path.dirname(fileURLToPath(import.meta.url))),workspace,repairPath:repair});
    const retest=await runFixtureTest(workspace.repo);
    assert.equal(retest.code,0,'repaired fixture must pass');
    const commit=commitAndPushSandbox(workspace);
    const identity=verifySandboxDeploymentIdentity(workspace,commit);
    assert.equal(identity.gitBranch,'testing');
    assert.equal(identity.gitCommit,commit);
    const post=await adoptSandboxManualGate(workspace,{mode:'failed+new'});
    assert.equal(post.code,0,'post-deployment adopted fixture gate must pass');
    assert.equal(post.snapshot.status,'passed');
  } finally {
    await new Promise(r=>setTimeout(r,500));
    fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:250});
  }
});


test('full sandbox orchestration requires a ChatGPT-originated PowerShell block before accepting the repair ZIP',async t=>{
  if(process.platform!=='win32'){t.diagnostic('Windows-only sandbox orchestration test.');return}
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster-chatgpt-powershell-roundtrip-'));
  const previous=process.env.YARDMASTER_TEST_POWERSHELL_PASTE_STUB;process.env.YARDMASTER_TEST_POWERSHELL_PASTE_STUB='1';
  try{
    let sawProtocol=false;
    const result=await runFullSandboxSelfTest({
      dataDir:temp,
      appRoot:path.dirname(path.dirname(fileURLToPath(import.meta.url))),
      chatSettings:{mode:'Work',model:'GPT-5.6 Sol',thinkingEffort:'High'},
      submitRepair:async options=>{
        assert.match(options.prompt,/FIRST return the exact POWERSHELL instruction block/i);
        assert.equal(typeof options.onAssistantProtocol,'function');
        const assistant=[
          'YARDMASTER',
          'POWERSHELL',
          "Set-Content -LiteralPath '.\\chatgpt-powershell-marker.txt' -Value 'CHATGPT-POWERSHELL-ROUNDTRIP'",
          'END_POWERSHELL',
          'END'
        ].join('\n');
        const feedback=await options.onAssistantProtocol(assistant);
        sawProtocol=true;
        assert.match(feedback,/clipboardVerified=true/);
        const root=path.dirname(options.artifactPath),workspace={root,repo:path.join(root,'repo'),remote:path.join(root,'remote.git')};
        const repair=path.join(root,'assistant-repair.zip');createKnownGoodSandboxRepair(workspace,repair);
        return {state:'downloaded',repairPath:repair};
      }
    });
    assert.equal(sawProtocol,true);
    assert.equal(result.state,'passed');
    assert.equal(result.steps.chatgptPowerShellRoundTrip,'pass');
    assert.match(fs.readFileSync(path.join(result.workspace.repo,'chatgpt-powershell-marker.txt'),'utf8'),/CHATGPT-POWERSHELL-ROUNDTRIP/);
  } finally {
    if(previous===undefined)delete process.env.YARDMASTER_TEST_POWERSHELL_PASTE_STUB;else process.env.YARDMASTER_TEST_POWERSHELL_PASTE_STUB=previous;
    await new Promise(r=>setTimeout(r,300));
    fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:200});
  }
});

test('self-test failure marks the active stage failed and creates an exact diagnostic ZIP',async t=>{
  if(process.platform!=='win32'){t.diagnostic('Windows-only self-test diagnostic test.');return}
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster-self-test-diagnostic-'));
  try{
    let caught;
    try{
      await runFullSandboxSelfTest({
        dataDir:temp,
        appRoot:path.dirname(path.dirname(fileURLToPath(import.meta.url))),
        chatSettings:{mode:'Work',model:'GPT-5.6 Sol',thinkingEffort:'High'},
        submitRepair:async options=>{
          await options.onAssistantProtocol(['YARDMASTER','POWERSHELL',"Set-Content -LiteralPath '.\\wrong-marker.txt' -Value 'WRONG'",'END_POWERSHELL','END'].join('\n'));
          throw new Error('unreachable');
        }
      });
    }catch(error){caught=error}
    assert.ok(caught);
    assert.equal(caught.selfTest.state,'failed');
    assert.equal(caught.selfTest.stage,'chatgptPowerShellRoundTrip');
    assert.equal(caught.selfTest.steps.chatgptPowerShellRoundTrip,'failed');
    assert.ok(caught.selfTest.diagnostic?.path);
    assert.ok(fs.existsSync(caught.selfTest.diagnostic.path));
    assert.equal(fs.readFileSync(caught.selfTest.diagnostic.path).subarray(0,2).toString(),'PK');
  } finally {
    await new Promise(r=>setTimeout(r,300));
    fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:200});
  }
});


test('PowerShell clipboard UI activation tolerates Windows Terminal ownership and slow window focus',()=>{
  const script=buildPowerShellUiPasteScript({title:'Yardmaster Paste fixture',pid:4321,uiStatePath:'C:\\temp\\ui-state.json'});
  assert.match(script,/AddSeconds\(45\)/);
  assert.match(script,/SetForegroundWindow/);
  assert.match(script,/BringWindowToTop/);
  assert.match(script,/ShowWindowAsync/);
  assert.match(script,/GetForegroundWindow/);
  assert.match(script,/AppActivate\(\[int\]\$pidToActivate\)/);
  assert.match(script,/MainWindowTitle/);
  assert.match(script,/native-window-owner/);
  assert.match(script,/visibleWindows/);
  assert.match(script,/SendKeys\('\^v'\)/);
  assert.match(script,/SendKeys\('\{ENTER\}'\)/);
});


test('PowerShell bootstrap signals ready before transcript setup and uses a file-based startup path',()=>{
  const script=buildPowerShellBootstrapScript({
    title:'Yardmaster Paste fixture',
    readyPath:'C:\\temp\\ready.txt',
    transcriptPath:'C:\\temp\\transcript.txt',
    startupErrorPath:'C:\\temp\\startup-error.txt',
    pidPath:'C:\\temp\\powershell-pid.txt'
  });
  assert.ok(script.indexOf("Set-Content -LiteralPath 'C:\\temp\\ready.txt'")<script.indexOf('Start-Transcript'));
  assert.match(script,/powershell-startup-error|startup-error\.txt/i);
  assert.match(script,/WindowTitle/);
  assert.match(script,/powershell-pid\.txt/);
});

test('PowerShell launcher opens a separate visible PowerShell and records launcher status',()=>{
  const script=buildPowerShellLauncherScript({
    bootstrapPath:'C:\\temp\\powershell-bootstrap.ps1',
    launcherExitPath:'C:\\temp\\powershell-launch-exit.txt'
  });
  assert.match(script,/start "" powershell\.exe/);
  assert.match(script,/-NoExit/);
  assert.match(script,/-File "C:\\temp\\powershell-bootstrap\.ps1"/);
  assert.match(script,/powershell-launch-exit\.txt/);
});


test('manual Play Store adoption accepts a running gate when PID probing is unavailable but runner logs are actively updating',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster-adopt-active-'));
  try{
    const repo=path.join(temp,'repo'),root=path.join(repo,'test-results','86chaos-play-store-release-gate'),runId='manual-live-fixture',runDir=path.join(root,runId);
    fs.mkdirSync(path.join(runDir,'runner-logs'),{recursive:true});
    fs.writeFileSync(path.join(root,'.current-run.lock'),JSON.stringify({runId,pid:99999999,runDir}));
    fs.writeFileSync(path.join(root,'.last-run.json'),JSON.stringify({runId,runDir,mode:'full'}));
    fs.writeFileSync(path.join(runDir,'runner-state.json'),JSON.stringify({runId,status:'running',currentPhase:'playwright',playwrightStarted:true,finalExitCode:null}));
    fs.writeFileSync(path.join(runDir,'runner-logs','playwright.log'),'[PASS] 85/347 chromium\n');
    const info=discoverAdoptableReleaseGate(repo);
    assert.equal(info?.active,true);
    assert.equal(info?.activityFresh,true);
  }finally{fs.rmSync(temp,{recursive:true,force:true})}
});

test('manual Play Store adoption rejects stale running metadata when the PID is gone and logs stopped updating',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster-adopt-stale-'));
  try{
    const repo=path.join(temp,'repo'),root=path.join(repo,'test-results','86chaos-play-store-release-gate'),runId='manual-stale-fixture',runDir=path.join(root,runId);
    fs.mkdirSync(path.join(runDir,'runner-logs'),{recursive:true});
    const lock=path.join(root,'.current-run.lock'),last=path.join(root,'.last-run.json'),state=path.join(runDir,'runner-state.json'),log=path.join(runDir,'runner-logs','playwright.log');
    fs.writeFileSync(lock,JSON.stringify({runId,pid:99999999,runDir}));
    fs.writeFileSync(last,JSON.stringify({runId,runDir,mode:'full'}));
    fs.writeFileSync(state,JSON.stringify({runId,status:'running',currentPhase:'playwright'}));
    fs.writeFileSync(log,'old output\n');
    const old=new Date(Date.now()-11*60*1000);fs.utimesSync(state,old,old);fs.utimesSync(log,old,old);
    const info=discoverAdoptableReleaseGate(repo);
    assert.equal(info?.active,false);
    assert.equal(info?.activityFresh,false);
  }finally{fs.rmSync(temp,{recursive:true,force:true})}
});


test('adopted Play Store terminal state completes immediately after the monitored process is gone even when logs are fresh',async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster-adopt-terminal-'));
  try{
    const repo=path.join(temp,'repo'),root=path.join(repo,'test-results','86chaos-play-store-release-gate'),runId='manual-terminal-fixture',runDir=path.join(root,runId);
    fs.mkdirSync(path.join(runDir,'runner-logs'),{recursive:true});
    fs.writeFileSync(path.join(root,'.current-run.lock'),JSON.stringify({runId,pid:99999999,runDir}));
    fs.writeFileSync(path.join(root,'.last-run.json'),JSON.stringify({runId,runDir,mode:'full'}));
    const statePath=path.join(runDir,'runner-state.json');
    fs.writeFileSync(statePath,JSON.stringify({runId,status:'running',currentPhase:'playwright',playwrightStarted:true,finalExitCode:null}));
    fs.writeFileSync(path.join(runDir,'runner-logs','playwright.log'),'[PASS] 85/347 chromium\n');
    let finish;
    const done=new Promise(resolve=>{finish=resolve});
    const controller=adoptRunningReleaseGate({repoPath:repo,pollMs:50,onFinish:(code,snapshot)=>finish({code,snapshot})});
    fs.writeFileSync(statePath,JSON.stringify({runId,status:'failed',currentPhase:'report-collection',playwrightStarted:true,playwrightCompleted:true,finalExitCode:1,blockingReason:'fixture failure'}));
    const result=await Promise.race([done,new Promise((_,reject)=>setTimeout(()=>reject(new Error('adopted terminal state did not finish promptly')),1500))]);
    controller.stop();
    assert.equal(result.code,1);
    assert.equal(result.snapshot.status,'failed');
  }finally{fs.rmSync(temp,{recursive:true,force:true})}
});
