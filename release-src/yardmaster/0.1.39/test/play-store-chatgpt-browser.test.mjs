import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {__testHooks} from '../automation/chatgpt.mjs';

const delay=ms=>new Promise(r=>setTimeout(r,ms));
function edgePath(){
  const candidates=[
    process.env['PROGRAMFILES(X86)']&&path.join(process.env['PROGRAMFILES(X86)'],'Microsoft','Edge','Application','msedge.exe'),
    process.env.PROGRAMFILES&&path.join(process.env.PROGRAMFILES,'Microsoft','Edge','Application','msedge.exe'),
    process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'Microsoft','Edge','Application','msedge.exe')
  ].filter(Boolean);
  return candidates.find(fs.existsSync);
}
async function waitJson(url,timeout=20000){
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){try{const r=await fetch(url);if(r.ok)return await r.json()}catch{} await delay(200)}
  throw new Error('Timed out waiting for Edge DevTools fixture.');
}
class FixtureCdp{
  constructor(url){this.url=url;this.ws=null;this.id=0;this.pending=new Map();this.eventWaiters=new Map()}
  async connect(){
    this.ws=new WebSocket(this.url);
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('fixture websocket timeout')),10000);this.ws.addEventListener('open',()=>{clearTimeout(timer);resolve()},{once:true});this.ws.addEventListener('error',reject,{once:true})});
    this.ws.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(!msg.id){const waiters=this.eventWaiters.get(msg.method);if(waiters?.length){const w=waiters.shift();clearTimeout(w.timer);w.resolve(msg.params||{});if(!waiters.length)this.eventWaiters.delete(msg.method)}return}const p=this.pending.get(msg.id);if(!p)return;this.pending.delete(msg.id);clearTimeout(p.timer);if(msg.error)p.reject(new Error(msg.error.message));else p.resolve(msg.result)});
  }
  send(method,params={},timeout=10000){const id=++this.id;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('CDP timeout '+method))},timeout);this.pending.set(id,{resolve,reject,timer});this.ws.send(JSON.stringify({id,method,params}))})}
  async eval(expression,timeout=10000){const r=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true},timeout);if(r.exceptionDetails)throw new Error(r.exceptionDetails.text||'fixture eval failed');return r.result?.value}
  waitEvent(method,timeout=5000){return new Promise((resolve,reject)=>{const waiter={resolve,reject,timer:null};waiter.timer=setTimeout(()=>{const list=this.eventWaiters.get(method)||[];const i=list.indexOf(waiter);if(i>=0)list.splice(i,1);if(!list.length)this.eventWaiters.delete(method);reject(new Error('fixture event timeout '+method))},timeout);const list=this.eventWaiters.get(method)||[];list.push(waiter);this.eventWaiters.set(method,list)})}
  close(){for(const waiters of this.eventWaiters.values())for(const w of waiters){clearTimeout(w.timer);w.reject(new Error('fixture closed'))}this.eventWaiters.clear();try{this.ws?.close()}catch{}}
}

test('Play Store browser reproduces filled-but-unsent and requires trusted send',{skip:process.platform!=='win32'},async()=>{
  const edge=edgePath();
  assert.ok(edge,'Microsoft Edge must be available on the Windows Store runner.');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster-send-fixture-'));
  const port=9333+Math.floor(Math.random()*300);
  const html=[
    '<!doctype html><meta charset="utf-8">',
    '<form id="composer-form"><textarea id="prompt-textarea"></textarea><button data-testid="send-button" aria-label="Send" type="button">Send</button></form>',
    '<div id="messages"></div>',
    '<script>',
    'const input=document.querySelector("#prompt-textarea");',
    'const send=document.querySelector("[data-testid=send-button]");',
    'let trustedEdit=false;',
    'input.addEventListener("input",event=>{if(event.isTrusted)trustedEdit=true});',
    'const commit=event=>{if(!event.isTrusted||!trustedEdit)return;const value=input.value||input.innerText||"";if(!value.trim())return;const message=document.createElement("div");message.dataset.messageAuthorRole="user";message.textContent=value;document.querySelector("#messages").append(message);input.value="";trustedEdit=false;input.dispatchEvent(new Event("input",{bubbles:true}))};',
    'send.addEventListener("click",commit);',
    'input.addEventListener("keydown",event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();commit(event)}});',
    '</script>'
  ].join('');
  const file=path.join(temp,'fixture.html');fs.writeFileSync(file,html);
  const child=spawn(edge,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-address=127.0.0.1','--remote-debugging-port='+port,'--user-data-dir='+path.join(temp,'profile'),'file:///'+file.replace(/\\/g,'/')],{stdio:'ignore',windowsHide:true});
  let cdp;
  try{
    const targets=await waitJson('http://127.0.0.1:'+port+'/json/list');
    const page=targets.find(t=>t.type==='page'&&t.webSocketDebuggerUrl);assert.ok(page,'Edge fixture page target was not found.');
    cdp=new FixtureCdp(page.webSocketDebuggerUrl);await cdp.connect();
    const readyDeadline=Date.now()+5000;let fixtureReady=false;
    while(Date.now()<readyDeadline){fixtureReady=await cdp.eval('document.readyState==="complete"&&!!document.querySelector("#prompt-textarea")&&!!document.querySelector("[data-testid=\\\"send-button\\\"]")').catch(()=>false);if(fixtureReady)break;await delay(100)}
    assert.equal(fixtureReady,true,'Edge fixture composer did not become ready.');
    const synthetic=await cdp.eval('(()=>{const e=document.querySelector("#prompt-textarea");e.value="SYNTHETIC MUST NOT SEND";e.dispatchEvent(new Event("input",{bubbles:true}));document.querySelector("[data-testid=\\\"send-button\\\"]").click();return document.querySelectorAll("[data-message-author-role=\\\"user\\\"]").length})()');
    assert.equal(synthetic,0,'fixture must reject synthetic HTMLElement.click(), reproducing the live failure mode');
    await __testHooks.sendPrompt(cdp,'YARDMASTER PLAY STORE TRUSTED SEND',null,{sendTimeoutMs:5000,confirmMs:800});
    const messages=await cdp.eval('[...document.querySelectorAll("[data-message-author-role=\\\"user\\\"]")].map(x=>x.innerText||x.textContent)');
    assert.deepEqual(messages,['YARDMASTER PLAY STORE TRUSTED SEND']);
  }finally{cdp?.close();try{child.kill()}catch{}await delay(500);try{fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:250})}catch{/* ephemeral GitHub runner will clean any still-locked Edge profile */}}
});


test('Play Store browser uploads through the trusted composer file chooser and ignores decoy inputs',{skip:process.platform!=='win32'},async()=>{
  const edge=edgePath();
  assert.ok(edge,'Microsoft Edge must be available on the Windows Store runner.');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster-attachment-fixture-'));
  const port=9633+Math.floor(Math.random()*200);
  const upload=path.join(temp,'Yardmaster-Handoff-Fixture.zip');fs.writeFileSync(upload,'yardmaster fixture');
  const html=[
    '<!doctype html><meta charset="utf-8">',
    '<form id="composer-form"><textarea id="prompt-textarea"></textarea><button id="attach" type="button" aria-label="Add files and more">+</button><div id="menu" role="menu" style="display:none"><button id="upload" type="button" role="menuitem">Upload from computer</button></div><input id="real-file" type="file" hidden><span data-testid="attachment-chip" id="attachment-chip"></span></form>',
    '<input id="decoy-file" type="file" hidden>',
    '<script>',
    'const attach=document.querySelector("#attach"),menu=document.querySelector("#menu"),upload=document.querySelector("#upload"),real=document.querySelector("#real-file");',
    'attach.addEventListener("click",event=>{if(event.isTrusted)menu.style.display="block"});',
    'upload.addEventListener("click",event=>{if(event.isTrusted)real.click()});',
    'real.addEventListener("change",()=>{document.querySelector("#attachment-chip").textContent=real.files&&real.files[0]?real.files[0].name:"";menu.style.display="none"});',
    '</script>'
  ].join('');
  const file=path.join(temp,'fixture-attachment.html');fs.writeFileSync(file,html);
  const child=spawn(edge,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-address=127.0.0.1','--remote-debugging-port='+port,'--user-data-dir='+path.join(temp,'profile'),'file:///'+file.replace(/\\/g,'/')],{stdio:'ignore',windowsHide:true});
  let cdp;
  try{
    const targets=await waitJson('http://127.0.0.1:'+port+'/json/list');
    const page=targets.find(t=>t.type==='page'&&t.webSocketDebuggerUrl);assert.ok(page,'Edge attachment fixture page target was not found.');
    cdp=new FixtureCdp(page.webSocketDebuggerUrl);await cdp.connect();
    const readyDeadline=Date.now()+5000;let fixtureReady=false;
    while(Date.now()<readyDeadline){fixtureReady=await cdp.eval('document.readyState==="complete"&&!!document.querySelector("#prompt-textarea")&&!!document.querySelector("#attach")&&!!document.querySelector("#real-file")&&!!document.querySelector("#decoy-file")').catch(()=>false);if(fixtureReady)break;await delay(100)}
    assert.equal(fixtureReady,true,'Edge attachment fixture did not become ready.');
    const synthetic=await cdp.eval('(()=>{document.querySelector("#attach").click();return getComputedStyle(document.querySelector("#menu")).display})()');
    assert.equal(synthetic,'none','fixture must reject synthetic attachment-button clicks');
    await __testHooks.attachFile(cdp,upload,null);
    assert.equal(await cdp.eval('document.querySelector("#attachment-chip").textContent'),'Yardmaster-Handoff-Fixture.zip');
    assert.equal(await cdp.eval('document.querySelector("#real-file").files[0].name'),'Yardmaster-Handoff-Fixture.zip');
    assert.equal(await cdp.eval('document.querySelector("#decoy-file").files.length'),0,'trusted chooser path must not populate unrelated file inputs');
  }finally{cdp?.close();try{child.kill()}catch{}await delay(500);try{fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:250})}catch{}}
});

test('Play Store browser manual open clears a handoff draft that reappears after hydration',{skip:process.platform!=='win32'},async()=>{
  const edge=edgePath();
  assert.ok(edge,'Microsoft Edge must be available on the Windows Store runner.');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster-manual-clean-fixture-'));
  const port=9833+Math.floor(Math.random()*100);
  const html=[
    '<!doctype html><meta charset="utf-8">',
    '<textarea id="prompt-textarea">Yardmaster automated handoff. STALE</textarea>',
    '<script>',
    'const input=document.querySelector("#prompt-textarea");let restored=false;',
    'input.addEventListener("input",event=>{if(!event.isTrusted||restored)return;if(input.value===""){restored=true;setTimeout(()=>{input.value="Yardmaster automated handoff. RESTORED LATE";input.dispatchEvent(new Event("input",{bubbles:true}))},450)}});',
    '</script>'
  ].join('');
  const file=path.join(temp,'manual-clean.html');fs.writeFileSync(file,html);
  const child=spawn(edge,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-address=127.0.0.1','--remote-debugging-port='+port,'--user-data-dir='+path.join(temp,'profile'),'file:///'+file.replace(/\\/g,'/')],{stdio:'ignore',windowsHide:true});
  let cdp;
  try{
    const targets=await waitJson('http://127.0.0.1:'+port+'/json/list');
    const page=targets.find(t=>t.type==='page'&&t.webSocketDebuggerUrl);assert.ok(page,'Edge manual-clean fixture page target was not found.');
    cdp=new FixtureCdp(page.webSocketDebuggerUrl);await cdp.connect();
    // Keep fixture URL in place while exercising the manual-clean routine.
    const originalSend=cdp.send.bind(cdp);
    cdp.send=async(method,params={},timeout=10000)=>method==='Page.navigate'?{}:originalSend(method,params,timeout);
    assert.equal(await __testHooks.prepareManualChat(cdp),true);
    assert.equal((await cdp.eval('document.querySelector("#prompt-textarea").value')).trim(),'');
  }finally{cdp?.close();try{child.kill()}catch{}await delay(500);try{fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:250})}catch{}}
});



test('Play Store browser performs the complete trusted ZIP plus prompt plus send handoff',{skip:process.platform!=='win32'},async()=>{
  const edge=edgePath();
  assert.ok(edge,'Microsoft Edge must be available on the Windows Store runner.');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster-combined-handoff-fixture-'));
  const port=9733+Math.floor(Math.random()*150);
  const upload=path.join(temp,'Yardmaster-Combined-Handoff-Fixture.zip');fs.writeFileSync(upload,'yardmaster combined fixture');
  const html=[
    '<!doctype html><meta charset="utf-8">',
    '<form id="composer-form"><textarea id="prompt-textarea"></textarea><button id="attach" type="button" aria-label="Add files and more">+</button><div id="menu" role="menu" style="display:none"><button id="upload" type="button" role="menuitem">Upload from computer</button></div><input id="real-file" type="file" hidden><span data-testid="attachment-chip" id="attachment-chip"></span><button data-testid="send-button" aria-label="Send" id="send" type="button" disabled>Send</button></form>',
    '<div id="messages"></div>',
    '<script>',
    'const input=document.querySelector("#prompt-textarea"),attach=document.querySelector("#attach"),menu=document.querySelector("#menu"),upload=document.querySelector("#upload"),real=document.querySelector("#real-file"),chip=document.querySelector("#attachment-chip"),send=document.querySelector("#send");',
    'let trustedEdit=false;',
    'const update=()=>{send.disabled=!(trustedEdit&&input.value.trim()&&real.files&&real.files.length===1)};',
    'attach.addEventListener("click",event=>{if(event.isTrusted)menu.style.display="block"});',
    'upload.addEventListener("click",event=>{if(event.isTrusted)real.click()});',
    'real.addEventListener("change",()=>{chip.textContent=real.files&&real.files[0]?real.files[0].name:"";menu.style.display="none";update()});',
    'input.addEventListener("input",event=>{if(event.isTrusted)trustedEdit=true;update()});',
    'send.addEventListener("click",event=>{if(!event.isTrusted||send.disabled)return;const message=document.createElement("div");message.dataset.messageAuthorRole="user";message.textContent=input.value;document.querySelector("#messages").append(message);input.value="";chip.textContent="";send.disabled=true});',
    '</script>'
  ].join('');
  const file=path.join(temp,'combined-handoff.html');fs.writeFileSync(file,html);
  const child=spawn(edge,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-address=127.0.0.1','--remote-debugging-port='+port,'--user-data-dir='+path.join(temp,'profile'),'file:///'+file.replace(/\\/g,'/')],{stdio:'ignore',windowsHide:true});
  let cdp;
  try{
    const targets=await waitJson('http://127.0.0.1:'+port+'/json/list');
    const page=targets.find(t=>t.type==='page'&&t.webSocketDebuggerUrl);assert.ok(page,'Edge combined handoff fixture page target was not found.');
    cdp=new FixtureCdp(page.webSocketDebuggerUrl);await cdp.connect();
    const readyDeadline=Date.now()+5000;let ready=false;
    while(Date.now()<readyDeadline){ready=await cdp.eval('document.readyState==="complete"&&!!document.querySelector("#prompt-textarea")&&!!document.querySelector("#attach")&&!!document.querySelector("#send")').catch(()=>false);if(ready)break;await delay(100)}
    assert.equal(ready,true,'Edge combined handoff fixture did not become ready.');
    await __testHooks.attachFile(cdp,upload,null);
    assert.equal(await cdp.eval('document.querySelector("#attachment-chip").textContent'),'Yardmaster-Combined-Handoff-Fixture.zip');
    await __testHooks.sendPrompt(cdp,'YARDMASTER COMPLETE HANDOFF',null,{sendTimeoutMs:5000,confirmMs:800,attachmentConfirmMs:1000,requiredAttachmentName:'Yardmaster-Combined-Handoff-Fixture.zip'});
    const messages=await cdp.eval('[...document.querySelectorAll("[data-message-author-role=\\\"user\\\"]")].map(x=>x.textContent)');
    assert.deepEqual(messages,['YARDMASTER COMPLETE HANDOFF']);
  }finally{cdp?.close();try{child.kill()}catch{}await delay(500);try{fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:250})}catch{}}
});
