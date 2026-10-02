import {test,expect,_electron} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {launchElectronDockTest,ELECTRON_TEST_TIMEOUT_MS} from '../../scripts/electron-test-launch.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
test.describe.configure({timeout:ELECTRON_TEST_TIMEOUT_MS});
async function fixture(fn){const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ym-electron-dock-')),file=path.join(temp,'preserved-handoff.zip');fs.writeFileSync(file,'fixture handoff');let electron;try{electron=await launchElectronDockTest({root,temp,launcher:options=>_electron.launch(options)});await expect.poll(()=>electron.evaluate(()=>global.dockReady===true),{timeout:20000}).toBe(true);await fn(electron,file)}finally{await electron?.close();fs.rmSync(temp,{recursive:true,force:true})}}
function assertResult(result){expect(result.ok,result.error).toBe(true);expect(result.docked).toBe(true);expect(result.port).toBeNull();expect(result.ready?.id).toBe('prompt-textarea');expect(result.account).toBe('saved-account');expect(result.uploaded).toBe('preserved-handoff.zip');expect(result.draft).toBe('preserved draft')}
test('@handoffReady116 formerly hidden dock accepts trusted keys and clears restored drafts after navigation/reload',async()=>{await fixture(async electron=>{
 await electron.evaluate(()=>{global.hideProductionDock();global.collapseDock()});
 for(let i=0;i<2;i++){const r=await electron.evaluate(()=>global.exerciseDock(null,'manual'));expect(r.ok,r.error).toBe(true);expect(r.ready).toBeTruthy();expect(r.draft.trim()).toBe('');expect(r.account).toBe('saved-account');if(!i)await electron.evaluate(()=>global.reloadDock())}
})});
test('@hiddenDock114 hidden production dock retains a usable signed-in composer and upload after reload',async()=>{await fixture(async(electron,file)=>{
  await electron.evaluate(()=>global.hideProductionDock());
  const geometry=await electron.evaluate(()=>global.hiddenDockGeometry());expect(geometry.visible).toBe(false);expect(geometry.bounds.x).toBe(0);expect(geometry.bounds.width).toBe(1280);
  await electron.evaluate(()=>global.collapseDock());
  assertResult(await electron.evaluate((_electron,file)=>global.exerciseDock(file),file));
  await electron.evaluate(()=>global.reloadDock());assertResult(await electron.evaluate((_electron,file)=>global.exerciseDock(file),file));
})});
test('@chatgptStartup198 @chatgptBridge196 real Electron dock reaches its signed-in composer and uploads the preserved ZIP without a debug port',async()=>{await fixture(async(electron,file)=>assertResult(await electron.evaluate((_electron,file)=>global.exerciseDock(file),file)))});
test('@chatgptBridge196 reload and Resume reconnect to the same persistent Electron account and handoff',async()=>{await fixture(async(electron,file)=>{assertResult(await electron.evaluate((_electron,file)=>global.exerciseDock(file),file));await electron.evaluate(()=>global.reloadDock());assertResult(await electron.evaluate((_electron,file)=>global.exerciseDock(file),file))})});

test('@handoffSend116 hidden Electron dock selects Chat and submits the ZIP with wrapped instructions exactly once',async()=>{await fixture(async(electron,file)=>{await electron.evaluate(()=>global.hideProductionDock());const r=await electron.evaluate((_electron,file)=>global.exerciseDock(file,'handoff'),file);expect(r.ok,r.error).toBe(true);expect(r.selection).toBe(true);expect(r.sent).toBe(true);expect(r.uploaded).toBe('preserved-handoff.zip');expect(r.draft.trim()).toBe('');expect(r.account).toBe('saved-account')})});
