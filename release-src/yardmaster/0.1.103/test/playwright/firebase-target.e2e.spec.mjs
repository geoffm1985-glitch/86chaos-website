import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {firebaseFixture,appRoot} from '../helpers/firebase-fixture.mjs';
import {startMobileFixture,prepareMobile} from '../helpers/mobile-pwa-fixture.mjs';
import {hostedMobileViewport} from '../helpers/loop-update-fixture.mjs';
import {newFirebaseRun,firebasePhase,finishFirebasePhase,firebaseEnvironment} from '../../automation/firebase-target.mjs';
import {canaryHealthCheck} from '../../automation/ops-intelligence.mjs';
import {runSelfHealProcess} from '../../automation/self-heal.mjs';
import {spawnSync} from 'node:child_process';
import {createContinuousLoopFixture,driveFirebaseCycles} from '../helpers/continuous-loop-fixture.mjs';

test('@firebase103 native target/live-phase settings persist through reload and operator restart; current run remains pinned',async({page})=>{
  test.setTimeout(90000);const f=await firebaseFixture();try{
    await f.start();await page.goto(f.url);await expect(page.locator('#firebaseMode')).toHaveValue('emulator');
    await page.locator('#firebaseMode').selectOption('both');await expect(page.locator('#firebaseLivePhase')).toBeVisible();await page.locator('#firebaseLivePhase').selectOption('full');
    await expect.poll(async()=>(await f.status()).config.firebaseLivePhase).toBe('full');await page.reload();await expect(page.locator('#firebaseMode')).toHaveValue('both');await expect(page.locator('#firebaseLivePhase')).toHaveValue('full');
    await f.stop();await f.start();await page.reload();await expect(page.locator('#firebaseMode')).toHaveValue('both');
    await page.getByRole('button',{name:'▶ Start Closed Loop',exact:true}).click();await expect.poll(()=>f.runs().length,{timeout:15000}).toBe(2);
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
