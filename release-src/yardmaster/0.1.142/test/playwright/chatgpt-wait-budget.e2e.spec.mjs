import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {__testHooks as hooks} from '../../automation/chatgpt.mjs';

const command='YARDMASTER\nRUN full\nEND';
const reply='<div data-message-author-role="assistant"><p>Repair completed</p><a id="repair" download="complete-repair.zip" href="data:application/zip;base64,UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==">Download complete-repair.zip</a></div>';
for(const rollover of [false,true])test(`@handoffBudget141 five-hour owned command then ${rollover?'fresh handoff':'command result'} receives the actual repair download`,async({page})=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ym-handoff-budget-'));
 const session=await page.context().newCDPSession(page);
 const realNow=Date.now;let offset=0,calls=0,chats=0,sends=0;
 const budget={due:false,complete(){},reset(){this.due=false}};
 const cdp={send:(m,p={})=>session.send(m,p),eval:async expression=>{const r=await session.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result?.value}};
 try{
  await page.setContent(`<main><div data-message-author-role="user"><button id="upload">Yardmaster-Handoff-123.zip</button></div><div data-message-author-role="assistant"><pre><code>${command}</code></pre></div></main><form><textarea id="prompt-textarea"></textarea><button type="submit">Send</button></form>`);
  await page.evaluate(html=>{window.sends=0;window.uploadClicks=0;document.querySelector('#upload').onclick=()=>uploadClicks++;document.querySelector('form').onsubmit=e=>{e.preventDefault();sends++;const composer=document.querySelector('#prompt-textarea'),user=document.createElement('div');user.dataset.messageAuthorRole='user';user.textContent=composer.value;composer.value='';document.querySelector('main').replaceChildren(user);document.querySelector('main').insertAdjacentHTML('beforeend',html)}},reply);
  await cdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:dir});
  Date.now=()=>realNow()+offset;
  const zip=await hooks.waitRepair(cdp,dir,new Map(),()=>{},()=>false,0,{artifactPath:'Yardmaster-Handoff-123.zip',exchangeBudget:budget,pollMs:20,
   onAssistantProtocol:async text=>{calls++;expect(text).toBe(command);offset+=5*60*60*1000;budget.due=rollover;return 'five-hour managed full test finished'},
   startFreshChat:async()=>{chats++;await page.locator('main').evaluate((e,html)=>e.innerHTML=html,reply)}},10000);
  expect(path.basename(zip)).toBe('complete-repair.zip');expect(fs.readFileSync(zip).subarray(0,2).toString()).toBe('PK');
  expect(calls).toBe(1);expect(chats).toBe(rollover?1:0);sends=await page.evaluate(()=>window.sends);expect(sends).toBe(rollover?0:1);expect(await page.evaluate(()=>uploadClicks)).toBe(0);
 }finally{Date.now=realNow;await session.detach();fs.rmSync(dir,{recursive:true,force:true})}
});
