import {test,expect} from '@playwright/test';
import {startMobileFixture,prepareMobile,REMOTE} from '../helpers/mobile-pwa-fixture.mjs';
import {readWebsite} from '../helpers/website-push-fixture.mjs';
import {findControlSection} from '../helpers/mobile-control.mjs';

const sections=['operations','runs','branches','queue','chatgpt','deployments','settings','intelligence'];
const configCases=[['branch','branch','experiment/fixture'],['repositoryPath','repositoryPath','C:\\MobileFixture'],['testingUrl','testingUrl','https://mobile.invalid'],['testType','testType','targeted'],['chatMode','chatMode','Chat'],['model','model','GPT-5.6 Sol'],['thinkingEffort','thinkingEffort','High'],['chatLoopEnabled','chatLoopEnabled',false],['chatLoopPlan','chatLoopPlan','Work → Chat'],['repoMode','repoUpdateMode','ask'],['maxRepairs','maxRepairAttempts',9],['maxSelfHeal','maxSelfHealAttempts',3],['autoHandoff','autoHandoff',false],['autoSelfHeal','autoSelfHeal',false],['autoPush','autoPush',true],['waitDeploy','waitForDeploy',false],['runAfterDeploy','runAfterDeploy',false],['autoUpdateOperator','autoUpdateOperator',false],['dryRunMode','dryRunMode',true]];
async function tab(page,name){await page.locator(`[data-mobile-section-target="${name}"]`).click();await expect(page.locator(`.m-section[data-mobile-section="${name}"]`)).toBeVisible()}
async function selectSectionFor(page,locator){const section=await findControlSection(locator);await tab(page,section);return section}
async function clickAction(page,f,selector,expected){
  const section=await selectSectionFor(page,page.locator(selector).first());const before=f.calls.length;
  if(expected.action==='stop')page.once('dialog',dialog=>dialog.accept());
  await page.locator(`.m-section[data-mobile-section="${section}"]`).locator(selector+':visible').first().click();
  await expect.poll(()=>f.calls.slice(before).find(c=>c.path==='/api/action')?.body).toMatchObject(expected);
}
async function pushStub(page,{permission='granted',mismatch=false,delivery=true}={}){
  await page.evaluate(({permission,mismatch,delivery})=>{
    window.fixturePush={subscribed:0,unsubscribed:0,permissionRequests:0};
    Object.defineProperty(window,'Notification',{configurable:true,value:{permission,requestPermission:async()=>{window.fixturePush.permissionRequests++;return permission}}});
    Object.defineProperty(window,'PushManager',{configurable:true,value:function(){}});
    let subscription=mismatch?{options:{applicationServerKey:new Uint8Array([9]).buffer},unsubscribe:async()=>{window.fixturePush.unsubscribed++;subscription=null}}:null;
    const worker={state:'activated'},reg={active:worker,pushManager:{getSubscription:async()=>subscription,subscribe:async options=>{window.fixturePush.subscribed++;return subscription={options,toJSON:()=>({endpoint:'https://push.invalid/fixture',keys:{p256dh:'fixture',auth:'fixture'}}),unsubscribe:async()=>{window.fixturePush.unsubscribed++;subscription=null}}}}};
    Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{register:async(url,options)=>{window.fixturePush.registration={url,options};return reg},ready:Promise.resolve(reg)}});
  },{permission,mismatch,delivery});
}

test.describe('@mobile hosted PWA',()=>{
  let server;
  test.beforeAll(async()=>{server=await startMobileFixture()});
  test.afterAll(async()=>{await server.close()});
  test.beforeEach(async({},info)=>{info.setTimeout(90000)});

  test('@stopConfirm191 mobile Cancel sends nothing and Confirm sends one Stop action',async({page})=>{
    const f=await prepareMobile(page);await page.goto(server.base+'/yardmaster');await expect(page.locator('#overlay')).toBeHidden();
    page.once('dialog',async dialog=>{expect(dialog.type()).toBe('confirm');expect(dialog.message()).toContain('Stop the current test');await dialog.dismiss()});
    await page.locator('[data-act="stop"]').click();expect(f.calls.filter(c=>c.body?.action==='stop')).toHaveLength(0);expect(f.state.run.state).toBe('running');
    page.once('dialog',dialog=>dialog.accept());await page.locator('[data-act="stop"]').click();await expect.poll(()=>f.calls.filter(c=>c.body?.action==='stop').length).toBe(1);
  });

  test('@workingVersion191 phone displays the run package version independently of historical test names',async({page})=>{
    const f=await prepareMobile(page);f.state.workingProject={name:'86chaos',version:'18.0.7',label:'86 Chaos 18.0.7'};f.state.run.currentTest='17.0.43+ historical regression';
    await page.goto(server.base+'/yardmaster');await expect(page.locator('#overlay')).toBeHidden();
    await expect(page.locator('#mRunProject')).toHaveText('Working on: 86 Chaos 18.0.7');await expect(page.locator('#mTest')).toContainText('17.0.43+');
    f.state.workingProject={version:null,label:'Version unavailable'};await page.reload();await expect(page.locator('#mRunProject')).toHaveText('Working on: Version unavailable');
  });

  test('@phoneReconnect191 delayed intelligence never keeps an authenticated phone on the pairing form',async({page})=>{
    const f=await prepareMobile(page);let release;const held=new Promise(resolve=>release=resolve);f.delays.set('/api/intelligence',held);
    try{
      await page.goto(server.base+'/yardmaster');
      await expect.poll(()=>f.calls.filter(c=>c.path==='/api/intelligence').length).toBe(1);
      await expect(page.locator('#overlay')).toBeHidden();
      await tab(page,'runs');await expect(page.locator('#mConsole')).toContainText('latest console line');
      await page.waitForTimeout(5200);
      expect(f.calls.filter(c=>c.path==='/api/intelligence')).toHaveLength(1);
      expect(f.calls.some(c=>c.path.includes('/passkey/'))).toBe(false);
    }finally{f.delays.delete('/api/intelligence');release()}
  });

  test('@phoneReconnect191 slow status shows reconnecting without pairing and polls only one request at a time',async({page})=>{
    const f=await prepareMobile(page);let release;const held=new Promise(resolve=>release=resolve);f.delays.set('/api/status',held);
    try{
      await page.goto(server.base+'/yardmaster');
      await expect(page.locator('#phoneReconnect')).toBeVisible();
      await expect(page.locator('#phonePairForm')).toBeHidden();await expect(page.locator('.mobile-nav')).toBeHidden();
      await page.waitForTimeout(5200);expect(f.calls.filter(c=>c.path==='/api/status')).toHaveLength(1);
    }finally{f.delays.delete('/api/status');release()}
    await expect(page.locator('#overlay')).toBeHidden();expect(f.calls.some(c=>c.path.includes('/passkey/'))).toBe(false);
  });

  test('@phoneReconnect191 transient connection failure retains the trusted session and reconnects without a passkey',async({page})=>{
    const f=await prepareMobile(page);f.failures.set('/api/status',503);await page.goto(server.base+'/yardmaster');
    await expect(page.locator('#phoneReconnect')).toBeVisible();await expect(page.locator('#phonePairForm')).toBeHidden();
    expect(await page.evaluate(()=>sessionStorage.getItem('yardmaster:session'))).toBe('fixture-session');
    expect(await page.evaluate(()=>localStorage.getItem('yardmaster:deviceId'))).toBe('phone-fixture');
    f.failures.delete('/api/status');await page.locator('#phoneReconnectRetry').click();await expect(page.locator('#overlay')).toBeHidden();
    expect(f.calls.some(c=>c.path.includes('/passkey/'))).toBe(false);
  });

  test('@phoneReconnect191 rejected session requires the existing passkey and keeps controls locked',async({page})=>{
    const f=await prepareMobile(page);f.failures.set('/api/status',401);await page.goto(server.base+'/yardmaster');
    await expect(page.locator('#unlock')).toBeVisible();await expect(page.locator('#phoneReconnect')).toBeHidden();await expect(page.locator('.mobile-nav')).toBeHidden();
    expect(await page.evaluate(()=>sessionStorage.getItem('yardmaster:session'))).toBeNull();
    expect(await page.evaluate(()=>localStorage.getItem('yardmaster:deviceId'))).toBe('phone-fixture');
    f.failures.delete('/api/status');await page.locator('#unlock').click();await expect(page.locator('#overlay')).toBeHidden();
    expect(f.calls.some(c=>c.path==='/api/passkey/auth/verify')).toBe(true);expect(f.calls.some(c=>c.path.startsWith('/api/passkey/register/'))).toBe(false);
  });

  test('@phoneReconnect191 repeated refresh preserves actual paired storage without fixture login reseeding',async({page})=>{
    const f=await prepareMobile(page,{authenticated:false});
    await page.goto(server.base+'/yardmaster?host=mobile-fixture.trycloudflare.com&code=123456');await page.locator('#pair').click();await expect(page.locator('#overlay')).toBeHidden();
    for(let n=0;n<3;n++){await page.reload();await expect(page.locator('#overlay')).toBeHidden();}
    expect(f.calls.filter(c=>c.path==='/api/passkey/register/verify')).toHaveLength(1);
    expect(f.calls.some(c=>c.path.startsWith('/api/passkey/auth/'))).toBe(false);
    expect(f.calls.filter(c=>c.path==='/api/status').every(c=>c.authorization==='Bearer fixture-session')).toBe(true);
  });

  test('pairing gate validates scanned hints and rejects insecure remote URLs',async({page})=>{
    const f=await prepareMobile(page,{authenticated:false});await page.goto(server.base+'/yardmaster?host=mobile-fixture.trycloudflare.com&code=123456');
    await expect(page.locator('#overlay')).toBeVisible();await expect(page.locator('#url')).toHaveValue(REMOTE);await expect(page.locator('#code')).toHaveValue('123456');
    await expect(page.locator('.mobile-nav')).toBeHidden();expect(f.calls.some(c=>c.path==='/api/action')).toBe(false);
    await page.locator('#url').fill('http://evil.invalid');await page.locator('#pair').click();await expect(page.locator('#pairMsg')).toContainText('HTTPS trycloudflare.com');
    expect(f.calls.some(c=>c.path.includes('/passkey/'))).toBe(false);
  });
  test('pair and unlock passkey UI routes serialize credentials and restore authenticated controls',async({page})=>{
    const f=await prepareMobile(page,{authenticated:false});await page.goto(server.base+'/yardmaster?host=mobile-fixture.trycloudflare.com&code=123456');await page.locator('#pair').click();
    await expect(page.locator('#overlay')).toBeHidden();await expect(page.locator('#mPc')).toContainText('Phone Connected');
    expect(f.calls.find(c=>c.path==='/api/passkey/register/options').body).toMatchObject({code:'123456'});
    expect(f.calls.find(c=>c.path==='/api/passkey/register/verify').body.credential.type).toBe('public-key');
    await page.evaluate(()=>sessionStorage.removeItem('yardmaster:session'));await page.reload();await expect(page.locator('#unlock')).toBeVisible();await page.locator('#unlock').click();await expect(page.locator('#overlay')).toBeHidden();
    expect(f.calls.some(c=>c.path==='/api/passkey/auth/verify')).toBe(true);
    // Credential APIs are fixtures; physical biometrics/passkey attestation need device testing.
  });
  test('expired authentication and offline tunnel return to the protected pairing gate',async({page})=>{
    const f=await prepareMobile(page);f.failures.set('/api/status',401);await page.goto(server.base+'/yardmaster');await expect(page.locator('#overlay')).toBeVisible();
    await expect.poll(()=>page.evaluate(()=>sessionStorage.getItem('yardmaster:session'))).toBeNull();await expect(page.locator('.mobile-nav')).toBeHidden();
    f.failures.delete('/api/status');f.failures.set('/api/remote/health',503);await page.reload();await page.locator('#unlock').click();await expect(page.locator('#pairMsg')).toContainText('Fixture remote error');
  });
  test('unsupported credentials and stale saved passkeys show pairing recovery',async({page})=>{
    const f=await prepareMobile(page,{session:false});f.failures.set('/api/passkey/auth/options',404);
    await page.goto(server.base+'/yardmaster');await expect(page.locator('#unlock')).toBeVisible();await page.locator('#unlock').click();await expect(page.locator('#pairMsg')).toContainText('no longer registered');expect(await page.evaluate(()=>localStorage.getItem('yardmaster:deviceId'))).toBeNull();
    await page.evaluate(()=>Object.defineProperty(navigator,'credentials',{value:undefined,configurable:true}));await page.locator('#pair').click();await expect(page.locator('#pairMsg')).toContainText('does not support passkeys');
  });
  test('all eight tabs render within phone width and block pinch zoom',async({page})=>{
    const f=await prepareMobile(page);await page.goto(server.base+'/yardmaster');await expect(page.locator('#overlay')).toBeHidden();
    await expect(page.locator('[data-mobile-section-target]')).toHaveCount(8);
    for(const section of sections){await tab(page,section);await expect(page.locator('.m-section.active')).toHaveCount(1);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)}
    expect(await page.locator('meta[name="viewport"]').getAttribute('content')).toContain('user-scalable=no');
    expect(await page.evaluate(()=>!document.dispatchEvent(new Event('gesturestart',{cancelable:true})))).toBe(true);
    expect(f.calls.filter(c=>!c.path.includes('/passkey/')&&c.path!=='/api/remote/health').every(c=>c.authorization==='Bearer fixture-session')).toBe(true);
  });
  test('every static mobile action sends its exact authenticated remote control',async({page})=>{
    const f=await prepareMobile(page);await page.goto(server.base+'/yardmaster');await expect(page.locator('#overlay')).toBeHidden();
    const actions=[...new Set([...readWebsite('yardmaster.astro').split('<script is:inline>')[0].matchAll(/data-act="([^"]+)"/g)].map(m=>m[1]))];
    for(const action of actions)await clickAction(page,f,`[data-act="${action}"]`,{action});
    expect(actions).toEqual(expect.arrayContaining(['start','pause','resume','stop','resume-handoff','update-operator-now','run-preflight','create-repro-capsule']));
    await expect(page.locator('#mUpdateMessage')).toContainText('paused checkpoint');
  });
  test('every editable setting persists the correct key and value type',async({page})=>{
    const f=await prepareMobile(page);await page.goto(server.base+'/yardmaster');await expect(page.locator('#overlay')).toBeHidden();
    for(const [id,key,value] of configCases){
      const control=page.locator('#'+id);await selectSectionFor(page,control);const before=f.calls.length;
      const tag=await control.evaluate(el=>el.tagName);
      if(tag==='SELECT')await control.selectOption(String(value));else{await control.fill(String(value));await control.dispatchEvent('change')}
      await expect.poll(()=>f.calls.slice(before).find(c=>c.path==='/api/config')?.body).toEqual({[key]:value});
      expect(f.state.config[key]).toBe(value);
    }
  });
  test('live run, resumed failure, self-heal, history, console and deployment evidence update',async({page})=>{
    const f=await prepareMobile(page);f.state.selfHeal={active:true,reason:'Fixture fault',phase:'testing',attempt:2,maxAttempts:5,candidateVersion:'fixture-next',resumeCheckpoint:'test 47'};
    f.state.workflow={state:'testing',resumeStartedAt:Date.now()};await page.goto(server.base+'/yardmaster');await expect(page.locator('#mTitle')).toHaveText('Resuming Failed Run');
    await expect(page.locator('#mSelfHealReason')).toHaveText('Fixture fault');await expect(page.locator('#mPass')).toHaveText('8');await expect(page.locator('#mPct')).toHaveText('42%');await expect(page.locator('#mLiveUpdated')).not.toHaveText('--');
    await tab(page,'runs');await expect(page.locator('#mConsole')).toContainText('latest console line');await expect(page.locator('#mRunHistory')).toContainText('Earlier run');await page.locator('#consoleAutoScroll').click();await expect(page.locator('#consoleAutoScroll')).toHaveText('Auto-scroll: Off');await page.locator('#copyConsole').click();expect(await page.evaluate(()=>window.fixtureClipboard)).toContain('latest console line');
    await tab(page,'deployments');await expect(page.locator('#mDeploymentState')).toHaveText('Ready');await expect(page.locator('#mDeploymentDetail')).toContainText('aaaaaaaaaaaa');
  });
  test('new work validates empty input, cancels and submits the Windows PC handoff',async({page})=>{
    const f=await prepareMobile(page);await page.goto(server.base+'/yardmaster');await expect(page.locator('#overlay')).toBeHidden();await page.locator('#mobileNewWorkControl').click();await page.locator('#submitMobileWork').click();await expect(page.locator('#mobileWorkMsg')).toContainText('Describe');
    await page.locator('#cancelMobileWork').click();await expect(page.locator('#newWorkOverlay')).toBeHidden();await page.locator('#mobileNewWorkControl').click();await page.locator('#mobileWorkTask').fill('Fixture mobile feature');await page.locator('#mobileWorkPush').check();await page.locator('#submitMobileWork').click();
    await expect.poll(()=>f.calls.find(c=>c.body?.action==='new-implementation')?.body).toEqual({action:'new-implementation',taskPrompt:'Fixture mobile feature',pushWhenPassed:true});await expect(page.locator('#mobileWorkTask')).toHaveValue('');
  });
  test('repair approval and failed handoff expose the appropriate recovery actions',async({page})=>{
    const f=await prepareMobile(page);f.state.workflow={state:'waiting-approval',approval:{type:'repair'},pendingRepair:{path:'fixture.zip'}};await page.goto(server.base+'/yardmaster');await expect(page.locator('#overlay')).toBeHidden();
    await clickAction(page,f,'[data-act="approve-repair"]',{action:'approve-repair'});await clickAction(page,f,'[data-act="reject-repair"]',{action:'reject-repair'});
    f.state.workflow={state:'handoff-error',error:'Fixture failed handoff'};await page.reload();await tab(page,'queue');await expect(page.locator('#approvalCard')).toContainText('Fixture failed handoff');await clickAction(page,f,'#approvalCard [data-act="resume-handoff"]',{action:'resume-handoff'});
  });
  test('intelligence notes, safe mode, profiles, worktrees and trusted devices send structured payloads',async({page})=>{
    const f=await prepareMobile(page);await page.goto(server.base+'/yardmaster');await expect(page.locator('#overlay')).toBeHidden();await tab(page,'intelligence');await page.locator('#mRunNote').fill('Fixture note');await page.locator('#mProfileName').fill('Phone profile');await page.locator('#mWorktreeBranch').fill('experiment/phone');
    for(const [action,body] of [['add-note',{action:'add-run-note',note:'Fixture note'}],['bookmark',{action:'bookmark-run',note:'Fixture note',bookmark:true}],['toggle-safe',{action:'set-safe-mode',enabled:true,reason:'mobile control'}],['save-profile',{action:'save-profile',name:'Phone profile'}],['apply-profile',{action:'apply-profile',key:'fixture'}],['delete-profile',{action:'delete-profile',key:'fixture'}],['create-worktree',{action:'create-worktree',branch:'experiment/phone',base:'HEAD'}],['remove-worktree',{action:'remove-worktree',path:'C:\\FixtureWorktree'}],['revoke-device',{action:'revoke-device',deviceId:'phone-fixture'}]])await clickAction(page,f,`[data-mobile-action="${action}"]`,body);
    await tab(page,'queue');await page.locator('#mProtocol').fill('YARDMASTER\nSTATUS\nEND');await page.locator('#mSendProtocol').click();await expect.poll(()=>f.calls.find(c=>c.path==='/api/command')?.body).toEqual({text:'YARDMASTER\nSTATUS\nEND'});await expect(page.locator('#mProtocol')).toHaveValue('');
  });
  test('evidence downloads and Yardmaster-only screenshot previews use authenticated requests',async({page})=>{
    const f=await prepareMobile(page);await page.goto(server.base+'/yardmaster');await expect(page.locator('#overlay')).toBeHidden();await tab(page,'intelligence');await expect(page.locator('#mIntelScreenshot')).toBeVisible();
    const download=page.waitForEvent('download');await page.locator('[data-evidence-id="fixture-evidence"]').click();expect((await download).suggestedFilename()).toBe('fixture-evidence.txt');
    await tab(page,'chatgpt');await expect(page.locator('#mChatPreview')).toBeVisible();expect(f.calls.filter(c=>['/api/evidence','/api/operator-screenshot'].includes(c.path)).every(c=>c.authorization==='Bearer fixture-session')).toBe(true);
  });
  test('alerts register canonical scope, replace mismatched keys, subscribe, repair and self-test',async({page})=>{
    const f=await prepareMobile(page);await page.goto(server.base+'/yardmaster');await expect(page.locator('#overlay')).toBeHidden();await pushStub(page,{mismatch:true});await page.locator('#alertsBtn').click();
    await expect.poll(()=>page.evaluate(()=>window.fixturePush.subscribed)).toBe(1);expect(await page.evaluate(()=>window.fixturePush.registration)).toEqual({url:'/yardmaster/sw.js',options:{scope:'/yardmaster'}});expect(await page.evaluate(()=>window.fixturePush.unsubscribed)).toBe(1);
    expect(f.calls.find(c=>c.path==='/api/push/subscribe').body.test).toBe(true);await tab(page,'settings');await page.locator('#repairMobilePush').click();await expect.poll(()=>page.evaluate(()=>window.fixturePush.subscribed)).toBe(2);await page.locator('#testMobilePush').click();await expect.poll(()=>f.calls.filter(c=>c.path==='/api/push/test').length).toBe(1);
    // The push transport is simulated: real notification arrival is a device check.
  });
  test('denied notifications show an actionable error without creating a subscription',async({page})=>{
    const f=await prepareMobile(page);await page.goto(server.base+'/yardmaster');await expect(page.locator('#overlay')).toBeHidden();await pushStub(page,{permission:'denied'});await page.locator('#alertsBtn').click();await tab(page,'settings');await expect(page.locator('#mPushDetail')).toContainText('permission is blocked');expect(f.calls.some(c=>c.path==='/api/push/subscribe')).toBe(false);
  });
  test('unsupported push, subscription failure and background repair expose their outcomes',async({page})=>{
    const f=await prepareMobile(page);await page.goto(server.base+'/yardmaster');await expect(page.locator('#overlay')).toBeHidden();
    await page.evaluate(()=>{delete window.PushManager});await page.locator('#alertsBtn').click();await tab(page,'settings');await expect(page.locator('#mPushDetail')).toContainText('not supported');
    await pushStub(page);f.failures.set('/api/push/subscribe',503);const dialog=page.waitForEvent('dialog'),click=page.locator('#repairMobilePush').click();const d=await dialog;expect(d.message()).toContain('Fixture remote error');await d.dismiss();await click;await expect(page.locator('#mPushDetail')).toContainText('Fixture remote error');
    f.failures.delete('/api/push/subscribe');f.state.currentDevice={hasPush:false};await page.evaluate(()=>{localStorage.setItem('yardmaster:push-enabled','1');lastSilentPushRepair=0});const before=f.calls.length;await page.evaluate(()=>refresh());await expect.poll(()=>f.calls.slice(before).some(c=>c.path==='/api/push/subscribe')).toBe(true);
  });
  test('PWA install uses the browser prompt and gives a menu fallback',async({page})=>{
    await prepareMobile(page);await page.goto(server.base+'/yardmaster');await expect(page.locator('#overlay')).toBeHidden();
    await page.evaluate(()=>{window.fixtureInstalled=false;const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=()=>{window.fixtureInstalled=true};e.userChoice=Promise.resolve({outcome:'accepted'});window.dispatchEvent(e)});await page.locator('#installPwa').click();expect(await page.evaluate(()=>window.fixtureInstalled)).toBe(true);
    const dialog=page.waitForEvent('dialog'),click=page.locator('#installPwa').click();const d=await dialog;expect(d.message()).toContain('Add to Home Screen');await d.dismiss();await click;
  });
});
