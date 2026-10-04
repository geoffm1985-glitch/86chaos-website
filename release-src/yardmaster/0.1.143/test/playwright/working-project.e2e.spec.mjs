import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {currentVersion} from '../helpers/version-fixture.mjs';
import {startRunProjectFixture,waitForRunProjectTest} from '../helpers/run-project-fixture.mjs';

test('@releaseProgress130 PC shows real browser cases and counts after preliminary checks',async({page})=>{
  test.setTimeout(120000);const f=await startRunProjectFixture();
  try{
    expect((await f.api('/api/status')).version).toBe(currentVersion);
    fs.writeFileSync(f.repo+'/fixture.cjs',"console.log('tests 142');console.log('pass 142');console.log('TOTAL SELECTED: 70');console.log('[TIMEOUT] 02/70 chromium | Spanish interface | user changes language | 2m 40s | running: 0 pass, 0 fail, 2 timeout, 0 skip');setInterval(()=>{},1000);");
    await f.api('/api/action',{action:'start'});
    await expect.poll(async()=>(await f.api('/api/status')).run.currentTest,{timeout:45000}).toBe('chromium | Spanish interface | user changes language');
    const {run}=await f.api('/api/status');expect(run.total).toBe(70);expect(run.counts).toEqual({pass:0,fail:0,timeout:2,skip:0});expect(run.progress).toBe(3);
    await page.goto(f.base);await expect(page.locator('#currentTest')).toContainText('Spanish interface');
  }finally{await f.close()}
});

test('@workingVersion191 @runReady192 PC displays the actual run version independently of historical test names',async({page})=>{
  test.setTimeout(120000);const f=await startRunProjectFixture({outputDelayMs:8000});
  try{
    await f.api('/api/action',{action:'start'});await waitForRunProjectTest(f);await page.goto(f.base);
    await expect(page.locator('#runProject')).toHaveText('Working on: 86 Chaos 18.0.7');
    await expect(page.locator('#currentTest')).toContainText('17.0.43+');
    fs.writeFileSync(f.packageFile,JSON.stringify({name:'86chaos',version:'18.0.8'}));
    await page.reload();await expect(page.locator('#runProject')).toHaveText('Working on: 86 Chaos 18.0.7');
  }finally{await f.close()}
});

test('@stopConfirm191 desktop Cancel keeps a running test alive and Confirm stops it',async({page})=>{
  test.setTimeout(120000);const f=await startRunProjectFixture();
  try{
    await f.api('/api/action',{action:'start'});await page.goto(f.base);
    await expect(page.locator('#runTitle')).toHaveText('Local Test Run');
    const calls=[];page.on('request',r=>{if(r.url().endsWith('/api/action'))calls.push(r.postDataJSON())});
    page.once('dialog',async dialog=>{expect(dialog.type()).toBe('confirm');expect(dialog.message()).toContain('Stop the current test');await dialog.dismiss()});
    await page.locator('[data-action="stop"]').click();expect(calls).toHaveLength(0);expect((await f.api('/api/status')).run.state).toBe('running');
    page.once('dialog',dialog=>dialog.accept());await page.locator('[data-action="stop"]').click();
    await expect.poll(async()=> (await f.api('/api/status')).run.state).toBe('stopped');expect(calls.filter(c=>c.action==='stop')).toHaveLength(1);
  }finally{await f.close()}
});
