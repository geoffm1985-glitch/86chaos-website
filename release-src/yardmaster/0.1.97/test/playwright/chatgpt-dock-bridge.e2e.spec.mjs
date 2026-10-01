import {test,expect,_electron} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {preparedElectronExecutable} from '../../scripts/electron-test-runtime.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
async function fixture(fn){const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ym-electron-dock-')),file=path.join(temp,'preserved-handoff.zip');fs.writeFileSync(file,'fixture handoff');let electron;try{preparedElectronExecutable(root);electron=await _electron.launch({args:[path.join(root,'test/fixtures/dock-bridge/main.cjs')],env:{...process.env,YM_FIXTURE_DIR:temp},timeout:20000});await expect.poll(()=>electron.evaluate(()=>global.dockReady===true)).toBe(true);await fn(electron,file)}finally{await electron?.close();fs.rmSync(temp,{recursive:true,force:true})}}
function assertResult(result){expect(result.ok,result.error).toBe(true);expect(result.docked).toBe(true);expect(result.port).toBeNull();expect(result.ready?.id).toBe('prompt-textarea');expect(result.account).toBe('saved-account');expect(result.uploaded).toBe('preserved-handoff.zip');expect(result.draft).toBe('preserved draft')}
test('@chatgptCold197 @chatgptBridge196 real Electron dock reaches its signed-in composer and uploads the preserved ZIP without a debug port',async()=>{await fixture(async(electron,file)=>assertResult(await electron.evaluate((_electron,file)=>global.exerciseDock(file),file)))});
test('@chatgptBridge196 reload and Resume reconnect to the same persistent Electron account and handoff',async()=>{await fixture(async(electron,file)=>{assertResult(await electron.evaluate((_electron,file)=>global.exerciseDock(file),file));await electron.evaluate(()=>global.reloadDock());assertResult(await electron.evaluate((_electron,file)=>global.exerciseDock(file),file))})});
