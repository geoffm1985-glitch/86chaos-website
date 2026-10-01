import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import {startRunProjectFixture} from '../helpers/run-project-fixture.mjs';

test('@workingVersion191 PC displays the actual run version independently of historical test names',async({page})=>{
  test.setTimeout(120000);const f=await startRunProjectFixture();
  try{
    await f.api('/api/action',{action:'start'});await page.goto(f.base);
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
