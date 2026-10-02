import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {operatorUpdateFixture as fixture} from '../helpers/operator-update-fixture.mjs';
import {createChatExchangeBudget} from '../../automation/chat-exchanges.mjs';
import {__testHooks} from '../../automation/chatgpt.mjs';
import {createLoopRepairFiles} from '../helpers/loop-update-fixture.mjs';

test('@loopUpdate199 real conversation rolls after second completed reply and preserves command result',async({page})=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ym-loop-browser-'));
  const {artifact:handoffFile,downloads}=createLoopRepairFiles(dir);
  const protocol='YARDMASTER\nPOWERSHELL\nWrite-Output result\nEND_POWERSHELL\nEND';
  const budget=createChatExchangeBudget({url:'about:blank'});
  budget.complete({assistantMessages:1,generating:false,href:'about:blank'});
  await page.setContent('<article data-message-author-role="user">Fix testing only</article><article data-message-author-role="assistant">First reply</article><article data-message-author-role="user">command result one</article><article data-message-author-role="assistant"></article>');
  await page.locator('article').last().evaluate((e,text)=>e.textContent=text,protocol);
  const cdp={eval:expression=>page.evaluate(expression)};
  // Reproduce Windows Chromium normal-flow whitespace: rendered text collapses
  // the protocol, while the raw assistant text retains command boundaries.
  expect(await page.locator('article').last().innerText()).not.toBe(protocol);
  expect(await __testHooks.latestAssistantText(cdp)).toBe(protocol);
  let executions=0,navigations=0;
  try{
    const file=await __testHooks.waitRepair(cdp,downloads,new Map(),()=>{},()=>false,1,{
      exchangeBudget:budget,mode:'Work',model:'GPT-5.6 Sol',thinkingEffort:'High',artifactPath:handoffFile,prompt:'Fix testing only',dataDir:dir,
      onAssistantProtocol:async command=>{expect(command).toBe(protocol);executions++;return 'POWERSHELL exit=0; new diagnostic collected'},
      startFreshChat:async(_cdp,mode,model,effort,artifact,prompt)=>{
        navigations++;expect(mode).toBe('Work');expect(model).toBe('GPT-5.6 Sol');expect(effort).toBe('High');expect(artifact).toBe(handoffFile);
        expect(prompt).toContain('command result one');expect(prompt).toContain('new diagnostic collected');expect(prompt).toContain('must not be executed again');
        await page.goto('about:blank');
        await page.setContent('<form><input type="file"><textarea></textarea><button>Send</button></form>');
        await page.locator('input').setInputFiles(artifact);await page.locator('textarea').fill(prompt);
        fs.writeFileSync(path.join(downloads,'fixed.zip'),'fixture');fs.utimesSync(path.join(downloads,'fixed.zip'),new Date(0),new Date(0));
      }
    },20000);
    expect(file).toBe(path.join(downloads,'fixed.zip'));expect(executions).toBe(1);expect(navigations).toBe(1);expect(budget.exchanges).toBe(0);
    expect(await page.locator('textarea').inputValue()).toContain('new diagnostic collected');
    expect(await page.locator('input').evaluate(e=>e.files[0].name)).toBe('current-handoff.zip');
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('@loopUpdate199 HTTP updater preserves the running operator and reads Windows failure evidence',async()=>{
  const f=await fixture();
  try{
    const response=await fetch(f.url+'/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'update-operator-now'})});
    expect(response.ok).toBe(true);expect((await response.json()).stubbed).toBe(true);
    fs.writeFileSync(path.join(f.data,'operator-update-result.json'),'\uFEFF'+JSON.stringify({state:'failed',error:'Canary launch failed; existing installation retained'}));
    await expect.poll(async()=>{const r=await fetch(f.url+'/api/status');return (await r.json()).update.state},{timeout:8000}).toBe('Update failed');
    const status=await (await fetch(f.url+'/api/status')).json();expect(status.online).toBe(true);expect(status.operatorStatus.doing).toContain('Canary launch failed');
    const retry=await fetch(f.url+'/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'update-operator-now'})});
    expect(retry.ok).toBe(true);expect((await retry.json()).stubbed).toBe(true);
  }finally{await f.close()}
});

test('@loopUpdate199 manual testing update records a restart marker and failure status remains visible',async({page})=>{
      const f=await fixture();
      try{
        await page.goto(f.url);await expect(page.locator('#versionLabel')).toHaveText('0.1.103');
        await page.locator('[data-nav="settings"]:visible').click();
        const response=page.waitForResponse(r=>r.url().endsWith('/api/action')&&r.request().method()==='POST');
        await page.locator('[data-action="update-operator-now"]').click();
        const result=await response;expect(result.ok()).toBe(true);
        expect((await result.json()).stubbed).toBe(true);
        const marker=JSON.parse(fs.readFileSync(path.join(f.data,'update-resume.json'),'utf8'));expect(marker.to).toBe('0.1.104');
        // Windows PowerShell 5.1 writes UTF-8 with a BOM; the running app must read it.
        fs.writeFileSync(path.join(f.data,'operator-update-result.json'),'\uFEFF'+JSON.stringify({state:'failed',error:'Checksum mismatch: installation was not changed'}));
        await expect.poll(async()=>{const r=await page.request.get(f.url+'/api/status');return (await r.json()).update.state},{timeout:8000}).toBe('Update failed');
        await page.locator('[data-nav="operations"]:visible').click();
        await expect(page.locator('#doingStatus')).toContainText('Checksum mismatch',{timeout:10000});
        expect((await (await page.request.get(f.url+'/api/status')).json()).online).toBe(true);
      }finally{await f.close()}
    });
