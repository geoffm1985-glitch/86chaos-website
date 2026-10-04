import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {__testHooks as hooks} from '../../automation/chatgpt.mjs';
import {assertManagedRepairProtocol} from '../../automation/loop-test-plan.mjs';
import {createContinuousLoopFixture,eventually} from '../helpers/continuous-loop-fixture.mjs';
for(const kind of ['retained Stop API script','STOP following preparation'])test(`@operatorControl142 browser repair refuses ${kind} and preserves the full checkpoint`,async({page})=>{
 test.setTimeout(90000);const f=await createContinuousLoopFixture();try{
  await page.goto(f.url);await f.api('/api/action',{action:'start'});
  const before=await eventually(async()=>{const s=await f.status();return s.workflow.state==='chatgpt'&&s});
  const script=kind.startsWith('retained')?fs.readFileSync(new URL('../fixtures/automatic-stop-142.ps1',import.meta.url),'utf8'):`Set-Content -LiteralPath '${path.join(f.repo,'should-not-exist.txt').replaceAll("'","''")}' -Value changed`;
  const text='YARDMASTER\nPOWERSHELL\n'+script+'\nEND_POWERSHELL\n'+(kind.startsWith('STOP')?'STOP\n':'')+'END';
  const result=await page.evaluate(async text=>{const r=await fetch('/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text})});return {status:r.status,error:await r.text()}},text);
  expect(result.status).toBe(500);expect(result.error).toMatch(/cannot stop Yardmaster|must not call Yardmaster control APIs/);
  const after=await f.status();expect(after.run.startedAt).toBe(before.run.startedAt);expect(after.workflow.state).toBe('chatgpt');expect(after.workflow.closedLoop).toBe(true);expect(after.workflow.fullFirstComplete).toBe(true);expect(f.runs()).toHaveLength(1);expect(fs.existsSync(path.join(f.repo,'should-not-exist.txt'))).toBe(false);expect(fs.existsSync(path.join(f.data,'powershell-runs'))).toBe(false);
  page.once('dialog',dialog=>dialog.accept());await page.locator('[data-action="stop"]').first().click();await eventually(async()=> (await f.status()).workflow.state==='stopped');
  expect((await f.status()).workflow.closedLoop).toBe(false);
 }finally{await f.close()}
});
test('@operatorControl142 rejected self-stop is corrected automatically and receives a real repair ZIP',async({page})=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ym-control-correction-')),session=await page.context().newCDPSession(page);
 const cdp={send:(m,p={})=>session.send(m,p),eval:async expression=>{const r=await session.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result?.value}};
 try{
  await page.setContent('<main><div data-message-author-role="assistant"><pre><code>YARDMASTER\nSTOP\nEND</code></pre></div></main><form><textarea id="prompt-textarea"></textarea><button type="submit">Send</button></form>');
  await page.evaluate(()=>{window.corrections=[];document.querySelector('form').onsubmit=e=>{e.preventDefault();const composer=document.querySelector('textarea'),user=document.createElement('div');user.dataset.messageAuthorRole='user';user.textContent=composer.value;corrections.push(composer.value);composer.value='';document.querySelector('main').replaceChildren(user);document.querySelector('main').insertAdjacentHTML('beforeend','<div data-message-author-role="assistant">Completed repair <a download="corrected-repair.zip" href="data:application/zip;base64,UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==">corrected-repair.zip</a></div>')}});
  await cdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:dir});let attempted=0;
  const zip=await hooks.waitRepair(cdp,dir,new Map(),()=>{},()=>false,0,{pollMs:20,onAssistantProtocol:async text=>{attempted++;assertManagedRepairProtocol(text)}},15000);
  expect(attempted).toBe(1);expect(path.basename(zip)).toBe('corrected-repair.zip');expect(fs.readFileSync(zip).subarray(0,2).toString()).toBe('PK');
  const corrections=await page.evaluate(()=>window.corrections);expect(corrections).toHaveLength(1);expect(corrections[0]).toContain('Stop is reserved for the human operator');
 }finally{await session.detach();fs.rmSync(dir,{recursive:true,force:true})}
});
