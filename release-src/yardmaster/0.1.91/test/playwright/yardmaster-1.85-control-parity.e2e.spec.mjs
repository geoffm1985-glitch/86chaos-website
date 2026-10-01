import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');

test.describe('Yardmaster 1.87 control parity',()=>{
  test.beforeEach(async({page})=>{
    await page.route('**/api/**',async route=>{
      const u=new URL(route.request().url()),now=Date.now();
      if(u.pathname==='/api/status')return route.fulfill({json:{version:'0.1.91',machineName:'Fixture PC',online:true,branches:['testing'],config:{branch:'testing',testType:'delta',repositoryPath:'C:/fixture',testingUrl:'https://testing.example',repoUpdateMode:'automatic',maxRepairAttempts:25,maxSelfHealAttempts:5,chatMode:'Work',model:'GPT-5.6 Sol',thinkingEffort:'High',chatLoopEnabled:true,chatLoopPlan:'Chat | GPT-5.6 Sol | High\nWork | GPT-6 Astra | High'},workflow:{state:'chatgpt',resumeStartedAt:now-5000,repairAttempts:2},operatorStatus:{phase:'chatgpt',doing:'Resuming failed run with ChatGPT.',waitingOn:'ChatGPT response',nextAction:'Apply returned repair.',updatedAt:now},run:{state:'failed',title:'Tests Failed',subtitle:'Failure preserved',progress:71,counts:{pass:33,fail:1,skip:2,timeout:0},currentTest:'fixture test',elapsedMs:120000,log:['fixture']},chatgpt:{state:'Working',mode:'Chat',model:'GPT-5.6 Sol',thinkingEffort:'High',routeLabel:'Step 1/2: Chat • GPT-5.6 Sol • High'},deployment:{state:'Idle'},activity:[{at:now,message:'Resume Current Failed Test started',level:'info'}],trustedDevices:[],remote:{status:'connected',phoneConnected:true},selfHeal:{active:false},update:{state:'Current'}}});
      if(u.pathname==='/api/intelligence')return route.fulfill({json:{updatedAt:now,timeline:[],health:[],preflight:{checks:[]},resources:{},hang:{state:'idle'},evidence:[],flakes:[],smartTests:{},provenance:{version:'0.1.91'},selfHealAttempts:[],profiles:{},audit:[],changes:{},annotations:[],safeMode:{enabled:false},cost:{githubActionsMinutes:{used:0,limit:1500},vercelBuilds:{used:0,limit:100},deployments:0}}});
      if(u.pathname==='/api/operator-screenshot')return route.fulfill({status:404,body:'fixture'});
      return route.fulfill({json:{ok:true}});
    });
    await page.route('http://yardmaster.fixture/**',async route=>{
      const pathname=new URL(route.request().url()).pathname;
      if(pathname.startsWith('/api/'))return route.fallback();
      const name=pathname==='/'?'index.html':path.basename(pathname);
      const file=path.join(root,'public',name);
      if(!fs.existsSync(file))return route.fulfill({status:404,body:'missing fixture'});
      return route.fulfill({contentType:name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html',body:fs.readFileSync(file)});
    });
    await page.goto('http://yardmaster.fixture/',{waitUntil:'domcontentloaded'});
  });

  test('mobile cannot zoom and uses eight fixed section tabs instead of one long control scroll',async({page})=>{
    await page.setViewportSize({width:390,height:844});
    const viewport=await page.locator('meta[name="viewport"]').getAttribute('content');expect(viewport).toContain('maximum-scale=1');expect(viewport).toContain('user-scalable=no');
    await expect(page.locator('.mobile-tabbar')).toBeVisible();await expect(page.locator('.mobile-tabbar [data-nav]')).toHaveCount(8);
    await page.locator('.mobile-tabbar [data-nav="chatgpt"]:visible').click();await expect(page.locator('[data-view-panel="chatgpt"]')).toBeVisible();await expect(page.locator('[data-view-panel="operations"]')).toBeHidden();
    await page.locator('.mobile-tabbar [data-nav="intelligence"]:visible').click();await expect(page.locator('[data-view-panel="intelligence"]')).toBeVisible();
  });

  test('resume status is visibly active on Operations and live/intelligence timestamps render',async({page})=>{
    await expect(page.locator('#workflowStatus')).toHaveText('chatgpt');await expect(page.locator('#doingStatus')).toContainText('Resuming failed run');await expect(page.locator('#liveStatusTimestamp')).toContainText('Updated');
    await page.locator('[data-nav="intelligence"]:visible').first().click();await expect(page.locator('#intelUpdatedAt')).toContainText('Updated');
  });

  test('continuous loop route and all model strings are editable from both desktop and mobile layouts',async({page})=>{
    await page.locator('[data-nav="chatgpt"]:visible').first().click();await expect(page.locator('#chatLoopStatus')).toContainText('Step 1/2');await expect(page.locator('#chatLoopPlan')).toHaveValue(/Chat[\s\S]*Work/);await expect(page.locator('#chatLoopEnabled')).toHaveClass(/on/);
    await page.setViewportSize({width:390,height:844});await expect(page.locator('#chatLoopPlan')).toBeVisible();await page.locator('#model').fill('GPT-6 Astra');expect(await page.locator('#model').inputValue()).toBe('GPT-6 Astra');
  });
});


test('resume failed run is surfaced as active work on Operations', async ({page})=>{
  const app=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
  expect(app).toContain('Resuming Failed Run');
  expect(app).toContain('workflow-running');
  expect(app).toContain('wf.resumeStartedAt');
});
