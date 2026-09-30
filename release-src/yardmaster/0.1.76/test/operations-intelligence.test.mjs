import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  failureFingerprint,recordFailureMemory,lookupFailureMemory,recordKnownRepair,workflowTimeline,listEvidence,resolveEvidenceFile,
  createReproductionCapsule,smartTestSelection,detectChangedFiles,recordTestIntelligence,flakyTestIntelligence,preflightDoctor,
  resourceSnapshot,assessHang,createRepositorySnapshot,listWorktrees,createWorktree,removeWorktree,buildManifest,releaseProvenance,
  selfHealEscalation,compareSelfHealAttempts,mobileActionCards,recordCostEvent,costGuardSnapshot,dryRunPlan,listProfiles,saveProfile,
  deleteProfile,healthSnapshot,appendAudit,readAudit,changesSinceLastGood,annotateRun,runAnnotations,safeModeStatus,setSafeMode
} from '../automation/ops-intelligence.mjs';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'ym-ops-intel-'));
function git(cwd,args){return execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim()}
function fixtureRepo(base){
  const repo=path.join(base,'repo');fs.mkdirSync(repo,{recursive:true});git(repo,['init','-b','testing']);git(repo,['config','user.email','yardmaster-test@example.invalid']);git(repo,['config','user.name','Yardmaster Test']);fs.writeFileSync(path.join(repo,'package.json'),'{"name":"fixture"}\n');fs.writeFileSync(path.join(repo,'package-lock.json'),'{"lockfileVersion":3}\n');git(repo,['add','.']);git(repo,['commit','-m','fixture']);return repo;
}

test('failure fingerprinting remembers repeated failures and known fixes without using real repositories',()=>{
  const dir=tmp();try{
    const a={stage:'playwright',test:'desktop layout',message:'Timeout 12345 at 0xABC123',logs:['same 98765 failure']};
    const fp=failureFingerprint(a);assert.equal(fp.length,64);
    const first=recordFailureMemory(dir,a),second=recordFailureMemory(dir,a);assert.equal(first.fingerprint,second.fingerprint);assert.equal(second.occurrences,2);
    recordKnownRepair(dir,fp,{version:'0.1.76',summary:'fixed fixture',files:['public/app.js']});
    const known=lookupFailureMemory(dir,a);assert.equal(known.repairs.length,1);assert.equal(known.repairs[0].version,'0.1.76');
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('timeline, mobile action cards, health panel and hang watchdog expose factual state',()=>{
  const state={run:{state:'running',title:'Full Playwright',currentTest:'fixture',startedAt:Date.now()-500000,lastSignalAt:Date.now()-400000},workflow:{state:'testing'},deployment:{state:'Idle'},chatgpt:{state:'Ready'},selfHeal:{state:'idle'},remote:{active:false},pushHealth:{}};
  assert.equal(workflowTimeline(state).find(x=>x.id==='test').status,'active');
  assert.equal(mobileActionCards(state)[0].id,'run');
  const hang=assessHang(state,{activeAlive:true});assert.equal(hang.state,'stalled');
  const health=healthSnapshot({state,config:{dryRunMode:false},preflight:{checks:[{id:'git-repository',ok:true},{id:'branch',detail:'testing'}]},resources:{freeSystemMemory:2*1024**3}});assert.ok(health.some(x=>x.id==='git'&&x.status==='ok'));
});

test('evidence viewer resolves only Yardmaster data paths',()=>{
  const dir=tmp();try{const run=path.join(dir,'runs','one');fs.mkdirSync(run,{recursive:true});fs.writeFileSync(path.join(run,'error-context.md'),'fixture');const rows=listEvidence(dir);assert.ok(rows.some(x=>x.name==='error-context.md'));assert.equal(fs.readFileSync(resolveEvidenceFile(dir,rows[0].id),'utf8'),'fixture');assert.throws(()=>resolveEvidenceFile(dir,'../outside.txt'),/escaped/)}finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('reproduction capsules, snapshots, worktrees and changed-file intelligence use isolated temporary Git repositories',()=>{
  const dir=tmp();try{
    const repo=fixtureRepo(dir),data=path.join(dir,'data');fs.mkdirSync(data);
    fs.writeFileSync(path.join(repo,'feature.txt'),'one\n');git(repo,['add','.']);git(repo,['commit','-m','feature']);
    fs.writeFileSync(path.join(repo,'feature.txt'),'two\n');
    const changed=detectChangedFiles(repo,{base:'HEAD~1',head:'HEAD'});assert.ok(changed.includes('feature.txt'));
    const smart=smartTestSelection(['server.mjs','public/app.js']);assert.ok(smart.nodeTests.includes('test/operator.integration.test.mjs'));assert.ok(smart.playwrightTests.includes('test/playwright/full-app.e2e.spec.mjs'));assert.deepEqual(smart.mandatoryFinal,['npm run test:play-store','npm run test:playwright:full']);
    const repro=createReproductionCapsule(data,{repoPath:repo,state:{run:{currentTest:'fixture',log:['failure']},workflow:{state:'failed-manual'}},config:{branch:'testing',testType:'full'},version:'0.1.76'});assert.ok(fs.existsSync(repro));
    const snap=createRepositorySnapshot(data,{repoPath:repo,config:{branch:'testing'},version:'0.1.76'});assert.ok(fs.existsSync(snap));
    git(repo,['restore','feature.txt']);
    const wt=createWorktree(data,{repoPath:repo,branch:'experiment/fixture',base:'HEAD'});assert.ok(fs.existsSync(wt.path));assert.ok(listWorktrees(repo).some(x=>x.branch==='experiment/fixture'));assert.equal(removeWorktree({repoPath:repo,worktreePath:wt.path}),true);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('test history identifies intermittent tests instead of hiding them',()=>{
  const dir=tmp();try{
    recordTestIntelligence(dir,{currentTest:'fixture test',exitCode:0,elapsedMs:100,state:'passed'});
    recordTestIntelligence(dir,{currentTest:'fixture test',exitCode:1,elapsedMs:140,state:'failed'});
    const row=flakyTestIntelligence(dir).find(x=>x.name==='fixture test');assert.equal(row.intermittent,true);assert.equal(row.runs,2);assert.equal(row.fail,1);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('preflight doctor and resource watchdog report machine facts without external services',()=>{
  const dir=tmp();try{const repo=fixtureRepo(dir),doctor=preflightDoctor({repoPath:repo,config:{branch:'testing'},operatorPort:8787});assert.ok(doctor.checks.some(x=>x.id==='node'));assert.ok(doctor.checks.some(x=>x.id==='test-policy'&&x.ok));const resources=resourceSnapshot();assert.ok(resources.rss>0);assert.ok(resources.totalSystemMemory>0)}finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('manifest and release provenance produce reproducible file hashes',()=>{
  const dir=tmp();try{const repo=fixtureRepo(dir),manifest=buildManifest(repo);assert.ok(manifest.fileCount>=2);assert.equal(manifest.rootHash.length,64);const p=releaseProvenance({repoPath:repo,appRoot:repo,version:'0.1.76',state:{run:{state:'passed'}},config:{branch:'testing'}});assert.equal(p.version,'0.1.76');assert.equal(p.branch,'testing');assert.equal(p.manifestRootHash.length,64)}finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('self-heal escalation grows deliberately and attempt comparison stays bounded',()=>{
  assert.equal(selfHealEscalation(1,5).label,'surgical repair');assert.equal(selfHealEscalation(5,5).label,'safe escalation stop');
  const rows=compareSelfHealAttempts(Array.from({length:14},(_,i)=>({attempt:i+1,state:i%2?'failed':'pass'})));assert.equal(rows.length,10);
});

test('cost guard, dry-run plans and configuration profiles are persistent local controls',()=>{
  const dir=tmp();try{
    recordCostEvent(dir,{kind:'github-actions-minutes',units:1200});recordCostEvent(dir,{kind:'vercel-build',units:90});
    const cost=costGuardSnapshot(dir,{githubActionsMinuteLimit:1300,vercelBuildLimit:100});assert.equal(cost.warning,true);
    const plan=dryRunPlan('push',{config:{branch:'testing'}});assert.equal(plan.willExecute,false);assert.ok(plan.steps.some(x=>/push origin testing/.test(x)));
    const saved=saveProfile(dir,'Emergency Repair',{branch:'testing',testType:'targeted',chatMode:'Work',model:'GPT-5.6 Sol',thinkingEffort:'High',repoUpdateMode:'automatic',dryRunMode:true});assert.equal(saved.config.dryRunMode,true);assert.ok(Object.keys(listProfiles(dir)).length===1);deleteProfile(dir,'Emergency Repair');assert.equal(Object.keys(listProfiles(dir)).length,0);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('tamper-evident audit chain, notes/bookmarks and Safe Mode persist locally',()=>{
  const dir=tmp();try{
    const a=appendAudit(dir,{action:'start',detail:'fixture'}),b=appendAudit(dir,{action:'stop',detail:'fixture'});assert.equal(b.previousHash,a.hash);assert.equal(readAudit(dir)[0].sequence,2);
    annotateRun(dir,{runId:'fixture',note:'browser got quiet',bookmark:true,state:{run:{currentTest:'fixture',progress:50}}});assert.equal(runAnnotations(dir,'fixture')[0].bookmark,true);
    assert.equal(safeModeStatus(dir).enabled,false);setSafeMode(dir,true,'fixture crash');assert.equal(safeModeStatus(dir).enabled,true);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('what-changed-since-last-good compares commits and preserves mandatory dual test selection',()=>{
  const dir=tmp();try{
    const repo=fixtureRepo(dir),data=path.join(dir,'data'),runs=path.join(data,'runs','good');fs.mkdirSync(runs,{recursive:true});
    const good=git(repo,['rev-parse','HEAD']);fs.writeFileSync(path.join(runs,'metadata.json'),JSON.stringify({id:'good',exitCode:0,gitCommit:good,finishedAt:Date.now(),configHash:'old'}));
    fs.writeFileSync(path.join(repo,'server.mjs'),'export const x=1;\n');git(repo,['add','.']);git(repo,['commit','-m','change']);
    const result=changesSinceLastGood({repoPath:repo,dataDir:data,config:{branch:'testing'}});assert.ok(result.changedFiles.includes('server.mjs'));assert.ok(result.smartTests.mandatoryFinal.includes('npm run test:playwright:full'));
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('feature registry makes dual regression coverage and the single testing command mandatory',()=>{
  const policy=JSON.parse(fs.readFileSync(path.join(root,'YARDMASTER_FEATURES.json'),'utf8'));assert.equal(policy.policy.requiresPlayStoreOrCertificationTest,true);assert.equal(policy.policy.requiresPlaywrightTest,true);assert.equal(policy.policy.requireSingleTestingCommandOnDelivery,true);assert.match(policy.policy.testingCommand,/test:play-store/);assert.match(policy.policy.testingCommand,/test:playwright:full/);
  assert.ok(policy.features.length>=26);for(const feature of policy.features){assert.ok(feature.playStoreTests.length,feature.id);assert.ok(feature.playwrightTests.length,feature.id)}
  const server=fs.readFileSync(path.join(root,'server.mjs'),'utf8'),selfHeal=fs.readFileSync(path.join(root,'automation','self-heal.mjs'),'utf8');assert.match(server,/MANDATORY COVERAGE RULE/);assert.match(server,/Playwright regression coverage/);assert.match(selfHeal,/canaryHealthCheck/);assert.match(selfHeal,/selfHealEscalation/);const supervisor=fs.readFileSync(path.join(root,'scripts','Yardmaster-Supervisor.ps1'),'utf8');assert.match(supervisor,/automatic startup crash-loop recovery/);assert.match(server,/restore-last-snapshot/);
});


test('snapshot restore and updater canary are protective, version-agnostic recovery paths',()=>{
  const restore=fs.readFileSync(path.join(root,'scripts','Restore-Snapshot.ps1'),'utf8'),updater=fs.readFileSync(path.join(root,'scripts','Update-Yardmaster.ps1'),'utf8'),server=fs.readFileSync(path.join(root,'server.mjs'),'utf8');
  assert.match(restore,/tracked-head\.zip/);assert.match(restore,/\/MIR/);assert.match(restore,/\.git/);assert.doesNotMatch(restore,/must be newer than local version/i);
  assert.match(updater,/disposable canary launch/i);assert.match(updater,/candidate failed its isolated canary launch/i);assert.match(updater,/status\.online -eq \$true/);assert.match(updater,/status\.version -eq \[string\]\$incoming\.version/);
  assert.match(server,/Restore-Snapshot\.ps1/);assert.match(server,/Known failure history:/);assert.match(server,/image\/png/);assert.match(server,/application\/zip/);
});
