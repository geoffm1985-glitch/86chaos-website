import {test,expect} from '@playwright/test';
import {createContinuousLoopFixture,driveContinuousCycles} from '../helpers/continuous-loop-fixture.mjs';
import {startMobileFixture} from '../helpers/mobile-pwa-fixture.mjs';
import {hostedMobileViewport} from '../helpers/loop-update-fixture.mjs';

test('@continuousLoop102 native dashboard executes two connected repair/deployment cycles with full first then failed/delta',async({page,context})=>{
  test.setTimeout(300000);
  const chatPage=await context.newPage(),f=await createContinuousLoopFixture({chatPage});
  try{
    await f.api('/api/config',{testType:'delta'});await page.goto(f.url);await page.locator('[data-nav="operations"]:visible').click();
    await page.locator('#testType').selectOption('full-then-delta');await expect.poll(async()=>(await f.status()).config.testType).toBe('full-then-delta');
    await page.locator('[data-nav="operations"]:visible').click();await page.getByRole('button',{name:'▶ Start Closed Loop',exact:true}).click();
    await driveContinuousCycles(f,{onPhase:async(phase,cycle)=>{
      if(phase==='waiting-reply'){
        expect(await chatPage.locator('input').evaluate(e=>e.files.length)).toBe(1);
        await expect(chatPage.locator('article[data-message-author-role="user"]')).toContainText('Yardmaster automated repair handoff');
        await expect(chatPage.getByRole('button',{name:'Stop generating',exact:true})).toBeVisible();
        await expect(page.locator('#runProject')).toContainText('1.0.'+(cycle-1));
      }
      if(phase==='complete'){await expect(page.locator('#runTitle')).toHaveText('Tests Passed',{timeout:15000})}
    }});
    await page.locator('[data-nav="operations"]:visible').click();await expect(page.locator('#testType')).toHaveValue('full-then-delta');
  }finally{await f.close();await chatPage.close()}
});

test('@continuousLoop102 hosted phone controls start full then repeat failed/delta through two real local repair cycles',async({page,context})=>{
  test.setTimeout(300000);await page.setViewportSize(hostedMobileViewport(page.viewportSize()));
  const chatPage=await context.newPage(),f=await createContinuousLoopFixture({chatPage}),website=await startMobileFixture();
  const remote='https://continuous-loop-fixture.trycloudflare.com';let disposing=false;
  try{
    await f.api('/api/config',{testType:'delta'});
    await page.addInitScript(({remote,bearer,deviceId})=>{localStorage.setItem('yardmaster:url',remote);localStorage.setItem('yardmaster:deviceId',deviceId);sessionStorage.setItem('yardmaster:session',bearer);Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{register:async()=>{throw new Error('Service worker transport is isolated in this fixture')}}})},{remote,bearer:f.bearer,deviceId:f.deviceId});
    await page.route(remote+'/**',async route=>{
      const req=route.request(),url=new URL(req.url()),headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
      if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
      try{const response=await fetch(f.url+url.pathname+url.search,{method:req.method(),headers:{'Content-Type':'application/json','Authorization':req.headers().authorization||'','X-Forwarded-For':'198.51.100.25'},...(req.postData()?{body:req.postData()}:{})});
      await route.fulfill({status:response.status,headers:{...headers,'Content-Type':response.headers.get('content-type')||'application/json'},body:await response.text()});}catch(error){if(disposing)return route.abort().catch(()=>{});throw error}
    });
    await page.goto(website.base+'/yardmaster');await expect(page.locator('#overlay')).toBeHidden();await expect(page.locator('.mobile-nav')).toBeVisible();
    await page.locator('[data-mobile-section-target="branches"]').click();await page.locator('#testType').selectOption('full-then-delta');await expect.poll(async()=>(await f.status()).config.testType).toBe('full-then-delta');
    await page.locator('[data-mobile-section-target="operations"]').click();await page.locator('[data-act="start"]').click();
    await driveContinuousCycles(f,{onPhase:async phase=>{
      if(phase==='waiting-reply'){await expect(chatPage.getByRole('button',{name:'Stop generating',exact:true})).toBeVisible();expect(await chatPage.locator('input').evaluate(e=>e.files.length)).toBe(1)}
      if(phase==='complete')await expect(page.locator('#mTitle')).toHaveText('Tests Passed',{timeout:15000});
    }});
    await page.locator('[data-mobile-section-target="branches"]').click();await expect(page.locator('#testType')).toHaveValue('full-then-delta');
  }finally{disposing=true;await page.unrouteAll({behavior:'ignoreErrors'});await page.close();await f.close();await website.close();await chatPage.close()}
});
