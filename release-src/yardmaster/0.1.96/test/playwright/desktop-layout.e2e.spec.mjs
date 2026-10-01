import {test,expect,devices} from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const publicRoot=fileURLToPath(new URL('../../public/',import.meta.url));
let server,base;
test.beforeAll(async()=>{
  server=http.createServer((req,res)=>{
    const name=req.url==='/'?'index.html':path.basename(req.url.split('?')[0]);
    const file=path.join(publicRoot,name);
    if(!fs.existsSync(file)){res.writeHead(404);res.end();return}
    res.setHeader('Content-Type',name.endsWith('.css')?'text/css':name.endsWith('.js')?'text/javascript':name.endsWith('.svg')?'image/svg+xml':'text/html');
    res.end(fs.readFileSync(file));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
});
test.afterAll(async()=>{await new Promise(r=>server.close(r))});
async function dashboard(page,{heal=true,dock=false}={}){
  const config={branch:'testing',testType:'delta',model:'GPT-5.6 Sol',chatMode:'Work',thinkingEffort:'High'};
  const actions=[];
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/api/config')Object.assign(config,route.request().postDataJSON());
    if(url.pathname==='/api/action')actions.push(route.request().postDataJSON().action);
    const body=url.pathname==='/api/intelligence'?{timeline:Array.from({length:8},(_,i)=>({label:'Workflow step '+i,detail:'Preserved workflow evidence',status:i===3?'failed':'complete'})),health:['Git','ChatGPT','Test runner','Tunnel'].map(label=>({label,status:'ok',detail:'Fixture service health'})),preflight:{checks:[{id:'Repository',ok:true,detail:'Fixture repository ready'}]},provenance:{version:'0.1.96',branch:'testing'}}:url.pathname==='/api/status'?{version:'0.1.96',config,branches:['testing'],workflow:{state:'handoff-error',error:'PowerShell clipboard paste command timed out.',diagnostic:{name:'fixture.zip'}},run:{title:'Tests Failed',state:'failed',log:Array.from({length:60},(_,i)=>'Fixture console line '+i)},selfHeal:{active:heal,state:'failed',reason:'ChatGPT handoff automation failed: PowerShell clipboard paste command timed out.',detail:'Self-heal stopped safely.',attempt:3,maxAttempts:5,resumeCheckpoint:'resume-handoff'}}:{};
    await route.fulfill({json:body});
  });
  if(dock)await page.addInitScript(()=>{window.dockCalls=[];window.yardmasterDesktop={setChatGPTDock:p=>window.dockCalls.push(p)}});
  await page.goto(base);await expect(page.locator('#runTitle')).toHaveText('Tests Failed');
  return {config,actions};
}
async function reachable(locator){
  await expect(locator).toBeVisible();
  // Playwright re-resolves the locator if a periodic render replaces the card.
  await locator.click({trial:true});
}
async function noClippedCards(page){
  const clipped=await page.locator('.view.active .panel').evaluateAll(cards=>cards.flatMap(card=>{
    const r=card.getBoundingClientRect();
    return [...card.children].filter(c=>c.getClientRects().length&&c.getBoundingClientRect().bottom>r.bottom+1).map(c=>({card:card.className,child:c.id||c.tagName}));
  }));
  expect(clipped).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
}
for(const size of [{width:1366,height:768},{width:1100,height:700},{width:1920,height:1080}]){
  for(const heal of [true,false])test(`desktop ${size.width}x${size.height}, self-heal ${heal}: complete cards and selectable controls`,async({page})=>{
    await page.setViewportSize(size);const f=await dashboard(page,{heal});
    await noClippedCards(page);
    for(const selector of ['#testType','[data-action="stop"]','#approvals [data-action="resume-handoff"]'])await reachable(page.locator(selector));
    await page.locator('#testType').selectOption('targeted');await expect.poll(()=>f.config.testType).toBe('targeted');
    await page.locator('[data-nav="chatgpt"]:visible').click();await noClippedCards(page);
    for(const selector of ['#chatMode','#model','#thinkingEffort','[data-action="open-chatgpt"]','[data-action="full-self-test"]','#chatgptDockReload'])await reachable(page.locator(selector));
    await page.locator('#chatMode').selectOption('Chat');await expect.poll(()=>f.config.chatMode).toBe('Chat');
    await page.locator('#model').fill('GPT-5.6 Sol');await page.locator('#model').press('Tab');
    await page.locator('#thinkingEffort').selectOption('Medium');await expect.poll(()=>f.config.thinkingEffort).toBe('Medium');
    await page.locator('[data-nav="intelligence"]:visible').click();await expect(page.locator('#intelTimeline')).toContainText('Workflow step 7');await noClippedCards(page);
    for(const selector of ['[data-action="run-preflight"]','#runNote','#addRunNote','#profileName','#saveProfile','#worktreeBranch','#createWorktree'])await reachable(page.locator(selector));
    await page.locator('#runNote').fill('Layout regression note');await page.locator('#addRunNote').click();await expect.poll(()=>f.actions.includes('add-run-note')).toBe(true);
    await page.locator('[data-nav="operations"]:visible').click();expect(await page.locator('.main').evaluate(e=>e.scrollTop)).toBe(0);
  });
}
test('desktop scroll clips and hides native ChatGPT bounds without covering other controls',async({page})=>{
  await page.setViewportSize({width:1366,height:768});await dashboard(page,{dock:true});
  await page.locator('[data-nav="chatgpt"]:visible').click();await page.locator('#chatgptDockHost').scrollIntoViewIfNeeded();
  await expect.poll(()=>page.evaluate(()=>window.dockCalls.at(-1)?.visible)).toBe(true);
  const bounds=await page.evaluate(()=>window.dockCalls.at(-1).bounds);expect(bounds.y).toBeGreaterThanOrEqual(0);expect(bounds.y+bounds.height).toBeLessThanOrEqual(768);
  await page.locator('.main').evaluate(e=>{e.style.paddingBottom='900px';e.scrollTop=e.scrollHeight});
  await expect.poll(()=>page.evaluate(()=>window.dockCalls.at(-1)?.visible)).toBe(false);
  await page.locator('[data-nav="operations"]:visible').click();await expect.poll(()=>page.evaluate(()=>window.dockCalls.at(-1)?.visible)).toBe(false);
});
test.describe('iPhone layout regression',()=>{
  const iphone=devices['iPhone 13'];
  test.use({viewport:iphone.viewport,userAgent:iphone.userAgent,isMobile:true,hasTouch:true,deviceScaleFactor:iphone.deviceScaleFactor});
  test('self-heal cards and controls stay accessible on mobile',async({page})=>{
    await dashboard(page);await noClippedCards(page);
    await reachable(page.locator('#testType'));
    await page.locator('[data-nav="chatgpt"]:visible').click();await noClippedCards(page);await reachable(page.locator('#thinkingEffort'));await expect(page.locator('#chatgptDockHost')).toBeVisible();await expect(page.locator('#mobileChatGPTPreview')).toBeVisible();
    await page.locator('[data-nav="intelligence"]:visible').click();await expect(page.locator('#intelTimeline')).toContainText('Workflow step 7');await noClippedCards(page);await reachable(page.locator('#saveProfile'));
  });
});
