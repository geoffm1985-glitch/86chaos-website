import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {stopFixture} from '../helpers/fixture-cleanup.mjs';

const root=path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const tokenHash=t=>crypto.createHash('sha256').update(String(t)).digest('hex');
const randomPort=()=>36000+Math.floor(Math.random()*10000);
function git(cwd,args){return execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim()}
async function poll(fn,{timeout=15000,interval=150}={}){const end=Date.now()+timeout;let err;while(Date.now()<end){try{const v=await fn();if(v)return v}catch(e){err=e}await wait(interval)}throw err||new Error('timeout')}
function fixture(){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster-intel-pw-')),data=path.join(temp,'data'),repo=path.join(temp,'fixture-86chaos');fs.mkdirSync(data,{recursive:true});fs.mkdirSync(repo,{recursive:true});
  fs.writeFileSync(path.join(repo,'package.json'),JSON.stringify({name:'fixture',scripts:{'test:play-store':'node -e "console.log(\'fixture\')"'}}));fs.writeFileSync(path.join(repo,'package-lock.json'),JSON.stringify({lockfileVersion:3}));
  git(repo,['init','-b','testing']);git(repo,['config','user.email','yardmaster-intel@example.invalid']);git(repo,['config','user.name','Yardmaster Intelligence']);git(repo,['add','.']);git(repo,['commit','-m','fixture']);
  const port=randomPort(),config={repositoryPath:repo,branch:'testing',testType:'targeted',automationDefaultsVersion:6,autoUpdateOperator:false,autoHandoff:false,autoSelfHeal:false,autoPush:false,waitForDeploy:false,runAfterDeploy:false,dryRunMode:false,mobileLiveScreenshot:false,hangThresholdMs:180000,githubActionsMinuteLimit:1500,vercelBuildLimit:100,chatMode:'Work',model:'GPT-5.6 Sol',thinkingEffort:'High',repoUpdateMode:'automatic'};
  fs.writeFileSync(path.join(data,'config.json'),JSON.stringify(config,null,2));
  const bearer='intel-fixture-session';fs.writeFileSync(path.join(data,'devices.json'),JSON.stringify({phone1:{id:'phone1',name:'Fixture Phone',createdAt:Date.now(),lastSeenAt:Date.now(),credential:{id:'fixture',publicKey:'AA==',counter:0,transports:['internal']}}}));fs.writeFileSync(path.join(data,'sessions.json'),JSON.stringify({[tokenHash(bearer)]:{deviceId:'phone1',expiresAt:Date.now()+3600000}}));
  const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,YARDMASTER_DATA_DIR:data,YARDMASTER_REPOSITORY_PATH:repo,YARDMASTER_PORT:String(port),YARDMASTER_DISABLE_UPDATE_CHECKS:'1',YARDMASTER_TEST_QUEUE_ONLY:'1',YARDMASTER_TEST_SELF_HEAL_QUEUE_ONLY:'1',YARDMASTER_TEST_PUSH_STUB:'1',YARDMASTER_TEST_RESTORE_SNAPSHOT_STUB:'1'},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',d=>output+=String(d));child.stderr.on('data',d=>output+=String(d));
  return {temp,data,repo,port,base:'http://127.0.0.1:'+port,bearer,child,output:()=>output};
}
async function ready(f){await poll(async()=>{const r=await fetch(f.base+'/api/status');return r.ok})}
async function api(f,url,{method='GET',body}={}){return fetch(f.base+url,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)})}
async function stop(f){await stopFixture({child:f.child,temp:f.temp,shutdown:()=>fetch(f.base+'/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'shutdown-operator'}),signal:AbortSignal.timeout(3000)})})}

test.describe('operations intelligence upgrade',()=>{
  test('Intelligence view renders workflow timeline, factual health, preflight, resources, evidence and required controls',async({page})=>{
    const f=fixture();try{
      await ready(f);await page.goto(f.base);await page.locator('[data-nav="intelligence"]:visible').click();await expect(page.locator('[data-view-panel="intelligence"]')).toBeVisible();
      for(const id of ['intelTimeline','intelHealth','intelPreflight','intelResources','intelEvidence','intelFailureMemory','intelSmartTests','intelFlakes','intelProvenance','intelChanges','intelCost','intelSelfHealAttempts','intelAnnotations','intelProfiles','intelWorktrees','intelAudit'])await expect(page.locator('#'+id)).toBeVisible();
      await page.getByRole('button',{name:'Run Preflight Doctor'}).click();await expect(page.locator('#intelPreflight')).toContainText(/Node|Repository|Git/i,{timeout:10000});
      await expect(page.locator('#intelTimeline')).toContainText('Start');await expect(page.locator('#intelHealth')).toContainText(/Git|Test runner/);
      await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
    }finally{await stop(f)}
  });

  test('reproduction capsule, snapshot and manifest actions stay inside isolated Yardmaster fixture data',async({page})=>{
    // Supplied Windows trace spent the original 45-second budget on startup
    // and two successful ZIP exports. Retain every export and UI assertion.
    test.setTimeout(120000);
    const f=fixture();try{
      await ready(f);
      expect(fs.existsSync(path.join(f.data,'intelligence'))).toBe(false);
      for(const action of ['create-repro-capsule','create-snapshot','export-build-manifest']){
        const r=await api(f,'/api/action',{method:'POST',body:{action}});const response=await r.text();expect(r.ok,`${action}: HTTP ${r.status}: ${response}`).toBe(true);const j=JSON.parse(response);expect(j.ok).toBe(true);expect(path.resolve(j.path).startsWith(path.resolve(f.data))).toBe(true);expect(fs.existsSync(j.path)).toBe(true);
      }
      let undo=await api(f,'/api/action',{method:'POST',body:{action:'restore-last-snapshot'}});expect(undo.ok).toBe(true);expect((await undo.json()).stubbed).toBe(true);
      const evidenceDir=path.join(f.data,'runs','binary-evidence');fs.mkdirSync(evidenceDir,{recursive:true});const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');fs.writeFileSync(path.join(evidenceDir,'failure.png'),png);fs.writeFileSync(path.join(evidenceDir,'trace.zip'),'fixture zip bytes');
      const imageResponse=await api(f,'/api/evidence?id='+encodeURIComponent('runs/binary-evidence/failure.png'));expect(imageResponse.ok).toBe(true);expect(imageResponse.headers.get('content-type')).toContain('image/png');
      const zipResponse=await api(f,'/api/evidence?id='+encodeURIComponent('runs/binary-evidence/trace.zip'));expect(zipResponse.ok).toBe(true);expect(zipResponse.headers.get('content-type')).toContain('application/zip');expect(zipResponse.headers.get('content-disposition')).toContain('attachment');
      const intel=await (await api(f,'/api/intelligence')).json();expect(intel.evidence.length).toBeGreaterThan(0);expect(intel.manifest.fileCount).toBeGreaterThan(20);expect(intel.smartTests.mandatoryFinal).toEqual(['npm run test:play-store','npm run test:playwright:full']);await page.goto(f.base);await page.locator('[data-nav="intelligence"]:visible').click();await page.locator('#refreshIntelligence').click();await expect(page.locator('.evidence-thumb')).toBeVisible();await expect(page.locator('#intelEvidence')).toContainText('trace.zip');
    }finally{await stop(f)}
  });

  test('profiles, worktrees, notes, bookmarks, safe mode and dry-run are operator controlled',async()=>{
    const f=fixture();try{
      await ready(f);
      let r=await api(f,'/api/action',{method:'POST',body:{action:'save-profile',name:'Fixture Profile'}});expect(r.ok).toBe(true);
      r=await api(f,'/api/action',{method:'POST',body:{action:'create-worktree',branch:'experiment/intel-fixture'}});expect(r.ok).toBe(true);let created=(await r.json()).result;expect(fs.existsSync(created.path)).toBe(true);
      r=await api(f,'/api/action',{method:'POST',body:{action:'add-run-note',note:'fixture note'}});expect(r.ok).toBe(true);
      r=await api(f,'/api/action',{method:'POST',body:{action:'bookmark-run',note:'fixture bookmark'}});expect(r.ok).toBe(true);
      r=await api(f,'/api/action',{method:'POST',body:{action:'set-safe-mode',enabled:true,reason:'fixture'}});expect(r.ok).toBe(true);expect((await r.json()).safeMode.enabled).toBe(true);
      r=await api(f,'/api/config',{method:'POST',body:{dryRunMode:true}});expect(r.ok).toBe(true);
      r=await api(f,'/api/action',{method:'POST',body:{action:'push'}});expect(r.ok).toBe(true);let j=await r.json();expect(j.dryRun).toBe(true);expect(j.plan.willExecute).toBe(false);
      let intel=await (await api(f,'/api/intelligence')).json();expect(Object.keys(intel.profiles).length).toBe(1);expect(intel.annotations.length).toBe(2);expect(intel.safeMode.enabled).toBe(true);expect(intel.worktrees.some(x=>x.branch==='experiment/intel-fixture')).toBe(true);
      r=await api(f,'/api/action',{method:'POST',body:{action:'remove-worktree',path:created.path}});expect(r.ok).toBe(true);
    }finally{await stop(f)}
  });

  test('Yardmaster-only live screenshot route is opt-in and never substitutes a full desktop capture',async()=>{
    const f=fixture();try{
      await ready(f);let r=await api(f,'/api/operator-screenshot');expect(r.status).toBe(404);
      const dir=path.join(f.data,'self-heal');fs.mkdirSync(dir,{recursive:true});const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64');fs.writeFileSync(path.join(dir,'last-window.png'),png);
      r=await api(f,'/api/action',{method:'POST',body:{action:'toggle-live-screenshot'}});expect(r.ok).toBe(true);
      r=await api(f,'/api/operator-screenshot');expect(r.ok).toBe(true);expect(r.headers.get('content-type')).toContain('image/png');expect((await r.arrayBuffer()).byteLength).toBe(png.length);
      const supervisor=fs.readFileSync(path.join(root,'scripts','Yardmaster-Supervisor.ps1'),'utf8');expect(supervisor).toContain('last-window.png');expect(supervisor).not.toMatch(/CopyFromScreen|VirtualScreen/);
    }finally{await stop(f)}
  });

  test('audit log, provenance, changed-since-good and self-heal/canary contracts remain visible and isolated',async()=>{
    const f=fixture();try{
      await ready(f);await api(f,'/api/action',{method:'POST',body:{action:'run-preflight'}});const intel=await (await api(f,'/api/intelligence')).json();
      expect(intel.audit.length).toBeGreaterThan(0);expect(intel.audit[0].hash).toMatch(/^[a-f0-9]{64}$/);expect(intel.provenance.branch).toBe('testing');expect(intel.provenance.version).toBe('0.1.97');expect(intel.changes.currentCommit).toMatch(/^[a-f0-9]{40}$/);
      const selfHeal=fs.readFileSync(path.join(root,'automation','self-heal.mjs'),'utf8');expect(selfHeal).toContain('canaryHealthCheck');expect(selfHeal).toContain('selfHealEscalation');expect(selfHeal).toContain('test:play-store');expect(selfHeal).toContain('test:playwright');
      const policy=JSON.parse(fs.readFileSync(path.join(root,'YARDMASTER_FEATURES.json'),'utf8'));expect(policy.policy.requiresPlayStoreOrCertificationTest).toBe(true);expect(policy.policy.requiresPlaywrightTest).toBe(true);expect(policy.policy.requireSingleTestingCommandOnDelivery).toBe(true);
    }finally{await stop(f)}
  });
});
