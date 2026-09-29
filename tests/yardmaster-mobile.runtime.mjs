import assert from 'node:assert/strict';
import {chromium,webkit,devices} from 'playwright';

const base=process.env.YARDMASTER_PWA_BASE||'http://127.0.0.1:4321';
const remote='https://fixture-yardmaster.trycloudflare.com';
const profiles=[
  {name:'Android Chrome',engine:chromium,device:devices['Pixel 7']},
  {name:'iPhone Safari',engine:webkit,device:devices['iPhone 15']}
];

for(const profile of profiles){
  const browser=await profile.engine.launch({headless:true});
  try{
    const context=await browser.newContext({...profile.device});
    const page=await context.newPage();
    const actionPayloads=[];
    let sawAuthenticatedStatus=false;

    const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
    await page.route(remote+'/**',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:corsHeaders,body:''});
      if(url.pathname==='/api/remote/health'){
        return route.fulfill({status:200,headers:corsHeaders,contentType:'application/json',body:JSON.stringify({ok:true,version:'0.1.12',tunnelStatus:'ready',pairingAvailable:true})});
      }
      if(url.pathname==='/api/status'){
        assert.equal(request.headers().authorization,'Bearer test-mobile-session',profile.name+' must authenticate remote status');
        sawAuthenticatedStatus=true;
        return route.fulfill({status:200,headers:corsHeaders,contentType:'application/json',body:JSON.stringify({
          online:true,machineName:'YARDMASTER-PC',version:'0.1.62',
          remote:{active:true,status:'connected',phoneConnected:true,url:remote},
          run:{state:'idle',title:'Ready for work',progress:0,counts:{pass:0,fail:0,skip:0},currentTest:'Idle'},
          config:{branch:'testing',testingUrl:'https://testing.86chaos.com',testType:'delta',chatMode:'Work',model:'GPT-5.6 Sol',thinkingEffort:'High',repoUpdateMode:'automatic',maxRepairAttempts:25,autoHandoff:true,autoPush:false,waitForDeploy:true,runAfterDeploy:true,autoUpdateOperator:true},
          workflow:{state:'handoff-error',error:'ChatGPT did not confirm the Yardmaster ZIP attachment after trusted file selection.'},operatorStatus:{phase:'needs-attention',doing:'The current ChatGPT handoff stopped safely: attachment verification failed',waitingOn:'Resume Current Failed Test.',nextAction:'Resume will reuse the existing failed-test ZIP and continue without restarting the Play Store gate.',canResume:true,resumeAction:'resume-handoff'},update:{state:'Available',version:'0.1.63'},currentDevice:{id:'test-mobile-device',name:'Test phone',hasPush:false,pushStatus:null},pushHealth:{pairedDevices:1,subscribedDevices:0,workingDevices:0,needsAttention:0},activity:[],deployment:{state:'Idle'},chatgpt:{state:'Ready'},branches:['testing']
        })});
      }
      if(url.pathname==='/api/action'&&request.method()==='POST'){
        assert.equal(request.headers().authorization,'Bearer test-mobile-session',profile.name+' New Work must be authenticated');
        const payload=request.postDataJSON();actionPayloads.push(payload);
        if(payload.action==='update-operator-now')return route.fulfill({status:200,headers:corsHeaders,contentType:'application/json',body:JSON.stringify({ok:true,queued:true,version:'0.1.63',waitingOn:'the current test'})});
        if(payload.action==='resume-handoff')return route.fulfill({status:200,headers:corsHeaders,contentType:'application/json',body:JSON.stringify({ok:true})});
        return route.fulfill({status:200,headers:corsHeaders,contentType:'application/json',body:JSON.stringify({ok:true,state:'implementation-queued',runsOn:'windows-pc'})});
      }
      return route.fulfill({status:404,body:'fixture route not found'});
    });

    const scan=base+'/yardmaster?remote='+encodeURIComponent(remote)+'&code=482731';
    const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
    await page.goto(scan,{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#overlay.show');
    await page.waitForTimeout(350);
    const scanDiag=await page.evaluate(()=>({href:location.href,search:location.search,hash:location.hash,url:document.querySelector('#url')?.value||'',code:document.querySelector('#code')?.value||'',bodyClass:document.body.className}));
    console.log(profile.name+' QR diagnostics '+JSON.stringify({scanDiag,pageErrors}));
    await page.waitForFunction(expected=>document.querySelector('#url')?.value===expected,remote,{timeout:3500}).catch(()=>{});
    assert.equal(await page.locator('#url').inputValue(),remote,profile.name+' QR scan must fill Remote URL; '+JSON.stringify({scanDiag,pageErrors}));
    assert.equal(await page.locator('#code').inputValue(),'482731',profile.name+' QR scan must fill pairing code');
    assert.ok((await page.locator('body').getAttribute('class')||'').includes('ym-auth-pending'),profile.name+' must fail closed before auth');
    assert.equal(await page.locator('#mControlCard').evaluate(el=>getComputedStyle(el).visibility),'hidden',profile.name+' controls must be hidden before auth');

    await page.evaluate(({remote})=>{
      localStorage.setItem('yardmaster:url',remote);
      localStorage.setItem('yardmaster:deviceId','test-mobile-device');
      sessionStorage.setItem('yardmaster:session','test-mobile-session');
    },{remote});
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.body.classList.contains('ym-authenticated'));
    assert.equal(sawAuthenticatedStatus,true,profile.name+' must prove authenticated PC status before controls unlock');

    assert.match(await page.locator('#mDoing').textContent(),/handoff stopped safely/i,profile.name+' must show what Yardmaster is doing');
    assert.match(await page.locator('#mWaiting').textContent(),/Resume Current Failed Test/i,profile.name+' must show what Yardmaster is waiting on');
    assert.match(await page.locator('#mNext').textContent(),/existing failed-test ZIP/i,profile.name+' must show the next recovery step');
    assert.equal(await page.locator('#mVersion').textContent(),'0.1.62',profile.name+' must show the PC Yardmaster version');
    assert.match(await page.locator('#mPushStatus').textContent(),/Needs attention/i,profile.name+' must expose push health');
    assert.equal(await page.locator('[data-act="resume-handoff"]').textContent(),'Resume Current Failed Test',profile.name+' must expose failed-handoff resume');
    await page.locator('[data-act="resume-handoff"]').click();
    await page.waitForFunction(()=>true);
    assert.ok(actionPayloads.some(p=>p.action==='resume-handoff'),profile.name+' must send resume-handoff to the Windows PC');
    await page.locator('#updatePcYardmaster').click();
    assert.ok(actionPayloads.some(p=>p.action==='update-operator-now'),profile.name+' must allow the phone to update the Windows Yardmaster');
    assert.match(await page.locator('#mUpdateMessage').textContent(),/queued|safe/i,profile.name+' must explain queued update status');

    await page.locator('#mobileNewWork').click();
    await page.locator('#mobileWorkTask').fill('Add a remote-created test feature and its release-gate coverage.');
    await page.locator('#mobileWorkPush').check();
    await page.locator('#submitMobileWork').click();
    await page.waitForFunction(()=>!document.querySelector('#newWorkOverlay')?.classList.contains('show'));

    const newWorkPayload=actionPayloads.find(p=>p.action==='new-implementation');
    assert.deepEqual(newWorkPayload,{
      action:'new-implementation',
      taskPrompt:'Add a remote-created test feature and its release-gate coverage.',
      pushWhenPassed:true
    },profile.name+' must send New Work to the Windows Yardmaster API');

    const viewport=await page.evaluate(()=>({w:document.documentElement.scrollWidth,vw:document.documentElement.clientWidth}));
    assert.ok(viewport.w<=viewport.vw+1,profile.name+' PWA must not overflow horizontally');
    await context.close();
  }finally{await browser.close()}
}

console.log('Yardmaster mobile runtime PASS: Android Chrome + iPhone Safari');
