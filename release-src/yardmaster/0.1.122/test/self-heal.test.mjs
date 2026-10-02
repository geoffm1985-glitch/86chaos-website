import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {
  SELF_HEAL_REQUIRED_TESTS,
  captureWorkflowCheckpoint,
  selfHealPrompt,
  validateSelfHealPlan,
  validateRegressionCoverageFiles,
  versionGreater
} from '../automation/self-heal.mjs';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('self-heal checkpoint preserves the current workflow and chooses the correct resume intent',()=>{
  const base={workflow:{state:'chatgpt',repairAttempts:2,handoffPath:'C:/fixture/failure.zip'},run:{state:'failed',log:['failure']},deployment:{state:'Idle'},chatgpt:{state:'Working'}};
  const cfg={branch:'testing',testType:'full',chatMode:'Work',model:'GPT-5.6 Sol',thinkingEffort:'High',repoUpdateMode:'automatic'};
  const handoff=captureWorkflowCheckpoint({state:base,config:cfg,version:'0.1.83'});
  assert.equal(handoff.resume.kind,'resume-handoff');
  assert.equal(handoff.workflow.repairAttempts,2);
  const testing=captureWorkflowCheckpoint({state:{...base,workflow:{state:'testing',closedLoop:true},run:{state:'running',log:[]}},config:cfg,version:'0.1.83'});
  assert.deepEqual(testing.resume,{kind:'resume-test',testType:'full',closedLoop:true});
  const deployment=captureWorkflowCheckpoint({state:{...base,workflow:{state:'tests-passed'},run:{state:'passed'},deployment:{state:'Waiting',expectedCommit:'abc123'}},config:cfg,version:'0.1.83'});
  assert.deepEqual(deployment.resume,{kind:'watch-deployment',expectedCommit:'abc123'});
});

test('self-heal plan requires exact Play Store and Playwright regression coverage for the detected failure',()=>{
  const failure='fixture internal automation crash';
  const plan={schema:1,version:'0.1.84',published:true,releaseManifestUrl:'https://www.86chaos.com/yardmaster/release.json',requiredTests:[...SELF_HEAL_REQUIRED_TESTS],regressionCoverage:{exactFailure:failure,playStoreTests:['test/self-heal.test.mjs'],playwrightTests:['test/playwright/full-app.e2e.spec.mjs']}};
  const valid=validateSelfHealPlan(plan,{currentVersion:'0.1.83',expectedFailure:failure});
  assert.equal(valid.version,'0.1.84');assert.deepEqual(valid.requiredTests,['test:self-heal','test:playwright','test:play-store']);assert.equal(valid.regressionCoverage.exactFailure,failure);
  assert.throws(()=>validateSelfHealPlan({...plan,published:false},{currentVersion:'0.1.83',expectedFailure:failure}),/not marked as published/i);
  assert.throws(()=>validateSelfHealPlan({...plan,version:'0.1.70'},{currentVersion:'0.1.83',expectedFailure:failure}),/must be newer/i);
  assert.throws(()=>validateSelfHealPlan({...plan,releaseManifestUrl:'https://evil.example/release.json'},{currentVersion:'0.1.83',expectedFailure:failure}),/86chaos\.com/i);
  assert.throws(()=>validateSelfHealPlan({...plan,requiredTests:['test:self-heal','test:playwright']},{currentVersion:'0.1.83',expectedFailure:failure}),/test:play-store/i);
  assert.throws(()=>validateSelfHealPlan({...plan,regressionCoverage:undefined},{currentVersion:'0.1.83',expectedFailure:failure}),/regressionCoverage/i);
  assert.throws(()=>validateSelfHealPlan({...plan,regressionCoverage:{...plan.regressionCoverage,exactFailure:'different failure'}},{currentVersion:'0.1.83',expectedFailure:failure}),/exact detected failure/i);
  assert.throws(()=>validateSelfHealPlan({...plan,regressionCoverage:{...plan.regressionCoverage,playStoreTests:[]}},{currentVersion:'0.1.83',expectedFailure:failure}),/Play Store\/certification coverage/i);
  assert.throws(()=>validateSelfHealPlan({...plan,regressionCoverage:{...plan.regressionCoverage,playwrightTests:[]}},{currentVersion:'0.1.83',expectedFailure:failure}),/Playwright coverage/i);
  assert.equal(versionGreater('0.1.84','0.1.83'),true);assert.equal(versionGreater('0.1.83','0.1.83'),false);
});

test('self-heal regression declarations must point to test files actually added or updated in both categories',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster-self-heal-coverage-')),current=path.join(temp,'current'),candidate=path.join(temp,'candidate');
  try{
    for(const rootDir of [current,candidate]){fs.mkdirSync(path.join(rootDir,'test','playwright'),{recursive:true});fs.writeFileSync(path.join(rootDir,'test','self-heal.test.mjs'),'baseline');fs.writeFileSync(path.join(rootDir,'test','playwright','full-app.e2e.spec.mjs'),'baseline');}
    fs.writeFileSync(path.join(candidate,'test','self-heal.test.mjs'),'play-store regression updated');fs.writeFileSync(path.join(candidate,'test','playwright','full-app.e2e.spec.mjs'),'playwright regression updated');
    const coverage={playStoreTests:['test/self-heal.test.mjs'],playwrightTests:['test/playwright/full-app.e2e.spec.mjs']};assert.equal(validateRegressionCoverageFiles(candidate,coverage,{currentAppRoot:current}),true);
    fs.writeFileSync(path.join(candidate,'test','self-heal.test.mjs'),'baseline');assert.throws(()=>validateRegressionCoverageFiles(candidate,coverage,{currentAppRoot:current}),/Play Store\/certification regression coverage was declared but none.*added or updated/i);
    fs.writeFileSync(path.join(candidate,'test','self-heal.test.mjs'),'play-store regression updated');fs.writeFileSync(path.join(candidate,'test','playwright','full-app.e2e.spec.mjs'),'baseline');assert.throws(()=>validateRegressionCoverageFiles(candidate,coverage,{currentAppRoot:current}),/Playwright regression coverage was declared but none.*added or updated/i);
  }finally{fs.rmSync(temp,{recursive:true,force:true})}
});

test('self-heal ChatGPT prompt locks the repair to Yardmaster and requires website publish plus Playwright and full Play Store certification',()=>{
  const prompt=selfHealPrompt({currentVersion:'0.1.83',reason:'fixture crash',checkpoint:{resume:{kind:'resume-handoff'}}});
  for(const phrase of [
    'YARDMASTER SELF-HEAL RECOVERY',
    'not from the 86 Chaos application',
    'Do not modify the 86 Chaos application repository',
    'Publish the repaired Yardmaster Windows release',
    'YARDMASTER_SELF_HEAL.json',
    'MANDATORY REGRESSION CONTRACT',
    'regressionCoverage.exactFailure',
    'regressionCoverage.playStoreTests',
    'regressionCoverage.playwrightTests',
        'npm run test:self-heal',
    'npm run test:playwright',
    'npm run test:play-store',
    'resume-handoff'
  ])assert.ok(prompt.includes(phrase),phrase);
});

test('self-heal engine verifies website SHA, stages tests, and only then invokes the updater resume path',()=>{
  const engine=read('automation/self-heal.mjs'),server=read('server.mjs');
  assert.match(engine,/sha256File/);
  assert.match(engine,/manifest\.sha256/);
  assert.match(engine,/npmCommand\(\),\['ci','--no-audit','--no-fund'\]/);
  assert.match(engine,/SELF_HEAL_REQUIRED_TESTS/);assert.match(engine,/validateRegressionCoverageFiles/);assert.match(engine,/expectedFailure/);
  assert.match(engine,/test:playwright/);
  assert.match(engine,/test:play-store/);
  assert.match(server,/fetchAndCertifyPublishedSelfHeal/);assert.match(server,/expectedFailure:request\.rootReason\|\|request\.reason/);assert.match(server,/currentAppRoot:__dirname/);
  assert.match(server,/-ExpectedSha256',certified\.sha256/);
  assert.match(read('scripts/Update-Yardmaster.ps1'),/ExpectedSha256/);
  assert.match(read('scripts/Update-Yardmaster.ps1'),/checksum changed after certification/);
  assert.match(server,/state\.selfHeal=.*preparing-update/s);
  assert.match(server,/resumeAfterUpdate:\{kind:'self-heal',checkpoint:request\.checkpoint\}/);
  assert.match(server,/restoreSelfHealCheckpoint/);
  assert.match(server,/confirmSelfHealUpdateAfterSoak/);
  assert.match(server,/YARDMASTER_SELF_HEAL_SOAK_MS\|\|60000/);
  assert.match(server,/Post-update health soak/);
  assert.match(server,/function resumeSelfHealCheckpoint/);
  assert.match(server,/Workflow resume .* is held until the post-update health soak passes/);
  assert.match(server,/passed its post-update health soak\. Resuming the saved workflow now/);
  const restore=(server.match(/function restoreSelfHealCheckpoint\(checkpoint\)\{[\s\S]*?\n\}/)||[])[0]||'';
  assert.doesNotMatch(restore,/submitCurrentHandoff|runTest\(|watchDeployment\(/,'saved work must not resume before the health soak passes');
  assert.match(server,/clearSelfHealRequest\(dataDir\)/);
  assert.match(server,/resume-handoff/);
  assert.match(server,/resume-test/);
  assert.match(server,/watch-deployment/);
  assert.match(server,/YARDMASTER_TEST_SELF_HEAL_QUEUE_ONLY/);assert.match(server,/if\(!request\.rootReason\)\{request=\{\.\.\.request,rootReason:String\(request\.reason\|\|'Yardmaster internal failure'\)\}/);
});

test('self-heal retry bundles carry the original screenshot diagnostic forward',()=>{
  const engine=read('automation/self-heal.mjs');
  assert.match(engine,/SOURCE_DIAGNOSTIC/);
  assert.match(engine,/fs\.copyFileSync\(sourceDiagnostic/);
});

test('independent Windows supervisor captures screenshots, creates a diagnostic request, detects hangs, restarts, and stays out of the replaceable app folder',()=>{
  const supervisor=read('scripts/Yardmaster-Supervisor.ps1'),start=read('scripts/Start-Yardmaster.ps1'),installer=read('scripts/Install-Yardmaster.ps1'),updater=read('scripts/Update-Yardmaster.ps1'),uninstaller=read('scripts/Uninstall-Yardmaster.ps1');
  assert.match(read('desktop.cjs'),/capturePage\(\)/);
  assert.match(read('desktop.cjs'),/renderer-unresponsive/);
  assert.match(read('desktop.cjs'),/render-process-gone/);
  assert.match(supervisor,/yardmaster-window\.png/);
  assert.match(supervisor,/desktop-health\.json/);
  assert.match(supervisor,/Desktop heartbeat is stale/);
  assert.doesNotMatch(supervisor,/CopyFromScreen|VirtualScreen/,'self-heal diagnostics must not capture the entire desktop');
  assert.match(supervisor,/Yardmaster-Self-Heal-Diagnostic/);
  assert.match(supervisor,/self-heal-request\.json/);
  assert.match(supervisor,/operator-unhealthy-timeout/);
  assert.match(supervisor,/TotalMinutes -ge 3/);
  assert.match(supervisor,/unexpected-yardmaster-exit/);
  assert.match(supervisor,/crashes\.Count -ge 3/);
  assert.match(supervisor,/Restore-YardmasterRollback/);
  assert.match(supervisor,/rollback\\app/);
  assert.match(supervisor,/failed-update\.json/);
  assert.match(supervisor,/saved self-heal request remains queued/i);
  assert.match(start,/Yardmaster-Supervisor\.ps1/);
  assert.match(installer,/Copy-Item[\s\S]*Yardmaster-Supervisor\.ps1/);
  assert.match(updater,/Copy-Item[\s\S]*Yardmaster-Supervisor\.ps1/);
  assert.match(uninstaller,/Yardmaster-Supervisor\.ps1/);
});


test('self-heal live status exposes the complete Windows and paired-phone status contract from one operator state',()=>{
  const server=read('server.mjs'),html=read('public/index.html'),app=read('public/app.js');
  for(const field of ['reason','phase','currentAction','waitingOn','attempt','maxAttempts','candidateVersion','testingStage','lastSuccessfulStep','nextAction','resumeCheckpoint'])assert.match(server,new RegExp(field));
  for(const id of ['selfHealBanner','selfHealReason','selfHealPhase','selfHealDoing','selfHealWaiting','selfHealAttempt','selfHealCandidate','selfHealTesting','selfHealLastStep','selfHealNext','selfHealResume']){assert.ok(html.includes('id="'+id+'"'),id);assert.ok(app.includes('#'+id),id)}
  assert.match(server,/selfHeal:selfHealStatusSnapshot\(\)/);assert.match(server,/YARDMASTER_TEST_SELF_HEAL_QUEUE_ONLY/);
});


test('internal automation failures automatically enter self-heal and the isolated queue-only hook cannot start certification',()=>{
  const server=read('server.mjs');
  assert.match(server,/ChatGPT handoff automation failed:[^\n]*queueSelfHeal|queueSelfHeal\('ChatGPT handoff automation failed:/s);
  assert.match(server,/ChatGPT implementation automation failed:[^\n]*queueSelfHeal|queueSelfHeal\('ChatGPT implementation automation failed:/s);
  assert.match(server,/function queueSelfHeal[\s\S]*state\.selfHeal=\{state:'queued'/);
  assert.match(server,/YARDMASTER_TEST_SELF_HEAL_QUEUE_ONLY/);
  assert.match(server,/process\.env\.YARDMASTER_TEST_SELF_HEAL_QUEUE_ONLY!==\'1\'&&readSelfHealRequest\(dataDir\)/);
});
