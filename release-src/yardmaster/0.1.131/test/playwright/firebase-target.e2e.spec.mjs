import {firebaseTempDirectory} from '../../automation/firebase-target.mjs';
import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {firebaseFixture,appRoot} from '../helpers/firebase-fixture.mjs';
import {startMobileFixture,prepareMobile} from '../helpers/mobile-pwa-fixture.mjs';
import {hostedMobileViewport} from '../helpers/loop-update-fixture.mjs';
import {newFirebaseRun,firebasePhase,finishFirebasePhase,firebaseEnvironment} from '../../automation/firebase-target.mjs';
import {canaryHealthCheck} from '../../automation/ops-intelligence.mjs';
import {runSelfHealProcess} from '../../automation/self-heal.mjs';

test('@operatorRecovery130 unexpected operator restart resumes the saved delta without live fallback',async()=>{
  test.setTimeout(180000);const f=await firebaseFixture({gateDelay:10000});
  try{
    await f.start();await f.api('/api/action',{action:'start'});
    await expect.poll(()=>f.runs().length,{timeout:45000}).toBe(1).catch(async error=>{const s=await f.status();throw new Error(error.message+'\nActual startup state: '+JSON.stringify({workflow:s.workflow,firebase:s.firebase,run:s.run,activity:s.activity.slice(-15)}),{cause:error})});
    await f.crash();await f.start();
    await expect.poll(()=>f.runs().length,{timeout:60000}).toBe(2);
    const s=await f.status();expect(s.workflow.operatorRecoveryAttempts).toBe(1);expect(s.workflow.closedLoop).toBe(true);expect(s.workflow.firebase.livePhases).toBe(0);
    expect(f.runs().map(r=>[r.type,r.target])).toEqual([['delta','emulator'],['delta','emulator']]);
  }finally{await f.close()}
});

test('@emulatorRecovery129 blocked delta resumes, recovers a failed startup and executes',async({page})=>{
 test.setTimeout(120000);const f=await firebaseFixture();
 try{
  const cli=path.join(f.repo,'node_modules/firebase-tools/lib/bin/firebase.js'),marker=path.join(f.repo,'first-startup');
  fs.writeFileSync(cli,`if(!require('fs').existsSync(${JSON.stringify(marker)})){require('fs').writeFileSync(${JSON.stringify(marker)},'retry');console.error('Controlled transient startup failure');process.exit(1)};`+fs.readFileSync(cli,'utf8'));
  f.git(['add','.']);f.git(['commit','-m','Startup recovery browser regression']);
  fs.writeFileSync(path.join(f.data,'state.json'),JSON.stringify({workflow:{state:'firebase-blocked',closedLoop:true,repairApplied:true,repairAttempts:2,error:'previous readiness error'}}));
  await f.start();await page.goto(f.url);await f.api('/api/action',{action:'resume'});
  await expect.poll(async()=>(await f.status()).workflow.state,{timeout:90000}).toBe('complete');
  const done=await f.status();expect(done.workflow.firebaseRecoveryAttempts).toBe(1);expect(done.workflow.firebase.fallbackAttempted).toBe(false);expect(done.workflow.repairAttempts).toBe(2);
  expect(f.runs().map(r=>[r.type,r.target])).toEqual([['delta','emulator']]);await expect(page.locator('#runTitle')).toHaveText('Tests Passed');
 }finally{await page.close();await f.close()}
});
import {spawnSync} from 'node:child_process';
import {createContinuousLoopFixture,driveFirebaseCycles} from '../helpers/continuous-loop-fixture.mjs';

test('@storageTemp116 starting the closed loop isolates emulator upload storage from test fixtures',async({page})=>{
 test.setTimeout(120000);const f=await firebaseFixture();try{
  const cli=path.join(f.repo,'node_modules/firebase-tools/lib/bin/firebase.js');
  fs.writeFileSync(cli,`require('fs').writeFileSync('cli-temp.json',JSON.stringify({temp:require('os').tmpdir()}));`+fs.readFileSync(cli,'utf8'));
  f.git(['add','.']);f.git(['commit','-m','Observe emulator process temp isolation']);
  await f.start();await page.goto(f.url);await page.locator('#testType').selectOption('full');await page.getByRole('button',{name:'▶ Start Closed Loop',exact:true}).click();
  await expect.poll(async()=>(await f.status()).workflow.firebase?.phase,{timeout:60000}).toBe('complete');
  expect(JSON.parse(fs.readFileSync(path.join(f.data,'firebase/cli-temp.json'))).temp).toBe(firebaseTempDirectory(path.join(f.data,'firebase')));
  expect(f.runs().map(r=>r.target)).toEqual(['emulator']);expect((await f.status()).workflow.firebase.fallbackAttempted).toBe(false);
 }finally{await page.close();await f.close()}
});

test('@firebaseProject114 full gate pins React project aliases before saved live dotenv settings load',async({page})=>{
  test.setTimeout(90000);const f=await firebaseFixture();try{
    const gate=path.join(f.repo,'gate.mjs');
    // Reproduce the release gate's fill-only dotenv loading before role checks.
    fs.writeFileSync(gate,`for(const key of ['REACT_APP_FIREBASE_PROJECT_ID','REACT_APP_TEST_FIREBASE_PROJECT_ID','CHAOS_EXPECTED_TEST_FIREBASE_PROJECT_ID'])process.env[key] ||= 'chaos-test-d1601';\n`+fs.readFileSync(gate,'utf8'));
    f.git(['add','gate.mjs']);f.git(['commit','-m','Reproduce saved live project settings']);
    await f.start();await page.goto(f.url);await page.locator('#testType').selectOption('full');
    await page.getByRole('button',{name:'▶ Start Closed Loop',exact:true}).click();
    await expect.poll(async()=>(await f.status()).workflow.firebase?.phase,{timeout:30000}).toBe('complete');
    expect(f.runs()).toHaveLength(1);
    for(const key of ['REACT_APP_FIREBASE_PROJECT_ID','REACT_APP_TEST_FIREBASE_PROJECT_ID','CHAOS_EXPECTED_TEST_FIREBASE_PROJECT_ID'])expect(f.runs()[0].env[key]).toBe('demo-86chaos');
    expect((await f.status()).workflow.firebase.livePhases).toBe(0);
  }finally{await page.close();await f.close()}
});

test('@firebaseWindows110 external session config preserves Functions source during an emulator-only delta run',async({page})=>{
  test.setTimeout(120000);
  const f=await firebaseFixture();
  try{
    const functions=path.join(f.repo,'functions');fs.mkdirSync(functions);
    const firebaseFile=path.join(f.repo,'firebase.json'),firebase=JSON.parse(fs.readFileSync(firebaseFile));
    firebase.functions={source:'functions',runtime:'nodejs20'};
    fs.writeFileSync(firebaseFile,JSON.stringify(firebase));
    f.git(['add','.']);f.git(['commit','-m','Add real Functions path contract to browser fixture']);
    await f.start();await page.goto(f.url);
    await page.locator('#testType').selectOption('delta');
    await page.getByRole('button',{name:'▶ Start Closed Loop',exact:true}).click();
    await expect.poll(async()=>(await f.status()).workflow.firebase?.phase,{timeout:60000}).toBe('complete');
    const dir=path.join(f.data,'firebase'),generated=JSON.parse(fs.readFileSync(path.join(dir,'firebase-session.json')));
    expect(path.join(dir,generated.functions.source)).toBe(functions);
    expect(path.isAbsolute(generated.functions.source)).toBe(false);
    expect(f.runs().map(r=>[r.type,r.target])).toEqual([['delta','emulator']]);
    expect((await f.status()).workflow.firebase.fallbackAttempted).toBe(false);
    expect((await f.status()).firebase.emulator.project).toBe('demo-86chaos');
    await expect(page.locator('#firebaseStatus')).toContainText('TARGET: EMULATOR');
    await expect(page.locator('#firebaseStatus')).toContainText('PHASE: complete');
    expect(f.git(['diff','--name-only'])).toBe('');
    expect(fs.existsSync(path.join(f.repo,'firebase-session.json'))).toBe(false);
  }finally{await page.close();await f.close()}
});

test('@firebase103 native target/live-phase settings persist through reload and operator restart; current run remains pinned',async({page})=>{
  test.setTimeout(90000);const f=await firebaseFixture();try{
    await f.start();await page.goto(f.url);await expect(page.locator('#firebaseMode')).toHaveValue('emulator');
    await page.locator('#firebaseMode').selectOption('both');await expect(page.locator('#firebaseLivePhase')).toBeVisible();await page.locator('#firebaseLivePhase').selectOption('full');
    await expect.poll(async()=>(await f.status()).config.firebaseLivePhase).toBe('full');await page.reload();await expect(page.locator('#firebaseMode')).toHaveValue('both');await expect(page.locator('#firebaseLivePhase')).toHaveValue('full');
    await f.stop();await f.start();await page.reload();await expect(page.locator('#firebaseMode')).toHaveValue('both');await page.locator('#testType').selectOption('full');
    await page.getByRole('button',{name:'▶ Start Closed Loop',exact:true}).click();await expect.poll(()=>f.runs().length,{timeout:45000}).toBe(2);
    await expect(page.locator('#firebaseStatus')).toContainText('chaos-test-d1601');await expect(page.locator('#firebaseStatus')).toContainText('billable');expect(f.runs().map(r=>r.type)).toEqual(['full','full']);
  }finally{await page.close();await f.close()}
});
test('@firebase103 hosted Android/PWA has equal Firebase mode, bounded live phase, persistence and status visibility',async({page})=>{
  await page.setViewportSize(hostedMobileViewport(page.viewportSize()));const site=await startMobileFixture(),f=await prepareMobile(page);try{
    await page.goto(site.base+'/yardmaster');await expect(page.locator('#overlay')).toBeHidden();await page.locator('[data-mobile-section-target="branches"]').click();
    await expect(page.locator('#firebaseMode')).toHaveValue('emulator');await page.locator('#firebaseMode').selectOption('both');await expect(page.locator('#firebaseLivePhase')).toBeVisible();await page.locator('#firebaseLivePhase').selectOption('full');
    expect(f.state.config.firebaseMode).toBe('both');expect(f.state.config.firebaseLivePhase).toBe('full');await page.reload();await page.locator('[data-mobile-section-target="branches"]').click();await expect(page.locator('#firebaseLivePhase')).toHaveValue('full');
    f.state.firebase={mode:'both',target:'live',phase:'live-verification',liveProject:'chaos-test-d1601',emulator:{status:'running',products:{auth:'running',firestore:'running'}},telemetry:{emulatorPhases:1,livePhases:1,liveVerificationAttempts:1},updatedAt:Date.now()};
    await page.locator('[data-mobile-section-target="operations"]').click();await expect(page.locator('#mFirebaseStatus')).toContainText('LIVE');await expect(page.locator('#mFirebaseStatus')).toContainText('billable');await expect(page.locator('#mFirebaseStatus')).toContainText('live-verification');
    await page.locator('[data-mobile-section-target="branches"]').click();await page.locator('#firebaseMode').selectOption('live');await expect(page.locator('#firebaseLivePhaseField')).toBeHidden();await page.locator('#firebaseMode').selectOption('emulator');await expect(page.locator('#firebaseLivePhaseField')).toBeHidden();
  }finally{await page.close();await site.close()}
});
for(const [mode,livePhase,expected] of [['emulator','verification',['emulator:full']],['live','verification',['live:full']],['both','verification',['emulator:full','live:verification']],['both','full',['emulator:full','live:full']]])test(`@firebase103 FULL workflow and descendant test environment ${mode}/${livePhase}`,async({page})=>{
  test.setTimeout(90000);const f=await firebaseFixture({mode,livePhase});try{
    await f.start();await page.goto(f.url);await page.locator('#testType').selectOption('full');await page.getByRole('button',{name:'▶ Start Closed Loop',exact:true}).click();
    await expect.poll(async()=>(await f.status()).workflow.firebase?.phase,{timeout:30000}).toBe('complete');expect(f.runs().map(r=>r.target+':'+r.type)).toEqual(expected);
    expect((await f.status()).workflow.firebase.fallbackAttempted).toBe(false);expect((await f.status()).workflow.firebase.liveFirebaseContacted).toBe(false);
    if(mode!=='live')await expect.poll(async()=>(await f.status()).firebase.emulator.status,{timeout:15000}).toBe('stopped');
  }finally{await page.close();await f.close()}
});
test('@firebase103 missing emulator tooling blocks the full phase with a visible reason and zero live attempts',async({page})=>{
  test.setTimeout(90000);const f=await firebaseFixture();try{
    // A malformed bridge is deterministic regardless of the machine's CLI installation.
    fs.writeFileSync(path.join(f.repo,'yardmaster.firebase.json'),JSON.stringify({...f.bridge,projectId:'chaos-test-d1601'}));await f.start();await page.goto(f.url);await page.getByRole('button',{name:'▶ Start Closed Loop',exact:true}).click();
    await expect(page.locator('#runTitle')).toHaveText('Firebase Test Blocked',{timeout:15000});expect(f.runs()).toEqual([]);expect((await f.status()).workflow.firebase.livePhases).toBe(0);
    await expect(page.locator('#currentTest')).toContainText('Invalid 86 Chaos emulator bridge');
  }finally{await page.close();await f.close()}
});
test('@firebase103 BOTH failed live verification must repair locally before one bounded recheck; saved mode survives changed preferences',async({page})=>{
  test.setTimeout(90000);const f=await firebaseFixture({mode:'both',failLive:true});try{
    await f.start();await f.api('/api/config',{testType:'playwright'});await page.goto(f.url);await page.getByRole('button',{name:'▶ Start Closed Loop',exact:true}).click();
    await expect.poll(async()=>(await f.status()).workflow.state,{timeout:30000}).toBe('failed-manual');await page.locator('#firebaseMode').selectOption('live');f.repair();
    await page.getByRole('button',{name:'▶ Resume',exact:true}).click();await expect.poll(async()=>(await f.status()).workflow.firebase.phase,{timeout:30000}).toBe('complete');
    expect(f.runs().map(r=>r.target+':'+r.type)).toEqual(['emulator:full','live:verification','emulator:delta','live:verification']);expect((await f.status()).workflow.firebase.mode).toBe('both');
  }finally{await page.close();await f.close()}
});
test('@firebase103 cancellation, pause and resume retain the emulator phase and remove every owned emulator process',async({page})=>{
  test.setTimeout(90000);const f=await firebaseFixture({gateDelay:4000});try{
    await f.start();await page.goto(f.url);await page.locator('#testType').selectOption('playwright');await page.getByRole('button',{name:'▶ Start Closed Loop',exact:true}).click();await expect.poll(()=>f.runs().length,{timeout:15000}).toBe(1);
    const pids=(await f.status()).firebase.emulator.pids;await f.api('/api/action',{action:'pause'});expect((await f.status()).workflow.firebase.phase).toBe('emulator-playwright');await page.locator('#firebaseMode').selectOption('live');await f.api('/api/action',{action:'resume'});expect((await f.status()).workflow.firebase.mode).toBe('emulator');await f.api('/api/action',{action:'stop'});
    await expect.poll(async()=>(await f.status()).firebase.emulator.status,{timeout:15000}).toBe('stopped');for(const pid of pids)expect(()=>process.kill(pid,0)).toThrow();
  }finally{await page.close();await f.close()}
});
test('@firebase103 inherited Node and actual Playwright browser guards reject live Firebase destinations in emulator mode',async({browserName})=>{
  test.setTimeout(90000);const f=await firebaseFixture(),s=f.session();try{
    await s.start(newFirebaseRun({}));const env=firebaseEnvironment({run:newFirebaseRun({}),bridge:s.bridge,base:process.env});
    // Run a real separate Playwright client with the exact preload inherited by gates.
    const script=`const assert=require('assert');const {chromium}=require(${JSON.stringify(path.join(appRoot,'node_modules/playwright'))});(async()=>{const browser=await chromium.launch(${JSON.stringify({headless:true,...(process.env.YARDMASTER_FIXTURE_BROWSER?{executablePath:process.env.YARDMASTER_FIXTURE_BROWSER,args:['--no-sandbox','--disable-dev-shm-usage']}: {})})});const context=await browser.newContext();const page=await context.newPage();await assert.rejects(page.goto('https://firestore.googleapis.com'));await browser.close()})().catch(e=>{console.error(e);process.exitCode=1});`;
    const r=await runSelfHealProcess(process.execPath,['-e',script],{cwd:path.join(f.repo),env,timeoutMs:20000});expect(r.code,r.stderr).toBe(0);expect((await canaryHealthCheck(appRoot,{env})).firebaseMode).toBe('emulator');expect(browserName).toBe('chromium');
  }finally{await s.stop();await f.close()}
});

for(const mode of ['emulator','both'])test('@firebase103 connected full emulator, assistant handoff, held reply, repair ZIP, local delta and '+mode+' completion',async({page,context})=>{test.setTimeout(300000);const chatPage=await context.newPage(),f=await createContinuousLoopFixture({firebaseMode:mode,chatPage});try{await page.goto(f.url);await page.getByRole('button',{name:'▶ Start Closed Loop',exact:true}).click();await driveFirebaseCycles(f,{mode,onPhase:async phase=>{if(phase==='waiting-reply'){expect(await chatPage.locator('input').evaluate(e=>e.files.length)).toBe(1);await expect(chatPage.getByRole('button',{name:'Stop generating',exact:true})).toBeVisible()}if(phase==='complete')await expect(page.locator('#runTitle')).toHaveText('Tests Passed',{timeout:15000})}})}finally{await page.close();await f.close();await chatPage.close()}});

test('@firebase103 emulator crash visibly blocks the active test instead of running a live phase',async({page})=>{test.setTimeout(90000);const f=await firebaseFixture({gateDelay:4000});try{await f.start();await page.goto(f.url);await page.getByRole('button',{name:'▶ Start Closed Loop',exact:true}).click();await expect.poll(()=>f.runs().length,{timeout:15000}).toBe(1);const pid=(await f.status()).firebase.emulator.pids[0];process.kill(pid,'SIGTERM');await expect(page.locator('#runTitle')).toHaveText('Firebase Test Blocked',{timeout:15000});expect((await f.status()).workflow.firebase.livePhases).toBe(0)}finally{await page.close();await f.close()}});


test('@firebase103 assistant RUN Playwright retains BOTH despite changed preferences and rechecks live only after local repair',async({page})=>{test.setTimeout(90000);const f=await firebaseFixture({mode:'both',failLive:true});try{await f.start();await f.api('/api/config',{testType:'playwright'});await page.goto(f.url);await page.getByRole('button',{name:'▶ Start Closed Loop',exact:true}).click();await expect.poll(async()=>(await f.status()).workflow.state,{timeout:30000}).toBe('failed-manual');await page.locator('#firebaseMode').selectOption('live');f.repair();await f.api('/api/command',{text:'YARDMASTER\nRUN playwright\nEND'});await expect.poll(async()=>(await f.status()).workflow.firebase.phase,{timeout:30000}).toBe('complete');expect(f.runs().map(r=>r.target+':'+r.type)).toEqual(['emulator:full','live:verification','emulator:delta','live:verification']);await expect(page.locator('#firebaseStatus')).toContainText('BOTH')}finally{await page.close();await f.close()}});

test('@firebaseWindows104 Windows preload with spaces and graceful active operator cleanup',async({page})=>{
  const {probeWindowsPreload}=await import('../helpers/firebase-windows-regression.mjs');
  const r=await probeWindowsPreload();expect(r.status,r.stderr).toBe(0);
  const f=await firebaseFixture({gateDelay:4000});
  try{
    await f.start();await page.goto(f.url);await page.getByRole('button',{name:'▶ Start Closed Loop',exact:true}).click();
    await expect.poll(()=>f.runs().length,{timeout:15000}).toBe(1);
    await expect(page.locator('#firebaseStatus')).toContainText('EMULATOR');
    const pids=(await f.status()).firebase.emulator.pids;
    await page.close();await f.close();expect(fs.existsSync(f.root)).toBe(false);
    for(const pid of pids)expect(()=>process.kill(pid,0)).toThrow();
  }finally{await page.close();await f.close()}
});

test('@firebaseWindows105 native Windows batch launcher with spaced paths starts the visible emulator workflow',async({page})=>{
  test.skip(process.platform!=='win32','Requires actual Windows cmd.exe');
  const {probeWindowsCmdLaunch}=await import('../helpers/firebase-windows-regression.mjs');
  const r=await probeWindowsCmdLaunch();expect(r.code,r.stderr).toBe(0);expect(r.stdout).toContain('WINDOWS_CMD_READY');
  const f=await firebaseFixture();
  try{
    await f.start();await page.goto(f.url);await page.getByRole('button',{name:'▶ Start Closed Loop',exact:true}).click();
    await expect(page.locator('#runTitle')).toHaveText('Tests Passed',{timeout:30000});expect(f.runs().map(r=>r.target)).toEqual(['emulator']);
  }finally{await page.close();await f.close()}
});
test('@firebaseWindows105 failed local app shows its original bootstrap error and exit code',async({page})=>{
  test.setTimeout(180000);
  const f=await firebaseFixture();
  try{
    fs.writeFileSync(path.join(f.repo,'local-app.mjs'),"console.error('Controlled local app bootstrap failure');process.exit(7)");
    await f.start();await page.goto(f.url);await page.getByRole('button',{name:'▶ Start Closed Loop',exact:true}).click();
    // The closed loop now retries startup three times before reporting a persistent error.
    await expect.poll(async()=>{const s=await f.status();return s.workflow.firebaseRecoveryAttempts===3&&s.workflow.state==='firebase-blocked'},{timeout:120000}).toBe(true);
    await expect(page.locator('#runTitle')).toHaveText('Firebase Test Blocked');
    await expect(page.locator('#currentTest')).toContainText('86 Chaos local app exited (7)');
    await expect(page.locator('#currentTest')).toContainText('Controlled local app bootstrap failure');
    expect(f.runs()).toEqual([]);expect((await f.status()).workflow.firebase.livePhases).toBe(0);
  }finally{await page.close();await f.close()}
});

test('@firebaseWindows106 crash watchdog removes the active test tree before repository cleanup',async({page})=>{
  const f=await firebaseFixture({gateDelay:30000});
  try{
    await f.start();await page.goto(f.url);await page.getByRole('button',{name:'▶ Start Closed Loop',exact:true}).click();
    await expect.poll(()=>f.runs().length,{timeout:45000}).toBe(1);
    const owned=(await f.status()).firebase.emulator;expect(owned.testPids).toHaveLength(1);
    await page.close();await f.crash();for(const pid of [...owned.pids,...owned.testPids])expect(()=>process.kill(pid,0)).toThrow();
    await f.close();expect(fs.existsSync(f.root)).toBe(false);
  }finally{await page.close();await f.close()}
});

test('@firebaseWindows106 equal-size timestamp repair overlays complete BOTH cycles',async({page,context})=>{test.setTimeout(300000);const chatPage=await context.newPage(),f=await createContinuousLoopFixture({firebaseMode:'both',chatPage,repairMetadataCollision:true});try{await page.goto(f.url);await page.getByRole('button',{name:'▶ Start Closed Loop',exact:true}).click();await driveFirebaseCycles(f,{mode:'both'});await expect(page.locator('#runTitle')).toHaveText('Tests Passed',{timeout:15000})}finally{await page.close();await f.close();await chatPage.close()}});

test('@firebaseWindows107 guardian handles lost owner with live IPC; snapshot and health checks stay responsive',async({page})=>{test.setTimeout(90000);const {probeGuardianWithoutDisconnect,probeSnapshotResponsiveness,probeHealthRecovery}=await import('../helpers/firebase-lifecycle-regression.mjs');expect(await probeGuardianWithoutDisconnect()).toBe(true);const f=await firebaseFixture();try{expect((await probeSnapshotResponsiveness(f)).beats).toBeGreaterThanOrEqual(2);expect(await probeHealthRecovery(f.session())).toBe(true);await f.start();await page.goto(f.url);await page.getByRole('button',{name:'▶ Start Closed Loop',exact:true}).click();await expect(page.locator('#runTitle')).toHaveText('Tests Passed',{timeout:30000})}finally{await page.close();await f.close()}});

test('@healthLoad119 slow healthy emulator hub keeps the closed-loop test running',async({page})=>{test.setTimeout(120000);const f=await firebaseFixture({gateDelay:6000});try{const cli=path.join(f.repo,'node_modules/firebase-tools/lib/bin/firebase.js');let code=fs.readFileSync(cli,'utf8');code=code.replace("res.end(JSON.stringify(name==='hub'?entries:{ready:true}))","setTimeout(()=>res.end(JSON.stringify(name==='hub'?entries:{ready:true})),name==='hub'?1700:0)");fs.writeFileSync(cli,code);f.git(['add','.']);f.git(['commit','-m','Slow healthy hub regression']);await f.start();await page.goto(f.url);await page.getByRole('button',{name:'▶ Start Closed Loop',exact:true}).click();await expect.poll(()=>f.runs().length,{timeout:30000}).toBe(1);await expect.poll(async()=>(await f.status()).workflow.firebase?.phase,{timeout:60000}).toBe('complete');expect((await f.status()).run.state).toBe('passed');expect((await f.status()).workflow.firebase.fallbackAttempted).toBe(false)}finally{await page.close();await f.close()}});
