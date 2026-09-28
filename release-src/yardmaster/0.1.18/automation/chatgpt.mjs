import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const delay=ms=>new Promise(r=>setTimeout(r,ms));
let lastEdgeSpawnAt=0;

function edgePath(){
  const candidates=[
    process.env['PROGRAMFILES(X86)']&&path.join(process.env['PROGRAMFILES(X86)'],'Microsoft','Edge','Application','msedge.exe'),
    process.env.PROGRAMFILES&&path.join(process.env.PROGRAMFILES,'Microsoft','Edge','Application','msedge.exe'),
    process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'Microsoft','Edge','Application','msedge.exe')
  ].filter(Boolean);
  return candidates.find(fs.existsSync);
}

async function waitJson(url,timeoutMs=20000){
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    try{const r=await fetch(url);if(r.ok)return await r.json()}catch{}
    await delay(300);
  }
  throw new Error('Timed out waiting for the Yardmaster ChatGPT browser.');
}

class Cdp {
  constructor(url){this.url=url;this.ws=null;this.id=0;this.pending=new Map()}
  rejectPending(error){
    for(const {reject,timer} of this.pending.values()){clearTimeout(timer);reject(error)}
    this.pending.clear();
  }
  async connect(){
    this.ws=new WebSocket(this.url);
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Timed out connecting to Edge DevTools.')),10000);
      this.ws.addEventListener('open',()=>{clearTimeout(timer);resolve()},{once:true});
      this.ws.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('Could not connect to Edge DevTools.'))},{once:true});
    });
    this.ws.addEventListener('message',event=>{
      let m;try{m=JSON.parse(event.data)}catch{return}
      if(!m.id)return;
      const p=this.pending.get(m.id);if(!p)return;
      this.pending.delete(m.id);clearTimeout(p.timer);
      if(m.error)p.reject(new Error(m.error.message||'CDP command failed'));else p.resolve(m.result);
    });
    this.ws.addEventListener('close',()=>this.rejectPending(new Error('Edge DevTools connection closed.')));
    this.ws.addEventListener('error',()=>this.rejectPending(new Error('Edge DevTools connection failed.')));
  }
  send(method,params={},timeoutMs=12000){
    if(!this.ws||this.ws.readyState!==1)return Promise.reject(new Error('DevTools connection is not open.'));
    const id=++this.id;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{if(this.pending.has(id)){this.pending.delete(id);reject(new Error('CDP command timed out: '+method))}},timeoutMs);
      this.pending.set(id,{resolve,reject,timer});
      try{this.ws.send(JSON.stringify({id,method,params}))}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e)}
    });
  }
  async eval(expression,timeoutMs=12000){
    const r=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true},timeoutMs);
    if(r.exceptionDetails)throw new Error(r.exceptionDetails.text||'Browser script failed.');
    return r.result?.value;
  }
  close(){this.rejectPending(new Error('Edge DevTools connection closed.'));try{this.ws?.close()}catch{}this.ws=null}
}

function safeJson(v){return JSON.stringify(v).replace(/</g,'\\u003c')}
async function listTargets(timeoutMs=1800){
  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    const r=await fetch('http://127.0.0.1:9222/json/list',{signal:controller.signal});
    clearTimeout(timer);
    if(r.ok)return await r.json();
  }catch{}
  return null;
}
async function attachResponsiveChatGPT(targets,downloads){
  const pages=(targets||[]).filter(t=>t.type==='page'&&t.webSocketDebuggerUrl&&/chatgpt\.com/i.test(t.url||''));
  const candidates=[];
  for(const target of pages){
    const cdp=new Cdp(target.webSocketDebuggerUrl);
    try{
      await cdp.connect();
      const probe=await cdp.eval(`(()=>({href:location.href,ready:document.readyState,title:document.title,marked:sessionStorage.getItem('yardmaster-controlled')==='1'}))()`,5000);
      if(probe?.href)candidates.push({target,probe,cdp});else cdp.close();
    }catch{cdp.close()}
  }
  const chosen=candidates.find(x=>x.probe.marked)||candidates[0];
  for(const item of candidates){if(item!==chosen)item.cdp.close()}
  if(!chosen)return null;
  await chosen.cdp.eval(`sessionStorage.setItem('yardmaster-controlled','1');true`,5000).catch(()=>{});
  try{await chosen.cdp.send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:downloads,eventsEnabled:true},5000)}catch{
    try{await chosen.cdp.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:downloads},5000)}catch{}
  }
  return chosen.cdp;
}
async function launch(dataDir){
  const edge=edgePath();if(!edge)throw new Error('Microsoft Edge was not found.');
  const root=dataDir||path.join(os.homedir(),'.yardmaster');
  const profile=path.join(root,'edge-profile');
  const downloads=path.join(root,'chatgpt-downloads');
  fs.mkdirSync(profile,{recursive:true});fs.mkdirSync(downloads,{recursive:true});

  let targets=await listTargets();
  let cdp=await attachResponsiveChatGPT(targets,downloads);
  if(cdp)return {cdp,downloads};

  if(!targets&&Date.now()-lastEdgeSpawnAt>30000){
    lastEdgeSpawnAt=Date.now();
    spawn(edge,[`--user-data-dir=${profile}`,'--remote-debugging-port=9222','--remote-debugging-address=127.0.0.1','--no-first-run','--disable-features=msEdgeSidebarV2','https://chatgpt.com/'],{detached:true,stdio:'ignore'}).unref();
  }

  const deadline=Date.now()+25000;
  while(Date.now()<deadline){
    targets=await listTargets(2500);
    cdp=await attachResponsiveChatGPT(targets,downloads);
    if(cdp)return {cdp,downloads};
    await delay(500);
  }
  throw new Error('Could not attach to a responsive ChatGPT browser tab without opening duplicate browsers.');
}

async function visibleText(cdp,text){
  return cdp.eval(`(()=>{const q=${safeJson(text)}.toLowerCase();return [...document.querySelectorAll('button,[role="button"],[role="menuitem"],a')].some(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&(e.innerText||e.getAttribute('aria-label')||'').trim().toLowerCase().includes(q)})})()`);
}
async function clickText(cdp,text,exact=false){
  return cdp.eval(`(()=>{const q=${safeJson(text)}.trim().toLowerCase();const els=[...document.querySelectorAll('button,[role="button"],[role="menuitem"],[role="option"],a,div[tabindex]')];const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'};const label=e=>(e.innerText||e.getAttribute('aria-label')||e.getAttribute('title')||'').trim().toLowerCase();const hit=els.find(e=>visible(e)&&(${exact?'label(e)===q':'label(e).includes(q)'}));if(hit){hit.click();return true}return false})()`);
}
async function waitComposer(cdp,timeoutMs=120000){
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    const info=await cdp.eval(`(()=>{const e=document.querySelector('textarea, [contenteditable="true"][data-testid*="composer"], #prompt-textarea, [contenteditable="true"]');if(!e)return null;const r=e.getBoundingClientRect();return r.width>0&&r.height>0?{tag:e.tagName,id:e.id||'',editable:e.getAttribute('contenteditable')}:null})()`);
    if(info)return info;
    await delay(700);
  }
  return null;
}
function controlAliases(kind,value){
  const requested=String(value||'').trim();
  if(kind==='thinking'&&/^instant$/i.test(requested))return ['instant','auto'];
  if(kind==='model'){
    const short=requested.replace(/^GPT[- ]?\d+(?:\.\d+)?\s*/i,'').trim();
    return [...new Set([requested,short].filter(Boolean).map(x=>x.toLowerCase()))];
  }
  return [requested.toLowerCase()];
}
function controlMatches(value,aliases){
  const label=String(value||'').replace(/\s+/g,' ').trim().toLowerCase();
  return aliases.some(alias=>label===alias||label.endsWith(' '+alias)||label.startsWith(alias+' ')||label.includes(' '+alias+' '));
}
async function readConversationControl(cdp,kind,aliases,fingerprint=null){
  return cdp.eval(`/*YM_READ_CONTROL:${kind}*/(()=>{const kind=${safeJson(kind)},aliases=${safeJson(aliases)},wanted=${safeJson(fingerprint)};const composer=document.querySelector('#prompt-textarea,textarea,[contenteditable="true"][data-testid*="composer"],[contenteditable="true"]');if(!composer)return null;const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};const menuish=e=>!!e.closest('[role="menu"],[role="listbox"],[role="dialog"],[data-radix-menu-content],[data-radix-popper-content-wrapper]');const label=e=>(e.innerText||e.getAttribute('aria-label')||e.getAttribute('title')||e.getAttribute('data-testid')||'').replace(/\\s+/g,' ').trim();const all=[...document.querySelectorAll('button,[role="button"],[role="combobox"]')].filter(e=>visible(e)&&!menuish(e));const key=(e,index)=>({id:e.id||'',testid:e.getAttribute('data-testid')||'',aria:e.getAttribute('aria-label')||'',title:e.getAttribute('title')||'',index});const same=(k,w)=>!!w&&((w.id&&k.id===w.id)||(w.testid&&k.testid===w.testid)||(w.aria&&k.aria===w.aria)||(w.title&&k.title===w.title));const score=e=>{const t=label(e).toLowerCase(),meta=((e.getAttribute('data-testid')||'')+' '+(e.getAttribute('aria-label')||'')+' '+(e.getAttribute('title')||'')).toLowerCase();const r=e.getBoundingClientRect(),c=composer.getBoundingClientRect();const form=composer.closest('form');const near=!!form&&form.contains(e)||Math.abs(r.bottom-c.bottom)<170&&r.left<c.right+320&&r.right>c.left-320;const header=r.top<240;let n=0;if(near)n+=5;if(header)n+=2;if(kind==='mode'){if(/mode|work|chat/.test(meta))n+=7;if(/^(work|chat)( mode)?$/.test(t))n+=5}else if(kind==='model'){if(/model|model-switcher|model selector|model picker/.test(meta))n+=10;if(/gpt|sol|terra|luna|astra/.test(t))n+=6}else{if(/thinking|reasoning|effort/.test(meta))n+=10;if(/thinking|reasoning|effort|^(instant|auto|medium|high)$/.test(t))n+=6}if(aliases.some(a=>t===a||t.includes(a)))n+=8;return n};if(wanted){const hit=all.map((e,i)=>({e,k:key(e,i)})).find(x=>same(x.k,wanted));return hit?{label:label(hit.e),fingerprint:hit.k,score:score(hit.e)}:null}const ranked=all.map((e,i)=>({e,k:key(e,i),score:score(e)})).filter(x=>x.score>=8).sort((a,b)=>b.score-a.score);const hit=ranked[0];return hit?{label:label(hit.e),fingerprint:hit.k,score:hit.score}:null})()`,5000).catch(()=>null);
}
async function openConversationControl(cdp,kind,fingerprint){
  return cdp.eval(`/*YM_OPEN_CONTROL:${kind}*/(()=>{const wanted=${safeJson(fingerprint)};const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};const menuish=e=>!!e.closest('[role="menu"],[role="listbox"],[role="dialog"],[data-radix-menu-content],[data-radix-popper-content-wrapper]');const all=[...document.querySelectorAll('button,[role="button"],[role="combobox"]')].filter(e=>visible(e)&&!menuish(e));const hit=all.find(e=>(wanted.id&&e.id===wanted.id)||(wanted.testid&&e.getAttribute('data-testid')===wanted.testid)||(wanted.aria&&e.getAttribute('aria-label')===wanted.aria)||(wanted.title&&e.getAttribute('title')===wanted.title));if(!hit)return false;hit.click();return true})()`,5000).catch(()=>false);
}
async function chooseOpenOption(cdp,kind,aliases){
  return cdp.eval(`/*YM_PICK_OPTION:${kind}*/(()=>{const aliases=${safeJson(aliases)};const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};const label=e=>(e.innerText||e.getAttribute('aria-label')||e.getAttribute('title')||'').replace(/\\s+/g,' ').trim().toLowerCase();const options=[...document.querySelectorAll('[role="menuitem"],[role="option"],[role="menuitemradio"],[role="menuitemcheckbox"],button,[role="button"],li')].filter(e=>visible(e)&&!!e.closest('[role="menu"],[role="listbox"],[role="dialog"],[data-radix-menu-content],[data-radix-popper-content-wrapper]'));const match=e=>aliases.some(a=>{const t=label(e);return t===a||t.startsWith(a+' ')||t.endsWith(' '+a)||t.includes(a)});const hit=options.find(match);if(!hit)return false;hit.click();return true})()`,5000).catch(()=>false);
}
async function verifyOpenSelection(cdp,aliases){
  return cdp.eval(`/*YM_VERIFY_SELECTED_OPTION*/(()=>{const aliases=${safeJson(aliases)};const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};const label=e=>(e.innerText||e.getAttribute('aria-label')||e.getAttribute('title')||'').replace(/\\s+/g,' ').trim().toLowerCase();const selected=[...document.querySelectorAll('[aria-checked="true"],[aria-selected="true"],[data-state="checked"],[data-selected="true"]')].filter(visible);return selected.some(e=>aliases.some(a=>{const t=label(e);return t===a||t.startsWith(a+' ')||t.endsWith(' '+a)||t.includes(a)}))})()`,5000).catch(()=>false);
}
async function closeConversationMenu(cdp){
  await cdp.eval(`/*YM_CLOSE_CONTROL*/(()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));const c=document.querySelector('#prompt-textarea,textarea,[contenteditable="true"][data-testid*="composer"],[contenteditable="true"]');c?.focus();return true})()`,3000).catch(()=>{});
}
async function selectAndVerifyConversationControl(cdp,kind,requested,onStatus){
  if(!requested)return true;
  const aliases=controlAliases(kind,requested),name=kind==='thinking'?'thinking effort':kind;
  onStatus?.(`Selecting ChatGPT ${name}: ${requested}`);
  let control=await readConversationControl(cdp,kind,aliases);
  if(!control){onStatus?.(`ChatGPT ${name} selector was not found in the active conversation.`);return false}
  if(controlMatches(control.label,aliases)){onStatus?.(`Verified ChatGPT ${name}: ${requested}`);return true}
  if(!await openConversationControl(cdp,kind,control.fingerprint)){onStatus?.(`ChatGPT ${name} selector could not be opened.`);return false}
  await delay(500);
  if(await verifyOpenSelection(cdp,aliases)){await closeConversationMenu(cdp);onStatus?.(`Verified ChatGPT ${name}: ${requested}`);return true}
  if(!await chooseOpenOption(cdp,kind,aliases)){await closeConversationMenu(cdp);onStatus?.(`ChatGPT did not expose the requested ${name}: ${requested}`);return false}
  await delay(650);await closeConversationMenu(cdp);await delay(350);
  control=await readConversationControl(cdp,kind,aliases,control.fingerprint)||await readConversationControl(cdp,kind,aliases);
  if(control&&controlMatches(control.label,aliases)){onStatus?.(`Verified ChatGPT ${name}: ${requested}`);return true}
  // Some ChatGPT pickers keep a generic button label after selection. Re-open and verify the checked option.
  const reread=control||await readConversationControl(cdp,kind,aliases);
  if(reread&&await openConversationControl(cdp,kind,reread.fingerprint)){
    await delay(350);
    const selected=await verifyOpenSelection(cdp,aliases);
    await closeConversationMenu(cdp);
    if(selected){onStatus?.(`Verified ChatGPT ${name}: ${requested}`);return true}
  }
  onStatus?.(`Yardmaster could not verify the requested ChatGPT ${name}: ${requested}`);
  return false;
}
async function chooseModeAndModel(cdp,mode,model,onStatus){
  if(!await selectAndVerifyConversationControl(cdp,'mode',mode,onStatus))return false;
  if(!await selectAndVerifyConversationControl(cdp,'model',model,onStatus))return false;
  return true;
}
async function chooseThinkingEffort(cdp,effort,onStatus){return selectAndVerifyConversationControl(cdp,'thinking',effort,onStatus)}
async function attachFile(cdp,filePath,onStatus){
  if(!filePath)return;
  if(!fs.existsSync(filePath))throw new Error('Handoff file does not exist: '+filePath);
  const full=path.resolve(filePath),name=path.basename(full);
  onStatus?.('Uploading Yardmaster handoff to ChatGPT: '+name);

  // A previous preview build could accidentally open the Projects dialog. Close it before touching the composer.
  await cdp.eval(`(()=>{const dialogs=[...document.querySelectorAll('[role="dialog"],dialog')];for(const d of dialogs){const t=(d.innerText||'').toLowerCase();if(!t.includes('create project'))continue;const x=[...d.querySelectorAll('button')].find(b=>/close|cancel/i.test((b.getAttribute('aria-label')||b.getAttribute('title')||b.innerText||'')));if(x){x.click();return true}}return false})()`,5000).catch(()=>false);
  await delay(250);

  async function fileInputs(){
    const doc=await cdp.send('DOM.getDocument',{depth:-1,pierce:true},8000);
    const q=await cdp.send('DOM.querySelectorAll',{nodeId:doc.root.nodeId,selector:'input[type=file]'},8000);
    return [...(q.nodeIds||[])];
  }

  let ids=await fileInputs();
  if(!ids.length){
    const opened=await cdp.eval(`(()=>{const e=document.querySelector('#prompt-textarea, textarea, [contenteditable="true"][data-testid*="composer"], [contenteditable="true"]');if(!e)return false;const form=e.closest('form')||e.parentElement?.parentElement?.parentElement;const root=form||document;const buttons=[...root.querySelectorAll('button,[role="button"]')];const visible=b=>{const r=b.getBoundingClientRect(),s=getComputedStyle(b);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};const label=b=>(b.getAttribute('aria-label')||b.getAttribute('title')||b.innerText||'').trim();const b=buttons.find(x=>visible(x)&&/^(add files and more|attach files?|upload files?|add files?|add photos(?: and files)?)$/i.test(label(x)))||buttons.find(x=>visible(x)&&/(attach|add files and more|upload file)/i.test(label(x)));if(!b)return false;b.click();return true})()`,5000).catch(()=>false);
    if(!opened)throw new Error('ChatGPT composer attachment button was not found.');
    await delay(450);
    ids=await fileInputs();
    if(!ids.length){
      const menuPicked=await cdp.eval(`(()=>{const els=[...document.querySelectorAll('[role="menuitem"],button,[role="button"]')];const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};const label=e=>(e.innerText||e.getAttribute('aria-label')||e.getAttribute('title')||'').trim();const hit=els.find(e=>visible(e)&&/^(upload from computer|upload file|upload files|add files)$/i.test(label(e)));if(hit){hit.click();return true}return false})()`,5000).catch(()=>false);
      if(menuPicked){await delay(400);ids=await fileInputs()}
    }
  }
  if(!ids.length)throw new Error('ChatGPT file upload input was not found in the composer.');

  for(const nodeId of ids.reverse()){
    try{
      await cdp.send('DOM.setFileInputFiles',{nodeId,files:[full]},10000);
      const deadline=Date.now()+15000;
      while(Date.now()<deadline){
        const ok=await cdp.eval(`/*YM_VERIFY_ATTACHMENT*/(()=>{const n=${safeJson(name)};const composer=document.querySelector('#prompt-textarea,textarea,[contenteditable="true"][data-testid*="composer"],[contenteditable="true"]');if(!composer)return false;const scope=composer.closest('form')||composer.parentElement?.parentElement?.parentElement;if(!scope)return false;const input=[...scope.querySelectorAll('input[type=file]')].some(i=>[...(i.files||[])].some(f=>f.name===n));const chip=[...scope.querySelectorAll('[data-testid*="attachment"],[aria-label*="attachment"],button,span')].some(e=>(e.innerText||e.getAttribute('aria-label')||'').includes(n));return input||chip})()`,5000).catch(()=>false);
        if(ok){onStatus?.('Yardmaster handoff attached to ChatGPT: '+name);return}
        await delay(400);
      }
    }catch{}
  }
  throw new Error('ChatGPT did not confirm the Yardmaster ZIP attachment.');
}
async function promptSent(cdp,before,promptMarker,timeoutMs=5000){
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    const confirmed=await cdp.eval(`/*YM_VERIFY_PROMPT_SENT*/(()=>{const marker=${safeJson(promptMarker)};const messages=[...document.querySelectorAll('[data-message-author-role="user"]')];if(messages.length<=${Number(before)||0})return false;const latest=(messages.at(-1)?.innerText||'').replace(/\\s+/g,' ').trim();return !marker||latest.includes(marker)})()`,5000).catch(()=>false);
    if(confirmed)return true;
    await delay(150);
  }
  return false;
}
async function sendPrompt(cdp,prompt,onStatus,options={}){
  const sendTimeoutMs=Number(options.sendTimeoutMs||15000);
  const confirmMs=Number(options.confirmMs||5500);
  onStatus?.('Sending repair instructions to ChatGPT.');

  const before=await cdp.eval(`/*YM_SEND_BASELINE*/document.querySelectorAll('[data-message-author-role="user"]').length`,5000).catch(()=>0);
  const inserted=await cdp.eval(`/*YM_FILL_PROMPT*/(()=>{const q=${safeJson(prompt)};const e=document.querySelector('#prompt-textarea, textarea, [contenteditable="true"][data-testid*="composer"], [contenteditable="true"]');if(!e)return {ok:false,reason:'missing'};e.focus();if(e instanceof HTMLTextAreaElement||e instanceof HTMLInputElement){const proto=e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;if(setter)setter.call(e,q);else e.value=q;e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:q}));e.dispatchEvent(new Event('change',{bubbles:true}))}else{const sel=getSelection(),range=document.createRange();range.selectNodeContents(e);sel.removeAllRanges();sel.addRange(range);let ok=false;try{ok=document.execCommand('insertText',false,q)}catch{}if(!ok){e.replaceChildren();const p=document.createElement('p');p.textContent=q;e.appendChild(p);try{e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:q}))}catch{e.dispatchEvent(new Event('input',{bubbles:true}))}}}const text=(e instanceof HTMLTextAreaElement||e instanceof HTMLInputElement?e.value:(e.innerText||e.textContent||'')).trim();return {ok:text.length>0,length:text.length}})()`,15000);
  if(!inserted?.ok)throw new Error('ChatGPT composer did not accept the Yardmaster prompt.');

  const promptMarker=String(prompt||'').trim().replace(/\s+/g,' ').slice(0,96);
  if(await promptSent(cdp,before,promptMarker,350)){onStatus?.('Repair prompt sent to ChatGPT.');return}

  const deadline=Date.now()+sendTimeoutMs;
  let pointerAttempts=0,enterAttempts=0,syntheticAttempts=0;
  while(Date.now()<deadline){
    const target=await cdp.eval(`/*YM_SEND_TARGET*/(()=>{const e=document.querySelector('#prompt-textarea, textarea, [contenteditable="true"][data-testid*="composer"], [contenteditable="true"]');if(!e)return null;const visible=b=>{const r=b.getBoundingClientRect(),s=getComputedStyle(b);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};const scope=e.closest('form')||e.parentElement?.parentElement?.parentElement||document;const selectors=['button[data-testid="send-button"]','button[data-testid*="send"]','button[data-testid*="submit"]','button[aria-label*="Send"]','button[aria-label*="send"]','button[type="submit"]'];let b=null;for(const s of selectors){b=[...scope.querySelectorAll(s)].find(x=>visible(x));if(b)break}if(!b)return {found:false};const r=b.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,top=document.elementFromPoint(x,y);return {found:true,enabled:!b.disabled&&b.getAttribute('aria-disabled')!=='true',x,y,topIsButton:top===b||b.contains(top),label:(b.getAttribute('aria-label')||b.innerText||'').trim()}})()`,5000).catch(()=>null);
    if(target?.found&&target.enabled&&target.topIsButton){
      pointerAttempts++;
      try{
        await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:target.x,y:target.y,button:'none'},4000);
        await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:target.x,y:target.y,button:'left',buttons:1,clickCount:1},4000);
        await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:target.x,y:target.y,button:'left',buttons:0,clickCount:1},4000);
      }catch{}
      if(await promptSent(cdp,before,promptMarker,confirmMs)){onStatus?.('Repair prompt sent to ChatGPT.');return}
    }

    enterAttempts++;
    await cdp.eval(`/*YM_FOCUS_COMPOSER*/(()=>{const e=document.querySelector('#prompt-textarea, textarea, [contenteditable="true"][data-testid*="composer"], [contenteditable="true"]');e?.focus();return !!e})()`,3000).catch(()=>false);
    try{
      await cdp.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13},4000);
      await cdp.send('Input.dispatchKeyEvent',{type:'char',text:'\r',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13},4000);
      await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13},4000);
    }catch{}
    if(await promptSent(cdp,before,promptMarker,confirmMs)){onStatus?.('Repair prompt sent to ChatGPT.');return}

    syntheticAttempts++;
    await cdp.eval(`/*YM_SYNTHETIC_SEND_FALLBACK*/(()=>{const e=document.querySelector('#prompt-textarea, textarea, [contenteditable="true"][data-testid*="composer"], [contenteditable="true"]');if(!e)return false;const scope=e.closest('form')||e.parentElement?.parentElement?.parentElement||document;const b=[...scope.querySelectorAll('button')].find(x=>x.dataset?.testid==='send-button'||/send/i.test(x.getAttribute('aria-label')||''));if(b&&!b.disabled){b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'mouse',isPrimary:true}));b.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));b.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));b.dispatchEvent(new MouseEvent('click',{bubbles:true}));b.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'mouse',isPrimary:true}));return true}const form=e.closest('form');if(form&&typeof form.requestSubmit==='function'){form.requestSubmit();return true}return false})()`,5000).catch(()=>false);
    if(await promptSent(cdp,before,promptMarker,confirmMs)){onStatus?.('Repair prompt sent to ChatGPT.');return}
    await delay(250);
  }
  throw new Error(`ChatGPT prompt is filled in, but no submitted user message appeared after ${pointerAttempts} trusted pointer attempts, ${enterAttempts} native Enter attempts, and ${syntheticAttempts} fallback attempts.`);
}

async function pageText(cdp){
  return String(await cdp.eval(`document.body?.innerText||''`).catch(()=>'')); 
}
async function usageLimitInfo(cdp){
  const text=String(await pageText(cdp).catch(()=>''));
  const lower=text.toLowerCase();
  const limited=
    /you(?:'ve| have)?\s+(?:reached|hit).{0,80}(?:work|usage|weekly|5-hour|five-hour).{0,80}limit/i.test(text)||
    /(?:work|usage|weekly|5-hour|five-hour).{0,80}limit.{0,80}(?:reached|exhausted|used up|reset)/i.test(text)||
    /no\s+(?:work\s+)?usage\s+(?:remaining|left)/i.test(text)||
    /usage\s+limit\s+(?:reached|exceeded)/i.test(text);
  if(!limited)return {limited:false,detail:null};
  const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const detailLine=lines.find(x=>/(reset|limit|usage|available again|try again)/i.test(x)&&x.length<220)||null;
  return {limited:true,detail:detailLine};
}
async function cancelableDelay(ms,shouldCancel){
  const end=Date.now()+ms;
  while(Date.now()<end){
    if(shouldCancel?.())throw new Error('Yardmaster work was stopped by the user.');
    await delay(Math.min(1000,end-Date.now()));
  }
}
async function waitForUsageAvailability(cdp,context,onStatus,shouldCancel,resumeHandoff=true){
  let info=await usageLimitInfo(cdp);
  if(!info.limited)return false;
  const suffix=info.detail?' '+info.detail:'';
  onStatus?.('ChatGPT Work usage is exhausted. Yardmaster will wait and resume automatically when usage returns.'+suffix);
  saveRecoveryState(context.dataDir,{reason:'work_usage_limit',detail:info.detail,url:await cdp.eval('location.href').catch(()=>null)});
  while(info.limited){
    await cancelableDelay(2*60*1000,shouldCancel);
    onStatus?.('Checking whether ChatGPT Work usage is available again...');
    await cdp.send('Page.reload',{ignoreCache:true}).catch(()=>{});
    await waitComposer(cdp,60000);
    info=await usageLimitInfo(cdp);
    if(info.limited&&info.detail)onStatus?.('ChatGPT Work is still limited. '+info.detail);
  }
  onStatus?.('ChatGPT Work usage is available again.'+(resumeHandoff?' Resuming the Yardmaster handoff.':''));
  if(!resumeHandoff)return true;
  await cdp.send('Page.navigate',{url:'https://chatgpt.com/'}).catch(()=>{});
  await waitComposer(cdp,60000);
  const modelOk=await chooseModeAndModel(cdp,context.mode,context.model,onStatus);
  if(modelOk===false)throw new Error('Yardmaster could not verify the requested ChatGPT model after usage reset: '+context.model);
  const effortOk=await chooseThinkingEffort(cdp,context.thinkingEffort,onStatus);
  if(effortOk===false)throw new Error('Yardmaster could not verify the requested ChatGPT thinking effort after usage reset: '+context.thinkingEffort);
  if(context.artifactPath)await attachFile(cdp,context.artifactPath,onStatus);
  await sendPrompt(cdp,context.prompt,onStatus);
  return true;
}
async function chatCondition(cdp){
  const t=(await pageText(cdp)).toLowerCase();
  if(/conversation (is )?too long|maximum (conversation|context) length|start a new chat/.test(t))return 'too_long';
  if(/something went wrong|error generating|network error|timed out|try again|failed to respond/.test(t))return 'error';
  return null;
}
async function refreshChat(cdp,onStatus){
  onStatus?.('Refreshing ChatGPT after a browser/response error.');
  await cdp.send('Page.reload',{ignoreCache:true}).catch(()=>{});
  await waitComposer(cdp,60000);
  await delay(1200);
}
function saveRecoveryState(dataDir,detail){
  try{
    const dir=path.join(dataDir||os.homedir(),'chat-handoff');fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,'recovery.json'),JSON.stringify({...detail,at:new Date().toISOString()},null,2),'utf8');
  }catch{}
}
async function startFreshChat(cdp,mode,model,thinkingEffort,artifactPath,prompt,onStatus,dataDir){
  onStatus?.('Chat is too long. Saving continuation state and starting a fresh ChatGPT conversation.');
  const oldUrl=await cdp.eval('location.href').catch(()=>null);
  const dir=path.join(dataDir||os.homedir(),'chat-handoff');fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'continuation.txt'),'YARDMASTER CHAT CONTINUATION\n\nPrevious chat: '+String(oldUrl||'unknown')+'\n\n'+prompt,'utf8');
  fs.writeFileSync(path.join(dir,'continuation.json'),JSON.stringify({oldUrl,mode,model,artifactPath,createdAt:new Date().toISOString()},null,2),'utf8');
  await cdp.send('Page.navigate',{url:'https://chatgpt.com/'}).catch(()=>{});
  await waitComposer(cdp,60000);
  const modelOk=await chooseModeAndModel(cdp,mode,model,onStatus);
  if(modelOk===false)throw new Error('Yardmaster could not verify the requested ChatGPT model: '+model);
  const effortOk=await chooseThinkingEffort(cdp,thinkingEffort,onStatus);
  if(effortOk===false)throw new Error('Yardmaster could not verify the requested ChatGPT thinking effort: '+thinkingEffort);
  if(artifactPath)await attachFile(cdp,artifactPath,onStatus);
  await sendPrompt(cdp,'Continue this Yardmaster repair in this new chat. Use the attached handoff and finish the requested repair. Return ONE COMPLETE APPLICATION ZIP when finished.\n\n'+prompt,onStatus);
}
function snapshot(dir){try{return new Set(fs.readdirSync(dir).map(n=>path.join(dir,n)))}catch{return new Set()}}
async function clickLatestDownload(cdp){
  return cdp.eval(`(()=>{const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};const els=[...document.querySelectorAll('a,button,[role="button"]')].filter(visible);const zip=[...els].reverse().find(e=>/\.zip\b|download/i.test((e.innerText||e.getAttribute('aria-label')||e.getAttribute('download')||e.getAttribute('href')||'')));if(zip){zip.click();return true}return false})()`);
}
async function waitRepair(cdp,downloads,before,onStatus,shouldCancel=()=>false,assistantBefore=0,context={},timeoutMs=2*60*60*1000){
  let deadline=Date.now()+timeoutMs;const started=Date.now();let lastClick=0,lastStatus=0,lastProgress=Date.now(),lastAssistant=assistantBefore,recoveries=0,sawResponse=false,finishFirstPending=false;
  while(Date.now()<deadline){
    if(shouldCancel())throw new Error('Yardmaster work was stopped by the user.');
    const files=fs.readdirSync(downloads).map(n=>path.join(downloads,n));
    const fresh=files.filter(p=>!before.has(p)&&/\.zip$/i.test(p)&&!p.endsWith('.crdownload')&&!p.endsWith('.tmp')).sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs);
    if(fresh[0]&&Date.now()-fs.statSync(fresh[0]).mtimeMs>800)return fresh[0];

    const generating=await visibleText(cdp,'Stop generating').catch(()=>false);
    const assistantNow=await cdp.eval(`document.querySelectorAll('[data-message-author-role="assistant"]').length`).catch(()=>lastAssistant);
    if(assistantNow>lastAssistant){lastAssistant=assistantNow;lastProgress=Date.now();sawResponse=true}
    if(!sawResponse&&Date.now()-started>20000)sawResponse=true;

    const usage=await usageLimitInfo(cdp).catch(()=>({limited:false}));
    if(usage.limited){
      await waitForUsageAvailability(cdp,context,onStatus,shouldCancel,true);
      deadline=Date.now()+timeoutMs;lastProgress=Date.now();lastAssistant=0;sawResponse=false;finishFirstPending=false;
      continue;
    }

    const condition=await chatCondition(cdp).catch(()=>null);
    if(condition==='too_long'&&recoveries<4){
      recoveries++;lastProgress=Date.now();lastAssistant=0;sawResponse=false;
      await startFreshChat(cdp,context.mode,context.model,context.thinkingEffort,context.artifactPath,context.prompt,onStatus,context.dataDir);
      continue;
    }
    if(condition==='error'&&recoveries<8){
      recoveries++;lastProgress=Date.now();
      if(!finishFirstPending){
        finishFirstPending=true;
        onStatus?.('ChatGPT response error detected. Sending exactly "finish please" before refreshing.');
        saveRecoveryState(context.dataDir,{reason:'chat_error',step:'finish_please',url:await cdp.eval('location.href').catch(()=>null)});
        await sendPrompt(cdp,'finish please',onStatus);
      }else{
        finishFirstPending=false;
        saveRecoveryState(context.dataDir,{reason:'chat_error',step:'refresh',url:await cdp.eval('location.href').catch(()=>null)});
        await refreshChat(cdp,onStatus);
        await sendPrompt(cdp,'finish please',onStatus);
      }
      continue;
    }
    if(Date.now()-lastProgress>5*60*1000&&recoveries<8){
      recoveries++;lastProgress=Date.now();
      if(!finishFirstPending){
        finishFirstPending=true;
        onStatus?.('ChatGPT appears stalled. Sending exactly "finish please" before refreshing.');
        saveRecoveryState(context.dataDir,{reason:'stall',step:'finish_please',url:await cdp.eval('location.href').catch(()=>null)});
        await sendPrompt(cdp,'finish please',onStatus);
      }else{
        finishFirstPending=false;
        saveRecoveryState(context.dataDir,{reason:'stall',step:'refresh',url:await cdp.eval('location.href').catch(()=>null)});
        await refreshChat(cdp,onStatus);
        await sendPrompt(cdp,'finish please',onStatus);
      }
      continue;
    }

    if(sawResponse&&!generating&&Date.now()-lastClick>5000){await clickLatestDownload(cdp).catch(()=>false);lastClick=Date.now()}
    if(Date.now()-lastStatus>15000){onStatus?.(generating?'ChatGPT is working on the repair.':'Waiting for ChatGPT repair download.');lastStatus=Date.now()}
    await delay(1200);
  }
  throw new Error('Timed out waiting for a repaired ZIP from ChatGPT.');
}

export async function openChatGPT({mode='Work',model='GPT-5.6 Sol',thinkingEffort='High',prompt='',artifactPath=null,dataDir}){
  const {cdp,downloads}=await launch(dataDir);
  try{
    const composer=await waitComposer(cdp,25000);
    return {state:composer?'ready':'login_required',mode,model,thinkingEffort,promptPrepared:!!prompt,artifactPath,downloads};
  }finally{cdp.close()}
}

export async function submitRepairToChatGPT({mode='Work',model='GPT-5.6 Sol',thinkingEffort='High',prompt,artifactPath,dataDir,onStatus=()=>{},shouldCancel=()=>false}){
  const {cdp,downloads}=await launch(dataDir);
  try{
    const composer=await waitComposer(cdp,120000);
    if(!composer)return {state:'login_required',message:'Sign in to ChatGPT in the Yardmaster Edge window, then resume the handoff.'};
    let modelOk=await chooseModeAndModel(cdp,mode,model,onStatus);
    if(modelOk===false){
      const limited=await usageLimitInfo(cdp).catch(()=>({limited:false}));
      if(limited.limited){
        await waitForUsageAvailability(cdp,{mode,model,thinkingEffort,artifactPath,prompt,dataDir},onStatus,shouldCancel,false);
        modelOk=await chooseModeAndModel(cdp,mode,model,onStatus);
      }
    }
    if(modelOk===false)throw new Error('Yardmaster could not verify the requested ChatGPT model: '+model);
    const effortOk=await chooseThinkingEffort(cdp,thinkingEffort,onStatus);
    if(effortOk===false)throw new Error('Yardmaster could not verify the requested ChatGPT thinking effort: '+thinkingEffort);
    const before=snapshot(downloads);
    await attachFile(cdp,artifactPath,onStatus);
    const assistantBefore=await cdp.eval(`document.querySelectorAll('[data-message-author-role="assistant"]').length`).catch(()=>0);
    await sendPrompt(cdp,prompt,onStatus);
    const repairPath=await waitRepair(cdp,downloads,before,onStatus,shouldCancel,assistantBefore,{mode,model,thinkingEffort,artifactPath,prompt,dataDir});
    return {state:'downloaded',repairPath};
  }finally{cdp.close()}
}


export function startCommandBridge({dataDir,onProtocol=async()=>{},onStatus=()=>{}}){
  let stopped=false,lastText='',activeCdp=null,reconnects=0;
  const done=(async()=>{
    while(!stopped){
      let cdp=null;
      try{
        const launched=await launch(dataDir);cdp=launched.cdp;activeCdp=cdp;
        const composer=await waitComposer(cdp,120000);
        if(!composer){
          onStatus('Sign in to ChatGPT to enable the Yardmaster command bridge.');
          cdp.close();activeCdp=null;
          await delay(5000);
          continue;
        }
        reconnects=0;
        onStatus('Yardmaster command bridge is watching this ChatGPT window.');
        while(!stopped){
          const latest=String(await cdp.eval(`(()=>{const m=[...document.querySelectorAll('[data-message-author-role="assistant"]')].at(-1);return m?.innerText||''})()`,10000));
          if(latest&&latest!==lastText&&/\bYARDMASTER\b/i.test(latest)&&/\bEND\b/i.test(latest)){
            lastText=latest;
            try{await onProtocol(latest)}catch(e){onStatus('Yardmaster command failed: '+(e.message||e))}
          }
          await delay(1200);
        }
      }catch(e){
        if(stopped)break;
        reconnects++;
        const wait=Math.min(10000,1000*Math.max(1,reconnects));
        onStatus('Yardmaster command bridge reconnecting after browser timeout: '+(e.message||e));
        await delay(wait);
      }finally{
        try{cdp?.close()}catch{}
        if(activeCdp===cdp)activeCdp=null;
      }
    }
    if(stopped)onStatus('Yardmaster command bridge stopped.');
  })().catch(e=>onStatus('Yardmaster command bridge stopped: '+(e.message||e)));
  return {stop(){stopped=true;try{activeCdp?.close()}catch{}},done};
}

export const __testHooks={
  selectAndVerifyConversationControl,
  chooseModeAndModel,
  chooseThinkingEffort,
  attachFile,
  sendPrompt,
  usageLimitInfo
};
