import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {COVERED_ACTIONS,COVERED_API_ROUTES,COVERED_UI_ACTIONS,COVERED_CONFIG_KEYS,ACTION_COVERAGE,SELF_HEAL_UI_COVERAGE,COVERED_SELF_HEAL_STATES,INTELLIGENCE_UI_COVERAGE} from './full-coverage-matrix.mjs';
import {SELF_HEAL_REQUIRED_TESTS,validateSelfHealPlan} from '../../automation/self-heal.mjs';

const projectRoot=path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const randomPort=()=>22000+Math.floor(Math.random()*18000);
async function poll(fn,{timeout=15000,interval=150}={}){
  const deadline=Date.now()+timeout;let lastError;
  while(Date.now()<deadline){try{const v=await fn();if(v)return v}catch(e){lastError=e}await wait(interval)}
  throw lastError||new Error('Timed out waiting for full Playwright fixture.');
}
const tokenHash=t=>crypto.createHash('sha256').update(String(t)).digest('hex');

async function startIdentityServer(branch,commit){
  const port=randomPort();
  const server=http.createServer((req,res)=>{
    if(req.url?.startsWith('/api/build-identity')){
      res.writeHead(200,{'Content-Type':'application/json'});
      res.end(JSON.stringify({gitCommit:commit,gitBranch:branch}));
    }else{res.writeHead(404);res.end('not found')}
  });
  await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));
  return {server,url:'http://127.0.0.1:'+port};
}

function fixtureRepo(temp){
  const repo=path.join(temp,'86chaos'),remote=path.join(temp,'remote.git');
  fs.mkdirSync(repo,{recursive:true});
  fs.writeFileSync(path.join(repo,'package.json'),JSON.stringify({
    name:'fixture-86chaos',version:'1.0.0',
    scripts:{
      'test:play-store:delta':'node -e "setTimeout(()=>{console.log(\'tests 3\');console.log(\'pass 3\')},1800)"',
      'test:current-release-targeted':'node -e "setTimeout(()=>{console.log(\'tests 2\');console.log(\'pass 2\')},1800)"',
      'test:play-store':'node -e "setTimeout(()=>{console.log(\'tests 4\');console.log(\'pass 4\')},1800)"'
    }
  }));
  execFileSync('git',['init','-b','testing'],{cwd:repo,stdio:'ignore'});
  execFileSync('git',['config','user.email','yardmaster-playwright@example.invalid'],{cwd:repo,stdio:'ignore'});
  execFileSync('git',['config','user.name','Yardmaster Playwright'],{cwd:repo,stdio:'ignore'});
  execFileSync('git',['add','.'],{cwd:repo,stdio:'ignore'});
  execFileSync('git',['commit','-m','fixture baseline'],{cwd:repo,stdio:'ignore'});
  execFileSync('git',['branch','main'],{cwd:repo,stdio:'ignore'});
  execFileSync('git',['init','--bare',remote],{stdio:'ignore'});
  execFileSync('git',['remote','add','origin',remote],{cwd:repo,stdio:'ignore'});
  execFileSync('git',['push','-u','origin','testing'],{cwd:repo,stdio:'ignore'});
  return {repo,remote};
}

function createOperatorFixture({handoffError=false,pendingRepair=false,selfHealState=null,withDevice=true}={}){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster-full-pw-'));
  const dataDir=path.join(temp,'data'),downloads=path.join(temp,'Downloads');
  fs.mkdirSync(dataDir,{recursive:true});fs.mkdirSync(downloads,{recursive:true});
  const {repo,remote}=fixtureRepo(temp),port=randomPort();
  const config={
    repositoryPath:repo,branch:'testing',testType:'targeted',repoUpdateMode:'automatic',
    automationDefaultsVersion:6,autoUpdateOperator:false,autoHandoff:false,autoSelfHeal:true,
    autoPush:false,maxRepairAttempts:25,maxSelfHealAttempts:5,waitForDeploy:false,runAfterDeploy:false,
    chatMode:'Work',model:'GPT-5.6 Sol',thinkingEffort:'High'
  };
  fs.writeFileSync(path.join(dataDir,'config.json'),JSON.stringify(config,null,2));
  const bearer='fixture-full-playwright-session';
  if(withDevice){
    fs.writeFileSync(path.join(dataDir,'devices.json'),JSON.stringify({
      phone1:{id:'phone1',name:'Fixture Phone',createdAt:Date.now(),lastSeenAt:Date.now(),credential:{id:'fixture-passkey-id',publicKey:'AA==',counter:0,transports:['internal']}}
    },null,2));
    fs.writeFileSync(path.join(dataDir,'sessions.json'),JSON.stringify({[tokenHash(bearer)]:{deviceId:'phone1',expiresAt:Date.now()+3600000}},null,2));
  }
  if(handoffError){
    const ddir=path.join(dataDir,'handoff-diagnostics');fs.mkdirSync(ddir,{recursive:true});
    const dp=path.join(ddir,'fixture-handoff.zip');fs.writeFileSync(dp,'handoff diagnostic fixture');
    fs.writeFileSync(path.join(dataDir,'state.json'),JSON.stringify({
      activity:[],workflow:{state:'handoff-error',error:'fixture handoff failure',repairAttempts:1,closedLoop:true,diagnostic:{name:path.basename(dp),path:dp,stage:'attachment'}},
      run:{state:'failed',title:'Tests Failed',subtitle:'fixture',progress:100,counts:{pass:0,fail:1,skip:0,timeout:0},currentTest:'fixture failure',elapsedMs:10,log:['fixture failure'],stdout:[],stderr:[],exitCode:1},
      chatgpt:{state:'Error'},deployment:{state:'Idle'}
    },null,2));
  }
  if(pendingRepair){
    const zip=path.join(temp,'repair.zip');fs.writeFileSync(zip,'repair fixture');
    fs.writeFileSync(path.join(dataDir,'state.json'),JSON.stringify({
      activity:[],workflow:{state:'waiting-approval',repairAttempts:1,pendingRepair:{zipPath:zip,receivedAt:Date.now(),attempt:1},repairApplied:false,approval:{type:'repair',message:'fixture'}},
      run:{state:'failed',title:'Tests Failed',progress:100,counts:{pass:0,fail:1,skip:0,timeout:0},currentTest:'fixture',elapsedMs:10,log:['fixture'],stdout:[],stderr:[],exitCode:1},
      chatgpt:{state:'Ready'},deployment:{state:'Idle'}
    },null,2));
  }
  if(selfHealState){
    fs.writeFileSync(path.join(dataDir,'state.json'),JSON.stringify({activity:[],workflow:{state:'handoff-error',error:'fixture interrupted workflow',repairAttempts:1,closedLoop:true},run:{state:'failed',title:'Interrupted by Yardmaster failure',subtitle:'fixture',progress:20,counts:{pass:1,fail:0,skip:0,timeout:0},currentTest:'fixture checkpoint',elapsedMs:10,log:['checkpoint saved']},chatgpt:{state:'Ready'},deployment:{state:'Idle'},selfHeal:selfHealState},null,2));
  }
  const fakeCloudflared=path.join(temp,'fake-cloudflared.mjs');
  fs.writeFileSync(fakeCloudflared,`if(process.argv.includes('--version')){console.log('cloudflared fixture 1.0');process.exit(0)}console.error('INF https://fixture-yardmaster.trycloudflare.com');setInterval(()=>{},1000)`);
  const updateManifest=JSON.stringify({verified:true,version:'0.1.99',downloadUrl:'https://www.86chaos.com/yardmaster/releases/Yardmaster-Windows-0.1.99.zip',sha256:'f'.repeat(64)});
  const env={...process.env,
    YARDMASTER_DATA_DIR:dataDir,YARDMASTER_REPOSITORY_PATH:repo,YARDMASTER_PORT:String(port),
    YARDMASTER_DISABLE_UPDATE_CHECKS:'1',YARDMASTER_TEST_QUEUE_ONLY:'1',YARDMASTER_TEST_HANDOFF_STUB:'1',
    YARDMASTER_TEST_FULL_SELF_TEST_STUB:'1',YARDMASTER_TEST_SELF_TEST_DIAGNOSTIC:'1',
    YARDMASTER_TEST_PUSH_STUB:'1',YARDMASTER_TEST_SELF_HEAL_QUEUE_ONLY:'1',
    YARDMASTER_TEST_UPDATE_STUB:'1',YARDMASTER_TEST_UPDATE_MANIFEST:updateManifest,
    YARDMASTER_TEST_OPEN_CHATGPT_STUB:'1',YARDMASTER_TEST_CHATGPT_COMMAND_STUB:'1',
    YARDMASTER_TEST_APPLY_REPAIR_STUB:'1',YARDMASTER_TEST_DOWNLOADS_DIR:downloads,
    YARDMASTER_CLOUDFLARED_PATH:process.execPath,YARDMASTER_CLOUDFLARED_SCRIPT:fakeCloudflared
  };
  const child=spawn(process.execPath,['server.mjs'],{cwd:projectRoot,env,stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',x=>output+=String(x));child.stderr.on('data',x=>output+=String(x));
  return {temp,dataDir,downloads,repo,remote,port,baseUrl:'http://127.0.0.1:'+port,bearer,child,output:()=>output};
}

async function ready(f){await poll(async()=>{const r=await fetch(f.baseUrl+'/api/status');return r.ok});}
async function api(f,pathname,{method='GET',body,remote=false,token}={}){
  const headers={'Content-Type':'application/json'};
  if(token)headers.Authorization='Bearer '+token;
  if(remote){headers['X-Forwarded-For']='203.0.113.45';headers.Host='fixture-yardmaster.trycloudflare.com';headers.Origin='https://www.86chaos.com'}
  return fetch(f.baseUrl+pathname,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});
}
async function stopFixture(f){
  try{await api(f,'/api/action',{method:'POST',body:{action:'shutdown-operator'}})}catch{}
  await poll(()=>f.child.exitCode!==null,{timeout:5000}).catch(()=>{});
  if(f.child.exitCode===null)f.child.kill('SIGKILL');
  fs.rmSync(f.temp,{recursive:true,force:true});
}
function createAdoptableRun(f){
  const root=path.join(f.repo,'test-results','86chaos-play-store-release-gate'),runId='pw-'+Date.now(),runDir=path.join(root,runId);
  fs.mkdirSync(path.join(runDir,'runner-logs'),{recursive:true});
  const child=spawn(process.execPath,['-e','setTimeout(()=>{},15000)'],{stdio:'ignore'});
  fs.writeFileSync(path.join(root,'.current-run.lock'),JSON.stringify({runId,pid:child.pid,startedAt:new Date().toISOString(),runDir}));
  fs.writeFileSync(path.join(root,'.last-run.json'),JSON.stringify({runId,runDir,mode:'failed+new',updatedAt:new Date().toISOString()}));
  fs.writeFileSync(path.join(runDir,'runner-state.json'),JSON.stringify({runId,currentPhase:'playwright',status:'running',playwrightStarted:true,playwrightCompleted:false,finalExitCode:null}));
  fs.writeFileSync(path.join(runDir,'runner-logs','playwright.log'),'tests 1\npass 1\n');
  return {child,root,runDir};
}

test.skip(process.platform!=='win32','The complete Yardmaster Playwright suite certifies Windows + Microsoft Edge behavior.');

test.describe('coverage lock',()=>{
  test('every current API action, API route, dashboard action, and config key is registered in the full suite',async()=>{
    const server=fs.readFileSync(path.join(projectRoot,'server.mjs'),'utf8');
    const html=fs.readFileSync(path.join(projectRoot,'public','index.html'),'utf8');
    const actions=[...new Set([...server.matchAll(/action==='([^']+)'/g)].map(m=>m[1]))].sort();
    const routes=[...new Set([...server.matchAll(/url\.pathname==='([^']+)'/g)].map(m=>m[1]))].sort();
    const ui=[...new Set([...html.matchAll(/data-action="([^"]+)"/g)].map(m=>m[1]))].sort();
    const allowedMatch=server.match(/const allowed=\[([^\]]+)\];for\(const k of allowed\)/);
    const keys=[...String(allowedMatch?.[1]||'').matchAll(/'([^']+)'/g)].map(m=>m[1]).sort();
    expect(actions).toEqual(COVERED_ACTIONS);
    expect(routes).toEqual(COVERED_API_ROUTES);
    expect(ui).toEqual(COVERED_UI_ACTIONS);
    expect(keys).toEqual(COVERED_CONFIG_KEYS);
    expect(Object.keys(ACTION_COVERAGE).sort()).toEqual(COVERED_ACTIONS);
    const app=fs.readFileSync(path.join(projectRoot,'public','app.js'),'utf8');for(const [field,id] of Object.entries(SELF_HEAL_UI_COVERAGE)){expect(server).toContain(field);expect(html).toContain('id="'+id+'"');expect(app).toContain('#'+id)}for(const stateName of COVERED_SELF_HEAL_STATES)expect(server).toContain("'"+stateName+"'");for(const id of INTELLIGENCE_UI_COVERAGE){expect(html).toContain('id="'+id+'"');expect(app).toContain('#'+id)}
  });
});

test.describe('self-heal repair contract and install safety',()=>{
  test('missing exact Play Store or Playwright regression coverage is rejected before candidate installation',async()=>{
    const failure='fixture Yardmaster automation failure',base={schema:1,version:'0.1.97',published:true,releaseManifestUrl:'https://www.86chaos.com/yardmaster/release.json',requiredTests:[...SELF_HEAL_REQUIRED_TESTS],regressionCoverage:{exactFailure:failure,playStoreTests:['test/self-heal.test.mjs'],playwrightTests:['test/playwright/full-app.e2e.spec.mjs']}};
    for(const version of ['0.1.96','0.1.0'])expect(()=>validateSelfHealPlan({...base,version},{currentVersion:'0.1.96',expectedFailure:failure})).toThrow(/must be newer/i);
    expect(()=>validateSelfHealPlan(base,{currentVersion:'0.1.96',expectedFailure:failure})).not.toThrow();expect(()=>validateSelfHealPlan({...base,regressionCoverage:{...base.regressionCoverage,playStoreTests:[]}},{currentVersion:'0.1.96',expectedFailure:failure})).toThrow(/Play Store/);expect(()=>validateSelfHealPlan({...base,regressionCoverage:{...base.regressionCoverage,playwrightTests:[]}},{currentVersion:'0.1.96',expectedFailure:failure})).toThrow(/Playwright/);expect(()=>validateSelfHealPlan({...base,regressionCoverage:{...base.regressionCoverage,exactFailure:'wrong failure'}},{currentVersion:'0.1.96',expectedFailure:failure})).toThrow(/exact detected failure/);
  });
  test('candidate tests gate installation, health soak gates resume, and rollback preserves the self-heal request',async()=>{
    const engine=fs.readFileSync(path.join(projectRoot,'automation','self-heal.mjs'),'utf8'),server=fs.readFileSync(path.join(projectRoot,'server.mjs'),'utf8'),supervisor=fs.readFileSync(path.join(projectRoot,'scripts','Yardmaster-Supervisor.ps1'),'utf8');
    expect(engine).toContain('validateRegressionCoverageFiles');expect(engine.indexOf('validateRegressionCoverageFiles')).toBeLessThan(engine.indexOf('Installing isolated self-heal test dependencies.'));expect(server).toMatch(/preparing-update[\s\S]*certified\.tests/);expect(server).toMatch(/Workflow resume .* held until the post-update health soak passes/);expect(server).toMatch(/passed its post-update health soak\. Resuming the saved workflow now/);expect(supervisor).toMatch(/Restore-YardmasterRollback/);expect(supervisor).toMatch(/saved self-heal request remains queued/i);
  });
});

test.describe('desktop UI and preferences',()=>{
  test('dashboard views, panel-scoped controls, status cards, and mobile-width layout render',async({page})=>{
    const pageErrors=[];page.on('pageerror',error=>pageErrors.push(String(error?.message||error))); // desktop menu bootstrap remains error-free
    const f=createOperatorFixture();try{
      await ready(f);await page.goto(f.baseUrl);
      for(const nav of ['operations','runs','branches','queue','chatgpt','deployments','settings','intelligence']){
        await page.locator('[data-nav="'+nav+'"]:visible').click();
        await expect(page.locator('[data-view-panel="'+nav+'"]')).toHaveClass(/active/);
        await expect(page.locator('[data-view-panel="'+nav+'"]')).toBeVisible();
      }
      await page.locator('[data-nav="operations"]:visible').click();
      for(const id of ['doingStatus','waitingStatus','nextStatus','branch','testType'])await expect(page.locator('#'+id)).toBeVisible();
      await page.locator('[data-nav="branches"]:visible').click();
      for(const id of ['repositoryPath','testingUrl'])await expect(page.locator('#'+id)).toBeVisible();
      await page.locator('[data-nav="queue"]:visible').click();
      for(const id of ['repoUpdate','maxRepairAttempts','maxSelfHealAttempts','autoHandoff','autoSelfHeal'])await expect(page.locator('#'+id)).toBeVisible();
      await page.locator('[data-nav="chatgpt"]:visible').click();
      for(const id of ['chatMode','model','thinkingEffort'])await expect(page.locator('#'+id)).toBeVisible();
      await page.locator('[data-nav="settings"]:visible').click();
      for(const id of ['autoUpdateOperator','pushHealthSummary'])await expect(page.locator('#'+id)).toBeVisible();
      await page.setViewportSize({width:390,height:844});
      await page.locator('[data-nav="operations"]:visible').click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
      await page.locator('[data-nav="settings"]:visible').click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
      expect(pageErrors).toEqual([]);
    }finally{await stopFixture(f)}
  });

  test('self-heal mode is explicit and live on the Windows dashboard at desktop and mobile widths',async({page})=>{
    const f=createOperatorFixture({selfHealState:{state:'testing',reason:'fixture internal automation failure',detail:'Self-heal certification: npm run test:playwright.',attempt:2,maxAttempts:5,currentTest:'npm run test:playwright',candidateVersion:'0.1.97',pendingResume:{kind:'resume-test',testType:'full'},log:[]}});try{
      await ready(f);await page.goto(f.baseUrl);await expect(page.locator('#selfHealBanner')).toBeVisible();await expect(page.locator('#selfHealBanner')).toContainText('SELF-HEAL MODE');
      await expect(page.locator('#selfHealReason')).toHaveText('fixture internal automation failure');await expect(page.locator('#selfHealPhase')).toContainText(/Playwright/i);await expect(page.locator('#selfHealDoing')).toContainText(/test:playwright/i);await expect(page.locator('#selfHealWaiting')).toContainText(/test:playwright/i);await expect(page.locator('#selfHealAttempt')).toHaveText('2 / 5');await expect(page.locator('#selfHealCandidate')).toHaveText('0.1.97');await expect(page.locator('#selfHealTesting')).toContainText(/test:playwright/i);await expect(page.locator('#selfHealLastStep')).toContainText(/Self-heal regression tests passed/i);await expect(page.locator('#selfHealNext')).toContainText(/remaining candidate tests/i);await expect(page.locator('#selfHealResume')).toContainText(/resume-test.*full/i);
      const status=await (await api(f,'/api/status')).json();expect(status.selfHeal).toMatchObject({active:true,reason:'fixture internal automation failure',attempt:2,candidateVersion:'0.1.97'});
      await page.setViewportSize({width:390,height:844});await expect(page.locator('#selfHealBanner')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
    }finally{await stopFixture(f)}
  });

  test('all configuration fields persist and invalid enum values fall back safely',async()=>{
    const f=createOperatorFixture();try{
      await ready(f);
      let r=await api(f,'/api/config',{method:'POST',body:{branch:'testing',testType:'full',chatMode:'Chat',model:'GPT-5.6 Sol',thinkingEffort:'Medium',chatLoopEnabled:true,chatLoopPlan:'Chat | GPT-5.6 Sol | High\nWork | GPT-6 Astra | High',repoUpdateMode:'never',autoPush:true,waitForDeploy:true,repositoryPath:f.repo,testingUrl:'http://127.0.0.1:9',vercelProject:'fixture',autoUpdateOperator:true,autoHandoff:true,autoSelfHeal:true,maxRepairAttempts:33,maxSelfHealAttempts:7,runAfterDeploy:true}});
      expect(r.ok).toBe(true);
      let s=await (await api(f,'/api/status')).json();
      expect(s.config).toMatchObject({testType:'full',chatMode:'Chat',thinkingEffort:'Medium',chatLoopEnabled:true,chatLoopPlan:'Chat | GPT-5.6 Sol | High\nWork | GPT-6 Astra | High',repoUpdateMode:'never',autoPush:true,maxRepairAttempts:33,maxSelfHealAttempts:7});
      r=await api(f,'/api/config',{method:'POST',body:{testType:'nonsense',chatMode:'nonsense',thinkingEffort:'nonsense',repoUpdateMode:'nonsense'}});
      expect(r.ok).toBe(true);s=await r.json();
      expect(s.config).toMatchObject({testType:'delta',chatMode:'Work',thinkingEffort:'High',repoUpdateMode:'automatic'});
      r=await api(f,'/api/config',{method:'POST',body:{branch:'bad branch!'}});
      expect(r.status).toBe(500);
    }finally{await stopFixture(f)}
  });
});

test.describe('run lifecycle and history',()=>{
  test('start, pause, resume, stop, completion metrics, and history operate only on the fixture repo',async({page})=>{
    const f=createOperatorFixture();try{
      await ready(f);await page.goto(f.baseUrl);
      await page.locator('[data-action="start"]').click();
      await poll(async()=>{const s=await (await api(f,'/api/status')).json();return s.run?.state==='running'});
      await page.locator('[data-action="pause"]').click();
      await poll(async()=>{const s=await (await api(f,'/api/status')).json();return s.run?.state==='paused'});
      await page.locator('[data-action="resume"]').click();
      await poll(async()=>{const s=await (await api(f,'/api/status')).json();return ['running','passed'].includes(s.run?.state)});
      page.once('dialog',dialog=>dialog.accept());await page.locator('[data-action="stop"]').click();
      await poll(async()=>{const s=await (await api(f,'/api/status')).json();return s.run?.state==='stopped'});
      await api(f,'/api/config',{method:'POST',body:{testType:'targeted'}});
      await api(f,'/api/action',{method:'POST',body:{action:'start'}});
      const done=await poll(async()=>{const s=await (await api(f,'/api/status')).json();return s.run?.state==='passed'?s:null},{timeout:10000});
      expect(done.run.counts.pass).toBeGreaterThan(0);
      expect(done.runHistory.length).toBeGreaterThan(0);
    }finally{await stopFixture(f)}
  });
});

test.describe('work, repair, self-heal, ChatGPT and sandbox controls',()=>{
  test('New Work validates input, blocks production, and queues an isolated implementation',async()=>{
    const f=createOperatorFixture();try{
      await ready(f);
      let r=await api(f,'/api/action',{method:'POST',body:{action:'new-implementation',taskPrompt:''}});
      expect(r.status).toBe(500);
      await api(f,'/api/config',{method:'POST',body:{branch:'main'}});
      r=await api(f,'/api/action',{method:'POST',body:{action:'new-implementation',taskPrompt:'fixture task'}});
      expect(r.status).toBe(500);
      await api(f,'/api/config',{method:'POST',body:{branch:'testing'}});
      r=await api(f,'/api/action',{method:'POST',body:{action:'new-implementation',taskPrompt:'fixture feature',pushWhenPassed:true}});
      expect(r.status).toBe(200);
      const s=await (await api(f,'/api/status')).json();
      expect(s.workflow).toMatchObject({state:'implementation-queued',taskPrompt:'fixture feature',pushWhenPassed:true,handsFree:true});
    }finally{await stopFixture(f)}
  });

  test('self-heal queue/resume, verified update, manual ChatGPT open, and command bridge are controllable',async()=>{
    const f=createOperatorFixture();try{
      await ready(f);
      let r=await api(f,'/api/action',{method:'POST',body:{action:'self-heal-now',reason:'full Playwright fixture'}});
      expect(r.ok).toBe(true);
      expect((await r.json()).state.state).toBe('queued');
      expect(fs.existsSync(path.join(f.dataDir,'self-heal-request.json'))).toBe(true);
      r=await api(f,'/api/action',{method:'POST',body:{action:'resume-self-heal'}});
      expect((await r.json()).stubbed).toBe(true);
      r=await api(f,'/api/action',{method:'POST',body:{action:'update-operator-now'}});
      const update=await r.json();expect(update.stubbed).toBe(true);expect(update.to).toBe('0.1.99');
      r=await api(f,'/api/action',{method:'POST',body:{action:'open-chatgpt'}});expect(r.ok).toBe(true);
      let s=await (await api(f,'/api/status')).json();expect(s.chatgpt.state).toMatch(/Opened/);expect(s.chatgpt.stubbed).toBe(true);
      r=await api(f,'/api/action',{method:'POST',body:{action:'consume-chatgpt-command'}});expect(r.ok).toBe(true);
      s=await (await api(f,'/api/status')).json();expect(s.activity.some(x=>/command bridge test stub/i.test(x.message))).toBe(true);
    }finally{await stopFixture(f)}
  });

  test('full sandbox self-test renders every stage and diagnostic download/save functions succeed',async({page})=>{
    const f=createOperatorFixture();try{
      await ready(f);await page.goto(f.baseUrl);await page.locator('[data-nav="chatgpt"]:visible').click();await expect(page.getByRole('button',{name:/Test Full Yardmaster Process/i})).toBeVisible();
      await page.getByRole('button',{name:/Test Full Yardmaster Process/i}).click();
      const s=await poll(async()=>{const x=await (await api(f,'/api/status')).json();return x.selfTest?.state==='passed'?x:null},{timeout:5000});
      for(const k of ['sandbox','manualGateAdoption','handoff','chatgpt','chatgptPowerShellRoundTrip','download','apply','retest','gitPush','deployment','postDeployAdoption'])expect(s.selfTest.steps[k]).toBe('pass');
      let r=await api(f,'/api/self-test-diagnostic');expect(r.ok).toBe(true);expect(await r.text()).toContain('self-test diagnostic fixture');
      r=await api(f,'/api/action',{method:'POST',body:{action:'save-self-test-diagnostic'}});const saved=await r.json();
      expect(fs.existsSync(saved.path)).toBe(true);expect(path.resolve(saved.path).startsWith(path.resolve(f.downloads))).toBe(true);
    }finally{await stopFixture(f)}
  });

  test('failed handoff diagnostic downloads and Resume Handoff reuses the failed workflow',async()=>{
    const f=createOperatorFixture({handoffError:true});try{
      await ready(f);
      let r=await api(f,'/api/handoff-diagnostic');expect(r.ok).toBe(true);expect(await r.text()).toContain('handoff diagnostic fixture');
      r=await api(f,'/api/action',{method:'POST',body:{action:'resume-handoff'}});expect(r.ok).toBe(true);
      const s=await (await api(f,'/api/status')).json();expect(s.workflow.state).toBe('chatgpt-stubbed');
    }finally{await stopFixture(f)}
  });

  test('pending repair can be approved or rejected without touching the real application',async()=>{
    let f=createOperatorFixture({pendingRepair:true});try{
      await ready(f);let r=await api(f,'/api/action',{method:'POST',body:{action:'approve-repair'}});expect(r.ok).toBe(true);
      let s=await (await api(f,'/api/status')).json();expect(s.workflow.state).toBe('repair-applied');expect(s.workflow.repairApplied).toBe(true);
    }finally{await stopFixture(f)}
    f=createOperatorFixture({pendingRepair:true});try{
      await ready(f);let r=await api(f,'/api/action',{method:'POST',body:{action:'reject-repair'}});expect(r.ok).toBe(true);
      const s=await (await api(f,'/api/status')).json();expect(s.workflow.state).toBe('repair-rejected');
    }finally{await stopFixture(f)}
  });
});

test.describe('remote access, pairing, passkeys, devices and push',()=>{
  test('fake tunnel starts/stops, pairing redirects, CORS works, and passkey option/error routes are covered',async()=>{
    const f=createOperatorFixture();try{
      await ready(f);
      let r=await api(f,'/api/action',{method:'POST',body:{action:'remote-start'}});expect(r.ok).toBe(true);
      const s=await poll(async()=>{const x=await (await api(f,'/api/status')).json();return x.remote?.status==='tunnel-ready'?x:null},{timeout:10000});
      expect(s.remote.url).toBe('https://fixture-yardmaster.trycloudflare.com');
      expect(s.remote.pairCode).toMatch(/^\d{6}$/);
      r=await fetch(f.baseUrl+'/pair/'+s.remote.pairCode,{redirect:'manual'});expect(r.status).toBe(302);expect(r.headers.get('location')).toContain('https://www.86chaos.com/yardmaster#');
      r=await api(f,'/api/pair',{method:'POST',remote:true,body:{code:s.remote.pairCode}});expect(r.status).toBe(410);
      r=await api(f,'/api/passkey/register/options',{method:'POST',remote:true,body:{code:s.remote.pairCode,deviceName:'Playwright Phone'}});expect(r.ok).toBe(true);
      const reg=await r.json();expect(reg.registrationId).toBeTruthy();expect(reg.options.rp.id).toBe('86chaos.com');
      r=await api(f,'/api/passkey/register/verify',{method:'POST',remote:true,body:{registrationId:'missing',credential:{}}});expect(r.status).toBe(401);
      r=await api(f,'/api/passkey/auth/options',{method:'POST',remote:true,body:{deviceId:'phone1'}});expect(r.ok).toBe(true);
      const auth=await r.json();expect(auth.authId).toBeTruthy();
      r=await api(f,'/api/passkey/auth/verify',{method:'POST',remote:true,body:{authId:'missing',credential:{}}});expect(r.status).toBe(401);
      r=await fetch(f.baseUrl+'/api/status',{method:'OPTIONS',headers:{Origin:'https://www.86chaos.com','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization','Access-Control-Request-Private-Network':'true','X-Forwarded-For':'203.0.113.45',Host:'fixture-yardmaster.trycloudflare.com'}});
      expect(r.status).toBe(204);expect(r.headers.get('access-control-allow-private-network')).toBe('true');
      r=await api(f,'/api/action',{method:'POST',body:{action:'remote-stop'}});expect(r.ok).toBe(true);
      await poll(async()=>{const x=await (await api(f,'/api/status')).json();return x.remote?.status==='local'});
    }finally{await stopFixture(f)}
  });

  test('remote APIs require auth; authenticated phone can subscribe/test push and revoke trusted devices with full control parity',async()=>{
    const f=createOperatorFixture();try{
      await ready(f);
      let r=await api(f,'/api/status',{remote:true});expect(r.status).toBe(401);
      r=await api(f,'/api/status',{remote:true,token:f.bearer});expect(r.ok).toBe(true);
      r=await api(f,'/api/push/key',{remote:true,token:f.bearer});expect(r.ok).toBe(true);expect((await r.json()).publicKey).toBeTruthy();
      const subscription={endpoint:'https://push.example.invalid/fixture',keys:{p256dh:'fixture-key',auth:'fixture-auth'}};
      r=await api(f,'/api/push/subscribe',{method:'POST',remote:true,token:f.bearer,body:{subscription,test:true}});let j=await r.json();expect(j.testDelivered).toBe(true);expect(j.pushStatus).toBe('working');
      r=await api(f,'/api/push/test',{method:'POST',remote:true,token:f.bearer,body:{}});j=await r.json();expect(j.ok).toBe(true);
      r=await api(f,'/api/devices',{remote:true,token:f.bearer});expect((await r.json()).some(x=>x.id==='phone1')).toBe(true);
      r=await api(f,'/api/action',{method:'POST',remote:true,token:f.bearer,body:{action:'revoke-device',deviceId:'phone1'}});expect(r.ok).toBe(true);
      r=await api(f,'/api/devices');expect((await r.json()).some(x=>x.id==='phone1')).toBe(false);
    }finally{await stopFixture(f)}
  });
});

test.describe('Git, deployment, protocol and manual gate adoption',()=>{
  test('Git push uses only the local bare remote and production branch push is blocked',async()=>{
    const f=createOperatorFixture();try{
      await ready(f);
      fs.writeFileSync(path.join(f.repo,'change.txt'),'playwright change');
      execFileSync('git',['add','change.txt'],{cwd:f.repo,stdio:'ignore'});execFileSync('git',['commit','-m','fixture change'],{cwd:f.repo,stdio:'ignore'});
      let r=await api(f,'/api/action',{method:'POST',body:{action:'push'}});expect(r.ok).toBe(true);
      const local=execFileSync('git',['rev-parse','HEAD'],{cwd:f.repo,encoding:'utf8'}).trim();
      const remote=execFileSync('git',['rev-parse','refs/heads/testing'],{cwd:f.remote,encoding:'utf8'}).trim();expect(remote).toBe(local);
      await api(f,'/api/config',{method:'POST',body:{branch:'main'}});
      r=await api(f,'/api/action',{method:'POST',body:{action:'push'}});expect(r.status).toBe(500);
    }finally{await stopFixture(f)}
  });

  test('deployment verification matches exact local build identity and command protocol updates safe settings',async()=>{
    const f=createOperatorFixture();let identity;try{
      await ready(f);const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:f.repo,encoding:'utf8'}).trim();
      identity=await startIdentityServer('testing',commit);
      await api(f,'/api/config',{method:'POST',body:{testingUrl:identity.url,waitForDeploy:false}});
      let r=await api(f,'/api/action',{method:'POST',body:{action:'verify-deployment'}});expect(r.ok).toBe(true);
      let s=await (await api(f,'/api/status')).json();expect(s.deployment.state).toBe('Ready');expect(s.deployment.deployedCommit).toBe(commit);
      r=await api(f,'/api/command',{method:'POST',body:{text:'YARDMASTER\nBRANCH testing\nPRESERVE .git\nEND'}});expect(r.ok).toBe(true);
    }finally{identity?.server.close();await stopFixture(f)}
  });

  test('running manual release gate can be adopted from the Windows dashboard',async()=>{
    const f=createOperatorFixture();let gate;try{
      await ready(f);gate=createAdoptableRun(f);
      const r=await api(f,'/api/action',{method:'POST',body:{action:'adopt-running-test'}});expect(r.ok).toBe(true);
      const j=await r.json();expect(j.adopted).toBe(true);
      const s=await (await api(f,'/api/status')).json();expect(s.run.adopted).toBe(true);
    }finally{try{gate?.child.kill()}catch{}await stopFixture(f)}
  });
});

test.describe('operator shutdown and error boundaries',()=>{
  test('unknown actions fail safely and shutdown exits the isolated operator',async()=>{
    const f=createOperatorFixture();await ready(f);
    let r=await api(f,'/api/action',{method:'POST',body:{action:'definitely-not-real'}});expect(r.status).toBe(500);
    r=await api(f,'/api/action',{method:'POST',body:{action:'shutdown-operator'}});expect(r.ok).toBe(true);
    await poll(()=>f.child.exitCode!==null,{timeout:5000});
    fs.rmSync(f.temp,{recursive:true,force:true});
  });
});
