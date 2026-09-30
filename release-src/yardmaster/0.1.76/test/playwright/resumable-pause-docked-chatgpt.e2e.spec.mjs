import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const port=()=>47000+Math.floor(Math.random()*5000);
function git(cwd,args){return execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim()}
async function poll(fn,timeout=12000){const end=Date.now()+timeout;while(Date.now()<end){try{const v=await fn();if(v)return v}catch{}await wait(150)}throw new Error('timeout')}
function fixture({paused=false}={}){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ym-resume-dock-pw-')),data=path.join(temp,'data'),repo=path.join(temp,'repo');fs.mkdirSync(data);fs.mkdirSync(repo);
  fs.writeFileSync(path.join(repo,'package.json'),'{"name":"fixture"}\n');fs.writeFileSync(path.join(repo,'package-lock.json'),'{"lockfileVersion":3}\n');
  git(repo,['init','-b','testing']);git(repo,['config','user.email','fixture@example.invalid']);git(repo,['config','user.name','Fixture']);git(repo,['add','.']);git(repo,['commit','-m','fixture']);
  fs.writeFileSync(path.join(data,'config.json'),JSON.stringify({repositoryPath:repo,branch:'testing',testType:'full',autoUpdateOperator:false,autoHandoff:false,autoSelfHeal:false,automationDefaultsVersion:6},null,2));
  if(paused){
    fs.writeFileSync(path.join(data,'state.json'),JSON.stringify({run:{state:'paused',title:'Paused Play Store Test',currentTest:'fixture test 47',progress:47,log:[]},workflow:{state:'paused',closedLoop:true},activity:[]},null,2));
    fs.writeFileSync(path.join(data,'play-store-pause.json'),JSON.stringify({schema:1,kind:'play-store',rootPid:99999999,runId:'fixture-run-47',runDir:path.join(temp,'missing-run'),currentTest:'fixture test 47',progress:47},null,2));
  }
  const p=port(),child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,YARDMASTER_DATA_DIR:data,YARDMASTER_REPOSITORY_PATH:repo,YARDMASTER_PORT:String(p),YARDMASTER_DISABLE_UPDATE_CHECKS:'1',YARDMASTER_TEST_QUEUE_ONLY:'1',YARDMASTER_TEST_SELF_HEAL_QUEUE_ONLY:'1'},stdio:['ignore','pipe','pipe']});
  return {temp,data,repo,child,base:'http://127.0.0.1:'+p};
}
async function ready(f){await poll(async()=>{const r=await fetch(f.base+'/api/status');return r.ok})}
async function stop(f){try{await fetch(f.base+'/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'shutdown-operator'})})}catch{}await poll(()=>f.child.exitCode!==null,3500).catch(()=>{});if(f.child.exitCode===null)f.child.kill('SIGKILL');fs.rmSync(f.temp,{recursive:true,force:true})}

test.describe('true pause/resume and docked ChatGPT',()=>{
  test('paused Play Store checkpoint survives restart and Resume refuses to silently restart a full gate when evidence is unavailable',async({page})=>{
    const f=fixture({paused:true});try{
      await ready(f);await page.goto(f.base);
      await expect(page.locator('#runTitle')).toContainText('Paused Play Store Test');
      await expect(page.locator('#doingStatus')).toContainText(/truly paused/i);
      const before=await (await fetch(f.base+'/api/status')).json();expect(before.operatorStatus.phase).toBe('paused-play-store');expect(before.operatorStatus.canResume).toBe(true);
      const response=await fetch(f.base+'/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'resume'})});expect(response.ok).toBe(true);
      const after=await (await fetch(f.base+'/api/status')).json();expect(after.run.state).toBe('paused');expect(after.workflow.state).toBe('paused-resume-unavailable');expect(after.run.currentTest).toMatch(/no durable Playwright progress journal/i);
    }finally{await stop(f)}
  });

  test('ChatGPT view provides the embedded workspace surface without requiring a popup browser in dashboard UI',async({page})=>{
    const f=fixture();try{
      await ready(f);await page.goto(f.base);await page.locator('[data-nav="chatgpt"]').click();
      await expect(page.locator('#chatgptDockHost')).toBeVisible();
      await expect(page.getByText('Work without browser popups')).toBeVisible();
      await expect(page.locator('#chatgptDockHome')).toBeVisible();
      await expect(page.locator('#chatgptDockReload')).toBeVisible();
      await expect(page.locator('#chatgptDockHost')).toContainText('ChatGPT loads here in the Windows Yardmaster app.');
      await page.setViewportSize({width:1200,height:800});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
    }finally{await stop(f)}
  });

  test('testing build exposes the dual regression contract for both new features',async()=>{
    const registry=JSON.parse(fs.readFileSync(path.join(root,'YARDMASTER_FEATURES.json'),'utf8'));
    for(const id of ['durable-play-store-pause-resume','docked-chatgpt-workspace']){
      const f=registry.features.find(x=>x.id===id);expect(f).toBeTruthy();expect(f.playStoreTests).toContain('test/resumable-pause-docked-chatgpt.test.mjs');expect(f.playwrightTests).toContain('test/playwright/resumable-pause-docked-chatgpt.e2e.spec.mjs');
    }
  });
});
