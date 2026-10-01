import assert from 'node:assert/strict';
import {chromium,webkit,devices} from 'playwright';
const base=process.env.YARDMASTER_PWA_BASE||'http://127.0.0.1:4321';
const profiles=[
  {name:'Desktop Chromium',engine:chromium,device:null},
  {name:'iPhone Safari',engine:webkit,device:devices['iPhone 15']}
];
for(const profile of profiles){
  const browser=await profile.engine.launch({headless:true});
  try{
    const context=await browser.newContext(profile.device?{...profile.device}:{viewport:{width:1366,height:768}});
    const page=await context.newPage();
    await page.goto(base+'/yardmaster',{waitUntil:'domcontentloaded'});
    const banner=page.locator('#yardmasterTestingBanner');
    await banner.waitFor({state:'visible'});
    assert.match(await banner.textContent(),/YARDMASTER TESTING/i,profile.name+' must identify the testing website');
    assert.match(await banner.textContent(),/yardmaster-testing/i,profile.name+' must show the linked testing branch');
    const marker=await page.evaluate(async()=>{const r=await fetch('/yardmaster/testing-site.json',{cache:'no-store'});if(!r.ok)throw new Error('testing-site.json HTTP '+r.status);return r.json()});
    const release=await page.evaluate(async()=>{const r=await fetch('/yardmaster/release.json',{cache:'no-store'});if(!r.ok)throw new Error('release.json HTTP '+r.status);return r.json()});
    const sw=await page.evaluate(async()=>{const r=await fetch('/yardmaster/sw.js',{cache:'no-store'});if(!r.ok)throw new Error('sw.js HTTP '+r.status);return r.text()});
    assert.equal(marker.sourceRepo,'geoffm1985-glitch/yardmaster');
    assert.equal(marker.sourceBranch,'yardmaster-testing');
    assert.equal(marker.websiteBranch,'yardmaster-testing');
    assert.equal(marker.productionAffected,false);
    assert.equal(release.sourceCommit,marker.sourceCommit,profile.name+' must serve the exact testing-branch source commit');
    assert.ok(sw.includes(release.version),profile.name+' service worker must track the testing release version');
    const workerScope=await page.evaluate(async()=>{
      const response=await fetch('/yardmaster/sw.js',{cache:'no-store'});
      const registered=await navigator.serviceWorker.register('/yardmaster/sw.js',{scope:'/yardmaster'});
      const ready=await navigator.serviceWorker.ready;
      return {allowed:response.headers.get('Service-Worker-Allowed'),scope:registered.scope,active:ready.active?.state};
    });
    assert.equal(workerScope.allowed,'/yardmaster','worker must permit the canonical slashless page');
    assert.equal(workerScope.scope,new URL('/yardmaster',base).href);
    assert.equal(workerScope.active,'activated');
    assert.equal(release.version,'0.1.88');
    assert.equal(marker.sourceVersion,'0.1.88');
    if(profile.name==='iPhone Safari'){
      const viewport=await page.locator('meta[name="viewport"]').getAttribute('content');
      assert.match(viewport,/maximum-scale=1/);assert.match(viewport,/user-scalable=no/);
      const tabs=page.locator('[data-mobile-section-target]');
      assert.equal(await tabs.count(),8,'mobile must expose eight separate Yardmaster sections');
      for(const section of ['operations','runs','branches','queue','chatgpt','deployments','settings','intelligence']){
        const button=page.locator('[data-mobile-section-target="'+section+'"]');
        await button.click();
        assert.equal(await page.locator('[data-mobile-section="'+section+'"]').evaluate(el=>el.classList.contains('active')),true,section+' tab must activate its section');
      }
      assert.equal(await page.locator('text=Resume Failed Run').count()>0,true);
      assert.equal(await page.locator('#chatLoopPlan').count(),1);
      assert.equal(await page.locator('#mIntelUpdated').count(),1);
    }
  } finally {
    await browser.close();
  }
}
console.log('Yardmaster testing-site Playwright regression PASS');

