import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {operatorUpdateFixture} from '../helpers/operator-update-fixture.mjs';
test('@updaterLifecycle139 failed updater leaves phone status actionable and retains the workflow checkpoint',async({page})=>{
  const f=await operatorUpdateFixture({verifiedRelease:true});
  try{
    await page.setViewportSize({width:393,height:800});await page.goto(f.url);
    const response=await page.request.post(f.url+'/api/action',{data:{action:'update-operator-now'}});expect(response.ok()).toBe(true);
    const before=fs.readFileSync(path.join(f.data,'update-resume.json'),'utf8');
    fs.writeFileSync(path.join(f.data,'operator-update-result.json'),JSON.stringify({state:'failed',error:'The Windows updater stopped before installation completed. Saved workflow retained.'}));
    await expect.poll(async()=>(await(await page.request.get(f.url+'/api/status')).json()).update.state).toBe('Update failed');
    await expect(page.locator('#doingStatus')).toContainText('updater stopped',{timeout:10000});
    expect(fs.readFileSync(path.join(f.data,'update-resume.json'),'utf8')).toBe(before);
    expect((await(await page.request.get(f.url+'/api/status')).json()).run.state).toBe('idle');
  }finally{await f.close()}
});
