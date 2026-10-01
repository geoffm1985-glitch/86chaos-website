import {test,expect,devices} from '@playwright/test';
import {startWebsitePushFixture} from '../helpers/website-push-fixture.mjs';
import {verifyInventory} from '../../scripts/coverage-inventory.mjs';
import {fileURLToPath} from 'node:url';

test('dual-suite feature inventory includes every action, route, dashboard control, and configuration key',()=>{
  const inventory=verifyInventory(fileURLToPath(new URL('../../',import.meta.url)));
  expect(inventory.configKeys).toContain('chatLoopEnabled');
  expect(inventory.configKeys).toContain('chatLoopPlan');
});
for(const [profile,options] of [['Android Chrome',devices['Pixel 7']],['iPhone Safari layout',devices['iPhone 13']]]){
  test.describe(profile,()=>{
    test.use({viewport:options.viewport,userAgent:options.userAgent,isMobile:true,hasTouch:true});
    for(const pathname of ['/yardmaster','/yardmaster/'])test('notifications worker activates and controls '+pathname,async({page})=>{
      const f=await startWebsitePushFixture();
      try{
        await page.goto(f.base+pathname);
        const result=await page.evaluate(async()=>{
          const response=await fetch('/yardmaster/sw.js');
          const registration=await navigator.serviceWorker.register('/yardmaster/sw.js',{scope:'/yardmaster'});
          const ready=await navigator.serviceWorker.ready;
          return {allowed:response.headers.get('Service-Worker-Allowed'),scope:registration.scope,active:ready.active?.state};
        });
        expect(result).toEqual({allowed:'/yardmaster',scope:f.base+'/yardmaster',active:'activated'});
        await page.reload();
        expect(await page.evaluate(()=>navigator.serviceWorker.controller?.scriptURL)).toBe(f.base+'/yardmaster/sw.js');
        await page.evaluate(async()=>{for(const reg of await navigator.serviceWorker.getRegistrations())await reg.unregister()});
      }finally{await f.close()}
    });
  });
}
