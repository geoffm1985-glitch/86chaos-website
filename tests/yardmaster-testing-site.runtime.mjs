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
    assert.equal(marker.sourceRepo,'geoffm1985-glitch/yardmaster');
    assert.equal(marker.sourceBranch,'yardmaster-testing');
    assert.equal(marker.websiteBranch,'yardmaster-testing');
    assert.equal(marker.productionAffected,false);
    assert.equal(release.sourceCommit,marker.sourceCommit,profile.name+' must serve the exact testing-branch source commit');
  } finally {
    await browser.close();
  }
}
console.log('Yardmaster testing-site Playwright regression PASS');
