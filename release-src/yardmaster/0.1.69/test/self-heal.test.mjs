import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  SELF_HEAL_REQUIRED_TESTS,
  captureWorkflowCheckpoint,
  selfHealPrompt,
  validateSelfHealPlan,
  versionGreater
} from '../automation/self-heal.mjs';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('self-heal checkpoint preserves the current workflow and chooses the correct resume intent',()=>{
  const base={workflow:{state:'chatgpt',repairAttempts:2,handoffPath:'C:/fixture/failure.zip'},run:{state:'failed',log:['failure']},deployment:{state:'Idle'},chatgpt:{state:'Working'}};
  const cfg={branch:'testing',testType:'full',chatMode:'Work',model:'GPT-5.6 Sol',thinkingEffort:'High',repoUpdateMode:'automatic'};
  const handoff=captureWorkflowCheckpoint({state:base,config:cfg,version:'0.1.69'});
  assert.equal(handoff.resume.kind,'resume-handoff');
  assert.equal(handoff.workflow.repairAttempts,2);
  const testing=captureWorkflowCheckpoint({state:{...base,workflow:{state:'testing',closedLoop:true},run:{state:'running',log:[]}},config:cfg,version:'0.1.69'});
  assert.deepEqual(testing.resume,{kind:'resume-test',testType:'full',closedLoop:true});
  const deployment=captureWorkflowCheckpoint({state:{...base,workflow:{state:'tests-passed'},run:{state:'passed'},deployment:{state:'Waiting',expectedCommit:'abc123'}},config:cfg,version:'0.1.69'});
  assert.deepEqual(deployment.resume,{kind:'watch-deployment',expectedCommit:'abc123'});
});

test('self-heal plan requires a newer published 86chaos.com release and every certification test',()=>{
  const plan={schema:1,version:'0.1.70',published:true,releaseManifestUrl:'https://www.86chaos.com/yardmaster/release.json',requiredTests:[...SELF_HEAL_REQUIRED_TESTS]};
  const valid=validateSelfHealPlan(plan,{currentVersion:'0.1.69'});
  assert.equal(valid.version,'0.1.70');
  assert.deepEqual(valid.requiredTests,['test:self-heal','test:playwright','test:play-store']);
  assert.throws(()=>validateSelfHealPlan({...plan,published:false},{currentVersion:'0.1.69'}),/not marked as published/i);
  assert.throws(()=>validateSelfHealPlan({...plan,version:'0.1.69'},{currentVersion:'0.1.69'}),/must be newer/i);
  assert.throws(()=>validateSelfHealPlan({...plan,releaseManifestUrl:'https://evil.example/release.json'},{currentVersion:'0.1.69'}),/86chaos\.com/i);
  assert.throws(()=>validateSelfHealPlan({...plan,requiredTests:['test:self-heal','test:playwright']},{currentVersion:'0.1.69'}),/test:play-store/i);
  assert.throws(()=>validateSelfHealPlan({...plan,requiredTests:[...SELF_HEAL_REQUIRED_TESTS,'shell:whatever']},{currentVersion:'0.1.69'}),/unsupported tests/i);
  assert.equal(versionGreater('0.1.70','0.1.69'),true);
  assert.equal(versionGreater('0.1.69','0.1.69'),false);
});

test('self-heal ChatGPT prompt locks the repair to Yardmaster and requires website publish plus Playwright and full Play Store certification',()=>{
  const prompt=selfHealPrompt({currentVersion:'0.1.69',reason:'fixture crash',checkpoint:{resume:{kind:'resume-handoff'}}});
  for(const phrase of [
    'YARDMASTER SELF-HEAL RECOVERY',
    'not from the 86 Chaos application',
    'Do not modify the 86 Chaos application repository',
    'Publish the repaired Yardmaster Windows release',
    'YARDMASTER_SELF_HEAL.json',
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
  assert.match(engine,/SELF_HEAL_REQUIRED_TESTS/);
  assert.match(engine,/test:playwright/);
  assert.match(engine,/test:play-store/);
  assert.match(server,/fetchAndCertifyPublishedSelfHeal/);
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
  assert.match(server,/YARDMASTER_TEST_SELF_HEAL_QUEUE_ONLY/);
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
