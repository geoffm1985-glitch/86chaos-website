import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn,execFileSync} from 'node:child_process';
import {createChatExchangeBudget} from '../../automation/chat-exchanges.mjs';
import {__testHooks} from '../../automation/chatgpt.mjs';

test('@loopUpdate199 real conversation rolls after second completed reply and preserves command result',async({page})=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ym-loop-browser-'));
  const protocol='YARDMASTER\nPOWERSHELL\nWrite-Output result\nEND_POWERSHELL\nEND';
  const budget=createChatExchangeBudget({url:'about:blank'});
  budget.complete({assistantMessages:1,generating:false,href:'about:blank'});
  await page.setContent('<article data-message-author-role="user">Fix testing only</article><article data-message-author-role="assistant">First reply</article><article data-message-author-role="user">command result one</article><article data-message-author-role="assistant"></article>');
  await page.locator('article').last().evaluate((e,text)=>e.textContent=text,protocol);
  const cdp={eval:expression=>page.evaluate(expression)};
  let executions=0,navigations=0;
  try{
    const file=await __testHooks.waitRepair(cdp,dir,new Map(),()=>{},()=>false,1,{
      exchangeBudget:budget,mode:'Work',model:'GPT-5.6 Sol',thinkingEffort:'High',artifactPath:'current-handoff.zip',prompt:'Fix testing only',dataDir:dir,
      onAssistantProtocol:async command=>{expect(command).toBe(protocol);executions++;return 'POWERSHELL exit=0; new diagnostic collected'},
      startFreshChat:async(_cdp,mode,model,effort,artifact,prompt)=>{
        navigations++;expect(mode).toBe('Work');expect(model).toBe('GPT-5.6 Sol');expect(effort).toBe('High');expect(artifact).toBe('current-handoff.zip');
        expect(prompt).toContain('command result one');expect(prompt).toContain('new diagnostic collected');expect(prompt).toContain('must not be executed again');
        await page.goto('about:blank');
        await page.setContent('<form><input type="file"><textarea></textarea><button>Send</button></form>');
        const handoff=path.join(dir,artifact);fs.writeFileSync(handoff,'handoff fixture');await page.locator('input').setInputFiles(handoff);await page.locator('textarea').fill(prompt);
        fs.writeFileSync(path.join(dir,'fixed.zip'),'fixture');fs.utimesSync(path.join(dir,'fixed.zip'),new Date(0),new Date(0));
      }
    },5000);
    expect(path.basename(file)).toBe('fixed.zip');expect(executions).toBe(1);expect(navigations).toBe(1);expect(budget.exchanges).toBe(0);
    expect(await page.locator('textarea').inputValue()).toContain('new diagnostic collected');
    expect(await page.locator('input').evaluate(e=>e.files[0].name)).toBe('current-handoff.zip');
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

async function fixture(){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ym-update-ui-')),repo=path.join(dir,'repo'),data=path.join(dir,'data');fs.mkdirSync(repo);fs.mkdirSync(data);
  fs.writeFileSync(path.join(repo,'package.json'),'{"name":"fixture","version":"1.0.0"}');execFileSync('git',['init','-b','testing'],{cwd:repo,stdio:'ignore'});
  fs.writeFileSync(path.join(data,'config.json'),JSON.stringify({repositoryPath:repo,autoUpdateOperator:false,autoSelfHeal:false,automationDefaultsVersion:7}));
  const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
  const child=spawn(process.execPath,['server.mjs'],{cwd:path.resolve('.'),stdio:'pipe',env:{...process.env,YARDMASTER_PORT:String(port),YARDMASTER_DATA_DIR:data,YARDMASTER_DISABLE_UPDATE_CHECKS:'1',YARDMASTER_TEST_UPDATE_STUB:'1',YARDMASTER_TEST_UPDATE_MANIFEST:JSON.stringify({version:'0.1.100',channel:'testing',verified:false,verification:{candidate:'testing-only'},downloadUrl:'https://example.invalid/testing.zip',sha256:'a'.repeat(64)})}});
  let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);
  const url='http://127.0.0.1:'+port;
  try{await expect.poll(async()=>{if(child.exitCode!==null)throw new Error(output);try{return (await fetch(url+'/api/status')).ok}catch{return false}},{timeout:15000}).toBe(true)}catch(error){child.kill();fs.rmSync(dir,{recursive:true,force:true});throw error}
  return {url,data,close:async()=>{if(child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r))}fs.rmSync(dir,{recursive:true,force:true})}};
}

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
        await page.goto(f.url);await expect(page.locator('#versionLabel')).toHaveText('0.1.99');
        await page.locator('[data-nav="settings"]:visible').click();
        const response=page.waitForResponse(r=>r.url().endsWith('/api/action')&&r.request().method()==='POST');
        await page.locator('[data-action="update-operator-now"]').click();
        const result=await response;expect(result.ok()).toBe(true);
        expect((await result.json()).stubbed).toBe(true);
        const marker=JSON.parse(fs.readFileSync(path.join(f.data,'update-resume.json'),'utf8'));expect(marker.to).toBe('0.1.100');
        // Windows PowerShell 5.1 writes UTF-8 with a BOM; the running app must read it.
        fs.writeFileSync(path.join(f.data,'operator-update-result.json'),'\uFEFF'+JSON.stringify({state:'failed',error:'Checksum mismatch: installation was not changed'}));
        await expect.poll(async()=>{const r=await page.request.get(f.url+'/api/status');return (await r.json()).update.state},{timeout:8000}).toBe('Update failed');
        await page.locator('[data-nav="operations"]:visible').click();
        await expect(page.locator('#doingStatus')).toContainText('Checksum mismatch',{timeout:10000});
        expect((await (await page.request.get(f.url+'/api/status')).json()).online).toBe(true);
      }finally{await f.close()}
    });
