import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import dockBridge from './chatgpt-dock-bridge.cjs';
import {createHandoffDiagnostics} from './handoff-diagnostics.mjs';
import {createChatExchangeBudget,continuationPrompt} from './chat-exchanges.mjs';
import {chatGPTRequiredAction,attentionMessage} from './chatgpt-attention.mjs';

const delay=ms=>new Promise(r=>setTimeout(r,ms));
const lastEdgeSpawnAtByPort=new Map();

// The page can retain a hidden/pending home textarea beside its real composer.
// Prefer the visible, usable prompt field consistently for readiness and input.
const composerExpression=`(()=>{const visible=e=>{const r=e.getBoundingClientRect(),st=getComputedStyle(e);return r.width>0&&r.height>0&&st.display!=='none'&&st.visibility!=='hidden'&&!e.disabled&&!e.readOnly&&e.id!=='pending-home-input'&&!e.closest('[inert]')};const selectors=['#prompt-textarea','[contenteditable="true"][data-testid*="composer"]','textarea','[contenteditable="true"]'];for(const selector of selectors){const hit=[...document.querySelectorAll(selector)].find(visible);if(hit)return hit}return null})()`;

async function composerUnavailableResult(cdp,{docked=false,purpose='automation'}={}){
  const session=docked?'the docked ChatGPT window':purpose==='manual'?'the manual Yardmaster Edge window':'the automation Yardmaster Edge profile';
  const probe=await cdp.eval(`/*YM_CHATGPT_LOGIN_STATE*/(()=>{const visible=e=>{const r=e.getBoundingClientRect(),st=getComputedStyle(e);return r.width>0&&r.height>0&&st.display!=='none'&&st.visibility!=='hidden'};const controls=[...document.querySelectorAll('button,a,[role="button"]')].filter(e=>visible(e)&&!e.closest('[data-message-author-role]'));const login=controls.some(e=>/^(log in|login|sign in)(?: to chatgpt)?$/i.test((e.innerText||e.getAttribute('aria-label')||'').trim()));const pathname=location.pathname.toLowerCase();const authRoute=['/auth/login','/auth/signin','/login','/signin'].some(route=>pathname===route||pathname.startsWith(route+'/'));return {loginRequired:login||authRoute,href:location.href,readyState:document.readyState}})()`,5000).catch(()=>null);
  if(probe?.loginRequired)return {state:'login_required',message:'Sign in to ChatGPT in '+session+', then choose Resume Handoff.',session};
  const error=new Error('ChatGPT composer is unavailable in '+session+'. Reload that ChatGPT window, then choose Resume Handoff. The existing handoff ZIP is preserved.');
  error.code='CHATGPT_COMPOSER_UNAVAILABLE';error.chatGPTSession=session;throw error;
}


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
  constructor(url){this.url=url;this.ws=null;this.id=0;this.pending=new Map();this.eventWaiters=new Map()}
  rejectPending(error){
    for(const {reject,timer} of this.pending.values()){clearTimeout(timer);reject(error)}
    this.pending.clear();
    for(const waiters of this.eventWaiters.values())for(const waiter of waiters){clearTimeout(waiter.timer);waiter.reject(error)}
    this.eventWaiters.clear();
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
      if(!m.id){
        const waiters=this.eventWaiters.get(m.method);
        if(waiters?.length){
          const waiter=waiters.shift();clearTimeout(waiter.timer);waiter.resolve(m.params||{});
          if(!waiters.length)this.eventWaiters.delete(m.method);
        }
        return;
      }
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
  waitEvent(method,timeoutMs=5000){
    return new Promise((resolve,reject)=>{
      const waiter={resolve,reject,timer:null};
      waiter.timer=setTimeout(()=>{const list=this.eventWaiters.get(method)||[];const i=list.indexOf(waiter);if(i>=0)list.splice(i,1);if(!list.length)this.eventWaiters.delete(method);reject(new Error('CDP event timed out: '+method))},timeoutMs);
      const list=this.eventWaiters.get(method)||[];list.push(waiter);this.eventWaiters.set(method,list);
    });
  }
  close(){this.rejectPending(new Error('Edge DevTools connection closed.'));try{this.ws?.close()}catch{}this.ws=null}
}

function safeJson(v){return JSON.stringify(v).replace(/</g,'\\u003c')}
async function listTargets(port=9222,timeoutMs=1800){
  try{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    const r=await fetch('http://127.0.0.1:'+port+'/json/list',{signal:controller.signal});
    clearTimeout(timer);
    if(r.ok)return await r.json();
  }catch{}
  return null;
}
async function attachResponsiveChatGPT(targets,downloads,{createCdp=url=>new Cdp(url)}={}){
  const chatGPTUrl=url=>{try{const u=new URL(url);return u.protocol==='https:'&&['chatgpt.com','www.chatgpt.com'].includes(u.hostname)}catch{return false}};
  const pages=(targets||[]).filter(t=>['page','other','webview'].includes(t.type)&&t.webSocketDebuggerUrl&&chatGPTUrl(t.url));
  const candidates=[];
  for(const target of pages){
    const cdp=createCdp(target.webSocketDebuggerUrl);
    try{
      await cdp.connect();
      const probe=await cdp.eval(`(()=>{let marked=false;try{marked=sessionStorage.getItem('yardmaster-controlled')==='1'}catch{}return {href:location.href,ready:document.readyState,title:document.title,marked}})()`,5000);
      if(chatGPTUrl(probe?.href))candidates.push({target,probe,cdp});else cdp.close();
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
function browserSpec(dataDir,purpose='automation'){
  const root=dataDir||path.join(os.homedir(),'.yardmaster');
  const manual=purpose==='manual';
  return {
    purpose,
    port:manual?9223:9222,
    profile:path.join(root,manual?'manual-edge-profile':'edge-profile'),
    downloads:path.join(root,manual?'manual-chatgpt-downloads':'chatgpt-downloads')
  };
}
async function launch(dataDir,{purpose='automation',onStatus=()=>{}}={}){
  const spec=browserSpec(dataDir,purpose);
  fs.mkdirSync(spec.profile,{recursive:true});fs.mkdirSync(spec.downloads,{recursive:true});

  // Desktop knows the exact persistent WebContents; avoid public target discovery.
  if(process.env.YARDMASTER_CHATGPT_DOCK_BRIDGE==='1'){
    onStatus('Connecting directly to Yardmaster’s docked ChatGPT window…');
    const deadline=Date.now()+25000;let lastError;
    while(Date.now()<deadline){
      const cdp=new dockBridge.DockCdp();cdp.downloads=spec.downloads;
      try{
        await cdp.connect();
        await cdp.eval('({href:location.href,ready:document.readyState})',5000);
        onStatus('Connected to the docked ChatGPT window.');
        return {cdp,downloads:spec.downloads,purpose:'docked-'+purpose,port:null,profile:'persist:yardmaster-chatgpt-dock',docked:true};
      }catch(error){lastError=error;cdp.close();await delay(500)}
    }
    const error=new Error('Yardmaster could not connect directly to its docked ChatGPT window. Restart the Yardmaster desktop app, then choose Resume Handoff. The existing handoff ZIP is preserved. Connection detail: '+String(lastError?.message||'Desktop IPC unavailable.'));
    error.code='CHATGPT_DOCK_UNAVAILABLE';error.chatGPTSession='the docked ChatGPT window';throw error;
  }

  // Prefer the Electron WebContentsView dock. It exposes localhost DevTools only,
  // so automated ChatGPT work stays inside Yardmaster instead of opening desktop windows.
  const dockPort=Number(process.env.YARDMASTER_CHATGPT_DOCK_PORT||9224);
  let dockTargets=await listTargets(dockPort,1000);
  let dockCdp=await attachResponsiveChatGPT(dockTargets,spec.downloads);
  if(dockCdp)return {cdp:dockCdp,downloads:spec.downloads,purpose:'docked-'+purpose,port:dockPort,profile:'persist:yardmaster-chatgpt-dock',docked:true};

  // Electron owns the signed-in dock. A transient loading/DevTools failure must
  // not move a desktop handoff into an unrelated headless Edge session.
  if(purpose!=='manual'&&process.env.YARDMASTER_CHATGPT_DOCK_REQUIRED==='1'){
    onStatus('Reconnecting to the docked ChatGPT window…');
    const deadline=Date.now()+25000;
    while(Date.now()<deadline){
      await delay(500);
      dockTargets=await listTargets(dockPort,1200);
      dockCdp=await attachResponsiveChatGPT(dockTargets,spec.downloads);
      if(dockCdp){onStatus('Connected to the docked ChatGPT window.');return {cdp:dockCdp,downloads:spec.downloads,purpose:'docked-'+purpose,port:dockPort,profile:'persist:yardmaster-chatgpt-dock',docked:true}}
    }
    const error=new Error('Yardmaster could not reconnect to its docked ChatGPT window. Open Yardmaster’s ChatGPT tab, choose Reload, then Resume Handoff. The existing handoff ZIP is preserved.');
    error.code='CHATGPT_DOCK_UNAVAILABLE';error.chatGPTSession='the docked ChatGPT window';throw error;
  }

  const edge=edgePath();if(!edge)throw new Error('The Yardmaster ChatGPT dock is unavailable and Microsoft Edge was not found for fallback.');
  let targets=await listTargets(spec.port);
  let cdp=await attachResponsiveChatGPT(targets,spec.downloads);
  if(cdp)return {cdp,downloads:spec.downloads,purpose:spec.purpose,port:spec.port,profile:spec.profile,docked:false};

  const last=Number(lastEdgeSpawnAtByPort.get(spec.port)||0);
  if(!targets&&Date.now()-last>30000){
    lastEdgeSpawnAtByPort.set(spec.port,Date.now());
    const fallbackArgs=[`--user-data-dir=${spec.profile}`,`--remote-debugging-port=${spec.port}`,'--remote-debugging-address=127.0.0.1','--no-first-run','--disable-features=msEdgeSidebarV2'];
    if(purpose!=='manual')fallbackArgs.push('--headless=new','--disable-gpu');
    fallbackArgs.push('https://chatgpt.com/');
    spawn(edge,fallbackArgs,{detached:true,stdio:'ignore',windowsHide:purpose!=='manual'}).unref();
  }

  const deadline=Date.now()+25000;
  while(Date.now()<deadline){
    dockTargets=await listTargets(dockPort,1200);
    dockCdp=await attachResponsiveChatGPT(dockTargets,spec.downloads);
    if(dockCdp)return {cdp:dockCdp,downloads:spec.downloads,purpose:'docked-'+purpose,port:dockPort,profile:'persist:yardmaster-chatgpt-dock',docked:true};
    targets=await listTargets(spec.port,2500);
    cdp=await attachResponsiveChatGPT(targets,spec.downloads);
    if(cdp)return {cdp,downloads:spec.downloads,purpose:spec.purpose,port:spec.port,profile:spec.profile,docked:false};
    await delay(500);
  }
  throw new Error('Could not attach to the Yardmaster ChatGPT dock or fallback browser profile.');
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
    const info=await cdp.eval(`(()=>{const e=${composerExpression};if(!e)return null;const r=e.getBoundingClientRect();return r.width>0&&r.height>0?{tag:e.tagName,id:e.id||'',editable:e.getAttribute('contenteditable')}:null})()`);
    if(info)return info;
    await delay(700);
  }
  return null;
}
async function waitHandoffComposerReady(cdp,timeoutMs=120000){
  const deadline=Date.now()+timeoutMs;let stable=0,lastSignature='';
  while(Date.now()<deadline){
    const info=await cdp.eval(`/*YM_WAIT_HANDOFF_COMPOSER_READY*/(()=>{const e=${composerExpression};if(!e)return null;const r=e.getBoundingClientRect(),style=getComputedStyle(e);if(!(r.width>0&&r.height>0)||style.display==='none'||style.visibility==='hidden')return null;const scope=e.closest('form')||e.closest('[data-testid*="composer"]')||e.parentElement?.parentElement?.parentElement||document;const visible=x=>{const q=x.getBoundingClientRect(),st=getComputedStyle(x);return q.width>0&&q.height>0&&st.display!=='none'&&st.visibility!=='hidden'};const buttons=[...scope.querySelectorAll('button,[role="button"]')].filter(visible);return {tag:e.tagName,id:e.id||'',editable:e.getAttribute('contenteditable'),readyState:document.readyState,buttonCount:buttons.length,fileInputCount:scope.querySelectorAll('input[type=file]').length,pending:(e.id||'')==='pending-home-input'}})()`,5000).catch(()=>null);
    const ready=!!info&&!info.pending&&info.readyState==='complete'&&Number(info.buttonCount||0)>0;
    if(ready){
      const signature=JSON.stringify([info.tag,info.id,info.editable,info.buttonCount,info.fileInputCount]);
      stable=signature===lastSignature?stable+1:1;lastSignature=signature;
      if(stable>=2)return info;
    }else{stable=0;lastSignature=''}
    await delay(350);
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
  return cdp.eval(`/*YM_READ_CONTROL:${kind}*/(()=>{const kind=${safeJson(kind)},aliases=${safeJson(aliases)},wanted=${safeJson(fingerprint)};const composer=${composerExpression};if(!composer)return null;const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};const menuish=e=>!!e.closest('[role="menu"],[role="listbox"],[role="dialog"],[data-radix-menu-content],[data-radix-popper-content-wrapper]');const label=e=>(e.innerText||e.getAttribute('aria-label')||e.getAttribute('title')||e.getAttribute('data-testid')||'').replace(/\\s+/g,' ').trim();const all=[...document.querySelectorAll('button,[role="button"],[role="combobox"]')].filter(e=>visible(e)&&!menuish(e));const key=(e,index)=>({id:e.id||'',testid:e.getAttribute('data-testid')||'',aria:e.getAttribute('aria-label')||'',title:e.getAttribute('title')||'',index});const same=(k,w)=>!!w&&((w.id&&k.id===w.id)||(w.testid&&k.testid===w.testid)||(w.aria&&k.aria===w.aria)||(w.title&&k.title===w.title));const score=e=>{const t=label(e).toLowerCase(),meta=((e.getAttribute('data-testid')||'')+' '+(e.getAttribute('aria-label')||'')+' '+(e.getAttribute('title')||'')).toLowerCase();const r=e.getBoundingClientRect(),c=composer.getBoundingClientRect();const form=composer.closest('form');const near=!!form&&form.contains(e)||Math.abs(r.bottom-c.bottom)<170&&r.left<c.right+320&&r.right>c.left-320;const header=r.top<240;let n=0;if(near)n+=5;if(header)n+=2;if(kind==='mode'){if(/mode|work|chat/.test(meta))n+=7;if(/^(work|chat)( mode)?$/.test(t))n+=5}else if(kind==='model'){if(/model|model-switcher|model selector|model picker/.test(meta))n+=10;if(/gpt|sol|terra|luna|astra/.test(t))n+=6}else{if(/thinking|reasoning|effort/.test(meta))n+=10;if(/thinking|reasoning|effort|^(instant|auto|medium|high)$/.test(t))n+=6}if(aliases.some(a=>t===a||t.startsWith(a+' ')||t.endsWith(' '+a)||t.includes(' '+a+' ')))n+=8;if(kind==='mode'&&aliases.includes(t))n+=20;return n};if(wanted){const hit=all.map((e,i)=>({e,k:key(e,i)})).find(x=>same(x.k,wanted));return hit?{label:label(hit.e),fingerprint:hit.k,score:score(hit.e)}:null}const ranked=all.map((e,i)=>({e,k:key(e,i),score:score(e)})).filter(x=>x.score>=8).sort((a,b)=>b.score-a.score);const hit=ranked[0];return hit?{label:label(hit.e),fingerprint:hit.k,score:hit.score}:null})()`,5000).catch(()=>null);
}
async function openConversationControl(cdp,kind,fingerprint){
  const target=await cdp.eval(`/*YM_OPEN_CONTROL:${kind}*/(()=>{const wanted=${safeJson(fingerprint)};const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};const menuish=e=>!!e.closest('[role="menu"],[role="listbox"],[role="dialog"],[data-radix-menu-content],[data-radix-popper-content-wrapper]');const all=[...document.querySelectorAll('button,[role="button"],[role="combobox"]')].filter(e=>visible(e)&&!menuish(e));const hit=all.find(e=>(wanted.id&&e.id===wanted.id)||(wanted.testid&&e.getAttribute('data-testid')===wanted.testid)||(wanted.aria&&e.getAttribute('aria-label')===wanted.aria)||(wanted.title&&e.getAttribute('title')===wanted.title));if(!hit)return false;const r=hit.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`,5000).catch(()=>false);
  if(target===true)return true;
  if(!target?.x||!target?.y)return false;
  return trustedPointerClick(cdp,target).catch(()=>false);
}
async function chooseOpenOption(cdp,kind,aliases){
  const target=await cdp.eval(`/*YM_PICK_OPTION:${kind}*/(()=>{const aliases=${safeJson(aliases)};const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};const label=e=>(e.innerText||e.getAttribute('aria-label')||e.getAttribute('title')||'').replace(/\\s+/g,' ').trim().toLowerCase();const options=[...document.querySelectorAll('[role="menuitem"],[role="option"],[role="menuitemradio"],[role="menuitemcheckbox"],button,[role="button"],li')].filter(e=>visible(e)&&!!e.closest('[role="menu"],[role="listbox"],[role="dialog"],[data-radix-menu-content],[data-radix-popper-content-wrapper]'));const match=e=>aliases.some(a=>{const t=label(e);return t===a||t.startsWith(a+' ')||t.endsWith(' '+a)||t.includes(a)});const hit=options.find(match);if(!hit)return false;const r=hit.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,label:label(hit)}})()`,5000).catch(()=>false);
  if(target===true)return true;
  if(!target?.x||!target?.y)return false;
  return trustedPointerClick(cdp,target).catch(()=>false);
}
async function verifyOpenSelection(cdp,aliases){
  return cdp.eval(`/*YM_VERIFY_SELECTED_OPTION*/(()=>{const aliases=${safeJson(aliases)};const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};const label=e=>(e.innerText||e.getAttribute('aria-label')||e.getAttribute('title')||'').replace(/\\s+/g,' ').trim().toLowerCase();const selected=[...document.querySelectorAll('[aria-checked="true"],[aria-selected="true"],[data-state="checked"],[data-selected="true"]')].filter(visible);return selected.some(e=>aliases.some(a=>{const t=label(e);return t===a||t.startsWith(a+' ')||t.endsWith(' '+a)||t.includes(a)}))})()`,5000).catch(()=>false);
}
async function closeConversationMenu(cdp){
  await cdp.eval(`/*YM_CLOSE_CONTROL*/(()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));const c=${composerExpression};c?.focus();return true})()`,3000).catch(()=>{});
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
function chatModelUsesThinkingControl(mode,model){
  return /^chat$/i.test(String(mode||'').trim())&&/^gpt[- ]?5\.6\s+sol$/i.test(String(model||'').trim());
}
async function chooseModeAndModel(cdp,mode,model,onStatus){
  if(!await selectAndVerifyConversationControl(cdp,'mode',mode,onStatus))return false;
  // Current ChatGPT Chat UI does not expose GPT-5.6 Sol as a separate model
  // button on eligible paid plans. Sol is selected through the reasoning level
  // (Instant/Medium/High/Extra High). Work still exposes explicit model choices.
  if(chatModelUsesThinkingControl(mode,model)){
    onStatus?.('Chat mode uses GPT-5.6 Sol through the thinking/reasoning control.');
    return true;
  }
  if(!await selectAndVerifyConversationControl(cdp,'model',model,onStatus))return false;
  return true;
}
async function chooseThinkingEffort(cdp,effort,onStatus){return selectAndVerifyConversationControl(cdp,'thinking',effort,onStatus)}
async function trustedPointerClick(cdp,point){
  if(!point?.x||!point?.y)return false;
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x,y:point.y,button:'none'},4000);
  await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',buttons:1,clickCount:1},4000);
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x,y:point.y,button:'left',buttons:0,clickCount:1},4000);
  return true;
}
async function attachmentEvidence(cdp,name){
  const stem=String(name||'').replace(/\.zip$/i,'');
  return cdp.eval(`/*YM_VERIFY_ATTACHMENT*/(()=>{const n=${safeJson(name)},stem=${safeJson(stem)};const composer=${composerExpression};if(!composer)return {ok:false,reason:'composer-missing',selected:false,visibleHit:false,busy:false,failed:false,attachmentCount:0,selectedFiles:[]};const visible=e=>{if(!e)return false;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};const label=e=>(e.innerText||e.textContent||e.getAttribute?.('aria-label')||e.getAttribute?.('title')||e.getAttribute?.('alt')||e.getAttribute?.('data-testid')||'').replace(/\\s+/g,' ').trim();const scope=composer.closest('form')||composer.closest('[data-testid*="composer"]')||composer.parentElement?.parentElement?.parentElement||document;const selectedFiles=[...scope.querySelectorAll('input[type="file"]')].flatMap(input=>[...(input.files||[])].map(file=>file?.name||'')).filter(Boolean);const selected=selectedFiles.some(file=>file===n||(stem.length>8&&file.includes(stem)));const attachmentLike=[...scope.querySelectorAll('[data-testid*="attachment"],[data-testid*="file"],[aria-label*="attachment" i],[aria-label*="file" i]')].filter(visible).filter(e=>{const t=label(e),lower=t.toLowerCase();return !!t&&(t.includes(n)||(stem.length>8&&t.includes(stem))||['.zip','.json','.txt','.log','.png','.jpg','.jpeg','.pdf','.csv','.doc','.docx','.xls','.xlsx'].some(ext=>lower.includes(ext)))});const candidates=[...scope.querySelectorAll('[data-testid*="attachment"],[data-testid*="file"],[aria-label],[title],[alt],button,span,div')].filter(visible);const hit=candidates.find(e=>{const t=label(e);return t.includes(n)||(stem.length>8&&t.includes(stem))});const busy=[...scope.querySelectorAll('[role="progressbar"],[aria-busy="true"],[data-state="loading"],[data-state="uploading"],[data-testid*="progress"],[data-testid*="upload"]')].some(e=>visible(e)&&(/progress|upload|loading/i.test(label(e))||e.getAttribute('aria-busy')==='true'||/loading|uploading/i.test(e.getAttribute('data-state')||'')));const errors=[...scope.querySelectorAll('[role="alert"],[data-testid*="error"],[aria-live="assertive"]')].filter(visible).map(label).join(' ');const failed=/failed to upload|upload failed|could(?:n|'|’)t upload|unsupported file|file too large/i.test(errors);return {ok:!!hit&&!busy&&!failed,visibleHit:!!hit,selected,busy,failed,attachmentCount:attachmentLike.length,selectedFiles:selectedFiles.slice(0,8),errors:errors.slice(0,300)}})()`,5000).catch(()=>({ok:false,selected:false,visibleHit:false,busy:false,failed:false,attachmentCount:0,selectedFiles:[]}));
}
async function clearComposerAttachments(cdp,onStatus,diagnostics=null){
  let removed=0,inputCleared=0;
  for(let attempt=0;attempt<12;attempt++){
    const point=await cdp.eval(`/*YM_REMOVE_STALE_ATTACHMENT*/(()=>{const composer=${composerExpression};if(!composer)return null;const scope=composer.closest('form')||composer.closest('[data-testid*="composer"]')||composer.parentElement?.parentElement?.parentElement||document;const visible=e=>{if(!e)return false;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};const label=e=>(e.getAttribute?.('aria-label')||e.getAttribute?.('title')||e.innerText||'').replace(/\\s+/g,' ').trim();const direct=[...scope.querySelectorAll('button,[role="button"]')].filter(visible).find(b=>/^(remove|delete|clear|close).*(file|attachment)|(file|attachment).*(remove|delete|clear|close)$/i.test(label(b)));let target=direct;if(!target){for(const card of scope.querySelectorAll('[data-testid*="attachment"],[data-testid*="file"]')){if(!visible(card))continue;const b=[...card.querySelectorAll('button,[role="button"]')].filter(visible).find(x=>/remove|delete|clear|close/i.test(label(x)));if(b){target=b;break}}}if(!target)return null;const r=target.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,label:label(target)}})()`,5000).catch(()=>null);
    if(!point)break;
    if(!await trustedPointerClick(cdp,point).catch(()=>false))break;
    removed++;await delay(220);
  }

  const marker='ym-clear-'+Date.now();
  const marked=await cdp.eval(`/*YM_MARK_SELECTED_COMPOSER_FILE_INPUTS*/(()=>{const marker=${safeJson(marker)};const composer=${composerExpression};if(!composer)return 0;const scope=composer.closest('form')||composer.closest('[data-testid*="composer"]')||composer.parentElement?.parentElement?.parentElement;if(!scope)return 0;const inputs=[...scope.querySelectorAll('input[type=file]')].filter(input=>input.files&&input.files.length);for(const input of inputs)input.setAttribute('data-yardmaster-clear-input',marker);return inputs.length})()`,5000).catch(()=>0);
  if(marked){
    try{
      const doc=await cdp.send('DOM.getDocument',{depth:0,pierce:true},8000);
      const q=await cdp.send('DOM.querySelectorAll',{nodeId:doc.root.nodeId,selector:`input[type=file][data-yardmaster-clear-input="${marker}"]`},8000);
      for(const nodeId of [...(q.nodeIds||[])].slice(-4)){
        const cleared=await cdp.send('DOM.setFileInputFiles',{nodeId,files:[]},8000).then(()=>true).catch(()=>false);
        if(cleared)inputCleared++;
      }
    }finally{
      await cdp.eval(`(()=>{for(const input of document.querySelectorAll('input[data-yardmaster-clear-input="${marker}"]'))input.removeAttribute('data-yardmaster-clear-input');return true})()`,3000).catch(()=>{});
    }
  }

  const total=removed+inputCleared;
  if(total){
    diagnostics?.record('stale-attachments-cleared',{visibleAttachments:removed,selectedFileInputs:inputCleared,total});
    onStatus?.('Cleared '+total+' stale ChatGPT attachment source'+(total===1?'':'s')+' before uploading the current handoff.');
  }
  return total;
}
async function attachmentConfirmed(cdp,name,timeoutMs=45000){
  const deadline=Date.now()+timeoutMs;let selectedSince=0;
  while(Date.now()<deadline){
    const result=await attachmentEvidence(cdp,name);
    if(result?.failed){selectedSince=0;await delay(350);continue}
    if(result?.ok)return true;
    if(result?.selected&&!result?.busy){
      if(!selectedSince)selectedSince=Date.now();
      if(Date.now()-selectedSince>=900)return true;
    }else selectedSince=0;
    await delay(350);
  }
  return false;
}
async function attachFile(cdp,filePath,onStatus,diagnostics=null){
  if(!filePath)throw new Error('Yardmaster handoff ZIP path is missing.');
  if(!fs.existsSync(filePath))throw new Error('Handoff file does not exist: '+filePath);
  const full=path.resolve(filePath),name=path.basename(full);
  if(!/\.zip$/i.test(name))throw new Error('Yardmaster handoff must be a ZIP file: '+full);
  diagnostics?.record('attachment-start',{name,size:fs.statSync(full).size});
  onStatus?.('Uploading Yardmaster handoff to ChatGPT: '+name);
  await clearComposerAttachments(cdp,onStatus,diagnostics);
  const existing=await attachmentEvidence(cdp,name);
  if(existing?.selected||existing?.visibleHit||existing?.attachmentCount>0)throw new Error('ChatGPT still contains a stale attachment that Yardmaster could not safely clear. Refusing to add another copy.');

  await cdp.eval(`(()=>{const dialogs=[...document.querySelectorAll('[role="dialog"],dialog')];for(const d of dialogs){const t=(d.innerText||'').toLowerCase();if(!t.includes('create project'))continue;const x=[...d.querySelectorAll('button')].find(b=>/close|cancel/i.test((b.getAttribute('aria-label')||b.getAttribute('title')||b.innerText||'')));if(x){x.click();return true}}return false})()`,5000).catch(()=>false);
  await delay(200);

  let intercepted=false;
  try{await cdp.send('Page.enable',{},5000).catch(()=>{});await cdp.send('Page.setInterceptFileChooserDialog',{enabled:true},5000);intercepted=true}catch{}

  try{
    const attachPoint=await cdp.eval(`/*YM_ATTACHMENT_BUTTON*/(()=>{const e=${composerExpression};if(!e)return null;const form=e.closest('form')||e.parentElement?.parentElement?.parentElement||document;const visible=b=>{const r=b.getBoundingClientRect(),s=getComputedStyle(b);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};const label=b=>(b.getAttribute('aria-label')||b.getAttribute('title')||b.innerText||'').replace(/\\s+/g,' ').trim();const buttons=[...form.querySelectorAll('button,[role="button"]')].filter(visible);const b=buttons.find(x=>/^(add files and more|attach files?|upload files?|add files?|add photos(?: and files)?)$/i.test(label(x)))||buttons.find(x=>/(attach|add files and more|upload file)/i.test(label(x)));if(!b)return null;const r=b.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,label:label(b)}})()`,5000).catch(()=>null);

    diagnostics?.record('attachment-button',{found:!!attachPoint,label:attachPoint?.label||null,x:attachPoint?.x||null,y:attachPoint?.y||null});
    if(attachPoint){
      let chooserPromise=typeof cdp.waitEvent==='function'?cdp.waitEvent('Page.fileChooserOpened',2200).catch(()=>null):Promise.resolve(null);
      await trustedPointerClick(cdp,attachPoint).catch(()=>false);
      let chooser=await chooserPromise;
      diagnostics?.record('file-chooser-after-attach',{opened:!!chooser,backendNodeId:!!chooser?.backendNodeId});
      if(!chooser){
        await delay(220);
        const uploadPoint=await cdp.eval(`/*YM_UPLOAD_MENU_ITEM*/(()=>{const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};const label=e=>(e.innerText||e.getAttribute('aria-label')||e.getAttribute('title')||'').replace(/\\s+/g,' ').trim();const els=[...document.querySelectorAll('[role="menuitem"],button,[role="button"]')].filter(visible);const hit=els.find(e=>/^(upload from computer|upload file|upload files|add files|files?)$/i.test(label(e)))||els.find(e=>/upload.*computer|upload file/i.test(label(e)));if(!hit)return null;const r=hit.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,label:label(hit)}})()`,5000).catch(()=>null);
        diagnostics?.record('upload-menu-item',{found:!!uploadPoint,label:uploadPoint?.label||null,x:uploadPoint?.x||null,y:uploadPoint?.y||null});
        if(uploadPoint){
          chooserPromise=typeof cdp.waitEvent==='function'?cdp.waitEvent('Page.fileChooserOpened',4500).catch(()=>null):Promise.resolve(null);
          await trustedPointerClick(cdp,uploadPoint).catch(()=>false);
          chooser=await chooserPromise;
          diagnostics?.record('file-chooser-after-upload',{opened:!!chooser,backendNodeId:!!chooser?.backendNodeId});
        }
      }
      if(chooser?.backendNodeId){
        await cdp.send('DOM.setFileInputFiles',{backendNodeId:chooser.backendNodeId,files:[full]},60000);
        diagnostics?.record('file-input-set',{method:'file-chooser',backendNodeId:true});
        if(await attachmentConfirmed(cdp,name,60000)){diagnostics?.record('attachment-confirmed',{method:'file-chooser',name});onStatus?.('Yardmaster handoff attached to ChatGPT: '+name);return}
        const evidence=await attachmentEvidence(cdp,name);
        diagnostics?.record('attachment-confirm-timeout',{method:'file-chooser',name,evidence});
        if(evidence?.selected||evidence?.visibleHit||evidence?.busy||evidence?.attachmentCount>0)throw new Error('ChatGPT accepted the Yardmaster ZIP but its attachment state did not settle. Yardmaster will not upload a duplicate copy.');
      }
    }

    // Fallback only to a file input that actually belongs to the active composer.
    // Never populate unrelated/decoy file inputs elsewhere in the ChatGPT page.
    const marker='ym-upload-'+Date.now();
    const marked=await cdp.eval(`/*YM_MARK_COMPOSER_FILE_INPUTS*/(()=>{const marker=${safeJson(marker)};const e=${composerExpression};if(!e)return 0;const scope=e.closest('form')||e.closest('[data-testid*="composer"]')||e.parentElement?.parentElement?.parentElement;if(!scope)return 0;const inputs=[...scope.querySelectorAll('input[type=file]')];for(const input of inputs)input.setAttribute('data-yardmaster-upload-input',marker);return inputs.length})()`,5000).catch(()=>0);
    diagnostics?.record('composer-file-inputs',{count:Number(marked)||0});
    if(marked){
      const doc=await cdp.send('DOM.getDocument',{depth:0,pierce:true},8000);
      const q=await cdp.send('DOM.querySelectorAll',{nodeId:doc.root.nodeId,selector:`input[type=file][data-yardmaster-upload-input="${marker}"]`},8000);
      const nodeId=[...(q.nodeIds||[])].at(-1);
      if(nodeId){
        try{
          await cdp.send('DOM.setFileInputFiles',{nodeId,files:[full]},60000);
          diagnostics?.record('file-input-set',{method:'composer-input',nodeId:true,singleInput:true});
          if(await attachmentConfirmed(cdp,name,30000)){diagnostics?.record('attachment-confirmed',{method:'composer-input',name});onStatus?.('Yardmaster handoff attached to ChatGPT: '+name);return}
          const evidence=await attachmentEvidence(cdp,name);
          diagnostics?.record('attachment-confirm-timeout',{method:'composer-input',name,evidence});
          if(evidence?.selected||evidence?.visibleHit||evidence?.busy||evidence?.attachmentCount>0)throw new Error('ChatGPT accepted the Yardmaster ZIP but its attachment state did not settle. Yardmaster will not upload a duplicate copy.');
        }finally{
          await cdp.eval(`(()=>{for(const input of document.querySelectorAll('input[data-yardmaster-upload-input="${marker}"]'))input.removeAttribute('data-yardmaster-upload-input');return true})()`,3000).catch(()=>{});
        }
      }
    }
  }finally{
    if(intercepted)await cdp.send('Page.setInterceptFileChooserDialog',{enabled:false},3000).catch(()=>{});
  }
  diagnostics?.record('attachment-failed',{name});
  throw new Error('ChatGPT did not confirm the Yardmaster ZIP attachment after trusted file selection.');
}
async function promptSent(cdp,baseline,promptMarker,timeoutMs=5000){
  const before=Number(baseline?.userMessages??baseline)||0;
  const beforeAssistant=Number(baseline?.assistantMessages)||0;
  const beforeAssistantText=String(baseline?.assistantText||'').replace(/\s+/g,' ').trim();
  const baselineHref=String(baseline?.href||'');
  const baselineStop=!!baseline?.stopVisible;
  const deadline=Date.now()+timeoutMs;let lastEvidence=null;
  while(Date.now()<deadline){
    const evidence=await cdp.eval(`/*YM_VERIFY_PROMPT_SENT*/(()=>{const marker=${safeJson(promptMarker)},before=${before},beforeAssistant=${beforeAssistant},beforeAssistantText=${safeJson(beforeAssistantText)},baselineHref=${safeJson(baselineHref)},baselineStop=${baselineStop?'true':'false'};const visible=e=>{if(!e)return false;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};const messages=[...document.querySelectorAll('[data-message-author-role="user"]')];const latest=(messages.at(-1)?.innerText||'').replace(/\\s+/g,' ').trim();const userMessage=messages.length>before&&(!marker||latest.includes(marker));const assistants=[...document.querySelectorAll('[data-message-author-role="assistant"]')];const assistantText=(assistants.at(-1)?.innerText||assistants.at(-1)?.textContent||'').replace(/\\s+/g,' ').trim();const assistantAdvanced=assistants.length>beforeAssistant||(assistantText&&assistantText!==beforeAssistantText);const composer=${composerExpression};const composerText=(composer instanceof HTMLTextAreaElement||composer instanceof HTMLInputElement?composer.value:(composer?.innerText||composer?.textContent||'')).replace(/\\s+/g,' ').trim();const stopVisible=[...document.querySelectorAll('button,[role="button"]')].some(e=>visible(e)&&/(stop|cancel|interrupt)/i.test((e.getAttribute('aria-label')||e.getAttribute('title')||e.getAttribute('data-testid')||e.innerText||'').trim()));const href=location.href,routeChanged=!!baselineHref&&href!==baselineHref,conversationRoute=/\\/c\\/[^/?#]+/.test(location.pathname),generationStarted=stopVisible&&!baselineStop,composerCleared=composerText.length===0,transitionEvidence=generationStarted&&composerCleared&&(routeChanged||conversationRoute),assistantEvidence=assistantAdvanced&&composerCleared;const confirmed=userMessage||transitionEvidence||assistantEvidence;return {confirmed,reason:userMessage?'user-message':transitionEvidence?'generation-transition':assistantEvidence?'assistant-activity':null,userMessage,messageCount:messages.length,assistantMessages:assistants.length,assistantAdvanced,assistantLength:assistantText.length,composerCleared,composerLength:composerText.length,stopVisible,generationStarted,routeChanged,conversationRoute,href}})()`,5000).catch(()=>null);
    lastEvidence=evidence;
    if(evidence?.confirmed)return {sent:true,evidence};
    await delay(200);
  }
  return {sent:false,evidence:lastEvidence};
}
async function sendPrompt(cdp,prompt,onStatus,options={}){
  const sendTimeoutMs=Number(options.sendTimeoutMs||180000);
  const finalConfirmationMs=Number(options.finalConfirmationMs||180000);
  const confirmMs=Number(options.confirmMs||7000);
  const diagnostics=options.diagnostics||null;
  const promptForTyping=String(prompt||'').replace(/\r\n?/g,'\n').replace(/\n+/g,' ').trim();
  onStatus?.('Sending repair instructions to ChatGPT.');

  const baseline=await cdp.eval(`/*YM_SEND_BASELINE*/(()=>{const visible=e=>{if(!e)return false;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};const stopVisible=[...document.querySelectorAll('button,[role="button"]')].some(e=>visible(e)&&/(stop|cancel|interrupt)/i.test((e.getAttribute('aria-label')||e.getAttribute('title')||e.getAttribute('data-testid')||e.innerText||'').trim()));const assistants=[...document.querySelectorAll('[data-message-author-role="assistant"]')];const assistantText=(assistants.at(-1)?.innerText||assistants.at(-1)?.textContent||'').replace(/\\s+/g,' ').trim();return {userMessages:document.querySelectorAll('[data-message-author-role="user"]').length,assistantMessages:assistants.length,assistantText,href:location.href,stopVisible}})()`,5000).catch(()=>({userMessages:0,assistantMessages:0,assistantText:'',href:'',stopVisible:false}));
  diagnostics?.record('send-baseline',{userMessages:Number(baseline?.userMessages)||0,assistantMessages:Number(baseline?.assistantMessages)||0,assistantLength:String(baseline?.assistantText||'').length,href:baseline?.href||null,stopVisible:!!baseline?.stopVisible,promptLength:String(prompt||'').length,typedPromptLength:promptForTyping.length});
  const verifyTrustedPrompt=async()=>cdp.eval(`/*YM_VERIFY_TRUSTED_PROMPT*/(()=>{const q=${safeJson(promptForTyping)};const e=${composerExpression};if(!e)return {ok:false,reason:'missing',length:0,expectedLength:q.length};const raw=e instanceof HTMLTextAreaElement||e instanceof HTMLInputElement?e.value:(e.textContent??e.innerText??'');const normalize=v=>String(v||'').replace(/\\u00a0/g,' ').replace(/[\\u200b-\\u200d\\ufeff]/gi,'').replace(/\\r\\n?/g,'\\n').replace(/\\s+/g,' ').trim();const text=normalize(raw),expected=normalize(q);return {ok:text===expected,length:text.length,expectedLength:expected.length}})()`,5000).catch(()=>({ok:false,reason:'verify-error',length:0,expectedLength:promptForTyping.length}));
  const clearTrustedComposer=async()=>{
    const focused=await cdp.eval(`/*YM_TRUSTED_FILL_PROMPT*/(()=>{const e=${composerExpression};if(!e)return false;e.focus();return true})()`,5000).catch(()=>false);
    diagnostics?.record('composer-focus',{focused:!!focused});
    if(!focused)throw new Error('ChatGPT composer was not found for trusted prompt entry.');
    await cdp.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Control',code:'ControlLeft',windowsVirtualKeyCode:17,nativeVirtualKeyCode:17,modifiers:2},4000);
    await cdp.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,nativeVirtualKeyCode:65,modifiers:2},4000);
    await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,nativeVirtualKeyCode:65,modifiers:2},4000);
    await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Control',code:'ControlLeft',windowsVirtualKeyCode:17,nativeVirtualKeyCode:17,modifiers:0},4000);
    await cdp.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8,nativeVirtualKeyCode:8},4000);
    await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8,nativeVirtualKeyCode:8},4000);
  };
  let inserted=null,lastEntryError=null;
  for(let attempt=1;attempt<=3;attempt++){
    const method=attempt<3?'insertText':'char-fallback';
    try{
      await clearTrustedComposer();
      if(method==='insertText'){
        const chunkSize=700;
        for(let offset=0;offset<promptForTyping.length;offset+=chunkSize){
          await cdp.send('Input.insertText',{text:promptForTyping.slice(offset,offset+chunkSize)},5000);
          if(offset+chunkSize<promptForTyping.length)await delay(20);
        }
      }else{
        for(const ch of Array.from(promptForTyping))await cdp.send('Input.dispatchKeyEvent',{type:'char',text:ch,unmodifiedText:ch},4000);
      }
      await delay(80*attempt);
      inserted=await verifyTrustedPrompt();
      diagnostics?.record('trusted-prompt-attempt',{attempt,method,accepted:!!inserted?.ok,length:Number(inserted?.length)||0,expectedLength:Number(inserted?.expectedLength)||promptForTyping.length,reason:inserted?.reason||null});
      if(inserted?.ok)break;
      onStatus?.('ChatGPT prompt entry verification did not match. Retrying trusted input ('+attempt+'/3).');
    }catch(e){
      lastEntryError=e;
      diagnostics?.record('trusted-prompt-attempt',{attempt,method,accepted:false,error:String(e?.message||e)});
      if(attempt<3)onStatus?.('ChatGPT trusted prompt entry was interrupted. Retrying ('+attempt+'/3).');
    }
  }
  diagnostics?.record('trusted-prompt',{accepted:!!inserted?.ok,length:Number(inserted?.length)||0,expectedLength:Number(inserted?.expectedLength)||promptForTyping.length,reason:inserted?.reason||null});
  if(!inserted?.ok){
    if(lastEntryError)throw new Error('ChatGPT composer trusted text entry failed after retries: '+(lastEntryError?.message||lastEntryError));
    throw new Error('ChatGPT composer did not accept the complete Yardmaster prompt through trusted input after 3 verified attempts.');
  }

  const requiredAttachmentName=String(options.requiredAttachmentName||'').trim();
  if(requiredAttachmentName){
    const attachmentReady=await attachmentConfirmed(cdp,requiredAttachmentName,Number(options.attachmentConfirmMs||7000));
    diagnostics?.record('pre-send-attachment',{name:requiredAttachmentName,ready:!!attachmentReady});
    if(!attachmentReady)throw new Error('ChatGPT lost or did not finish attaching the Yardmaster ZIP before send: '+requiredAttachmentName);
    onStatus?.('Verified Yardmaster handoff is still attached before send: '+requiredAttachmentName);
  }

  const promptMarker=promptForTyping.replace(/\s+/g,' ').slice(0,96);
  const alreadySent=await promptSent(cdp,baseline,promptMarker,350);if(alreadySent.sent){diagnostics?.record('send-confirmed',alreadySent.evidence);onStatus?.('Repair prompt sent to ChatGPT.');return}

  const waitAfterComposerClear=async(probe,source)=>{
    if(probe?.sent)return true;
    if(!probe?.evidence?.composerCleared)return false;
    onStatus?.('ChatGPT cleared the composer after the trusted '+source+' action. Waiting for response activity instead of sending again.');
    diagnostics?.record('send-composer-cleared-grace-start',{source,milliseconds:finalConfirmationMs,evidence:probe.evidence});
    const grace=await promptSent(cdp,baseline,promptMarker,finalConfirmationMs);
    diagnostics?.record('send-composer-cleared-grace-result',{source,submitted:grace.sent,evidence:grace.evidence});
    if(grace.sent){onStatus?.('ChatGPT accepted the handoff and response activity is visible.');return true}
    throw new Error('ChatGPT cleared the composer after the trusted '+source+' send action, but no submitted user message or response activity appeared during the response grace period.');
  };
  const deadline=Date.now()+sendTimeoutMs;
  let pointerAttempts=0,enterAttempts=0,syntheticAttempts=0,lastTargetSignature='';
  while(Date.now()<deadline){
    const target=await cdp.eval(`/*YM_SEND_TARGET*/(()=>{const e=${composerExpression};if(!e)return null;const visible=b=>{const r=b.getBoundingClientRect(),s=getComputedStyle(b);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};const scope=e.closest('form')||e.parentElement?.parentElement?.parentElement||document;const selectors=['button[data-testid="send-button"]','button[data-testid*="send"]','button[data-testid*="submit"]','button[aria-label*="Send"]','button[aria-label*="send"]','button[aria-label*="Submit"]','button[aria-label*="submit"]','button[type="submit"]'];let b=null;for(const s of selectors){b=[...scope.querySelectorAll(s)].find(x=>visible(x));if(b)break}if(!b){const c=e.getBoundingClientRect();const blocked=/attach|add file|upload|voice|dictat|microphone|record|tool|model|stop/i;const ranked=[...scope.querySelectorAll('button,[role="button"]')].filter(x=>visible(x)&&!x.disabled&&x.getAttribute('aria-disabled')!=='true').map(x=>{const r=x.getBoundingClientRect(),label=(x.getAttribute('aria-label')||x.getAttribute('title')||x.innerText||'').trim(),meta=(x.getAttribute('data-testid')||'')+' '+label;let score=0;if(/send|submit/i.test(meta))score+=100;if(x.getAttribute('type')==='submit')score+=60;if(blocked.test(meta))score-=200;if(r.left>c.left+c.width*.55)score+=20;if(Math.abs(r.bottom-c.bottom)<90)score+=20;if(r.width<=80&&r.height<=80)score+=10;return {x,score}}).sort((a,b)=>b.score-a.score);if(ranked[0]?.score>=30)b=ranked[0].x}if(!b)return {found:false};const r=b.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,top=document.elementFromPoint(x,y);return {found:true,enabled:!b.disabled&&b.getAttribute('aria-disabled')!=='true',x,y,topIsButton:top===b||b.contains(top),label:(b.getAttribute('aria-label')||b.getAttribute('title')||b.innerText||'').trim()}})()`,5000).catch(()=>null);
    const targetSignature=JSON.stringify(target||{});if(targetSignature!==lastTargetSignature){lastTargetSignature=targetSignature;diagnostics?.record('send-target',{target})}
    if(target?.found&&target.enabled){
      pointerAttempts++;
      try{
        await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:target.x,y:target.y,button:'none'},4000);
        await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:target.x,y:target.y,button:'left',buttons:1,clickCount:1},4000);
        await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:target.x,y:target.y,button:'left',buttons:0,clickCount:1},4000);
      }catch{}
      const pointerSent=await promptSent(cdp,baseline,promptMarker,confirmMs);diagnostics?.record('pointer-send-result',{attempt:pointerAttempts,submitted:pointerSent.sent,evidence:pointerSent.evidence,target});
      if(pointerSent.sent){onStatus?.('Repair prompt sent to ChatGPT.');return}
      if(await waitAfterComposerClear(pointerSent,'pointer'))return;
    }

    enterAttempts++;
    await cdp.eval(`/*YM_FOCUS_COMPOSER*/(()=>{const e=${composerExpression};e?.focus();return !!e})()`,3000).catch(()=>false);
    try{
      await cdp.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13},4000);
      await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13},4000);
    }catch{}
    const enterSent=await promptSent(cdp,baseline,promptMarker,confirmMs);diagnostics?.record('enter-send-result',{attempt:enterAttempts,submitted:enterSent.sent,evidence:enterSent.evidence});
    if(enterSent.sent){onStatus?.('Repair prompt sent to ChatGPT.');return}
    if(await waitAfterComposerClear(enterSent,'Enter'))return;

    syntheticAttempts++;
    await cdp.eval(`/*YM_SYNTHETIC_SEND_FALLBACK*/(()=>{const e=${composerExpression};if(!e)return false;const scope=e.closest('form')||e.parentElement?.parentElement?.parentElement||document;const composerText=(e instanceof HTMLTextAreaElement||e instanceof HTMLInputElement?e.value:(e.innerText||e.textContent||'')).trim();if(!composerText)return false;const b=[...scope.querySelectorAll('button')].find(x=>x.dataset?.testid==='send-button'||/send/i.test(x.getAttribute('aria-label')||''));if(b&&!b.disabled){b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'mouse',isPrimary:true}));b.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));b.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));b.dispatchEvent(new MouseEvent('click',{bubbles:true}));b.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'mouse',isPrimary:true}));return true}const form=e.closest('form');if(form&&typeof form.requestSubmit==='function'){form.requestSubmit();return true}return false})()`,5000).catch(()=>false);
    const syntheticSent=await promptSent(cdp,baseline,promptMarker,confirmMs);diagnostics?.record('synthetic-send-result',{attempt:syntheticAttempts,submitted:syntheticSent.sent,evidence:syntheticSent.evidence});
    if(syntheticSent.sent){onStatus?.('Repair prompt sent to ChatGPT.');return}
    if(await waitAfterComposerClear(syntheticSent,'fallback'))return;
    await delay(250);
  }
  onStatus?.('ChatGPT submission is not visible yet. Waiting for response activity before declaring the handoff failed.');
  diagnostics?.record('send-final-grace-start',{milliseconds:finalConfirmationMs,pointerAttempts,enterAttempts,syntheticAttempts});
  const finalCheck=await promptSent(cdp,baseline,promptMarker,finalConfirmationMs);
  diagnostics?.record('send-final-grace-result',{submitted:finalCheck.sent,evidence:finalCheck.evidence});
  if(finalCheck.sent){onStatus?.('ChatGPT accepted the handoff and response activity is visible.');return}
  throw new Error(`ChatGPT prompt is filled in, but no submitted user message or response activity appeared after ${pointerAttempts} trusted pointer attempts, ${enterAttempts} native Enter attempts, ${syntheticAttempts} fallback attempts, and the final response grace period.`);
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
    await waitHandoffComposerReady(cdp,60000);
    info=await usageLimitInfo(cdp);
    if(info.limited&&info.detail)onStatus?.('ChatGPT Work is still limited. '+info.detail);
  }
  onStatus?.('ChatGPT Work usage is available again.'+(resumeHandoff?' Resuming the Yardmaster handoff.':''));
  if(!resumeHandoff)return true;
  await cdp.send('Page.navigate',{url:'https://chatgpt.com/'}).catch(()=>{});
  await waitHandoffComposerReady(cdp,60000);
  const modelOk=await chooseModeAndModel(cdp,context.mode,context.model,onStatus);
  if(modelOk===false)throw new Error('Yardmaster could not verify the requested ChatGPT model after usage reset: '+context.model);
  const effortOk=await chooseThinkingEffort(cdp,context.thinkingEffort,onStatus);
  if(effortOk===false)throw new Error('Yardmaster could not verify the requested ChatGPT thinking effort after usage reset: '+context.thinkingEffort);
  if(!context.artifactPath)throw new Error('Yardmaster recovery cannot resume without the handoff ZIP.');
  await attachFile(cdp,context.artifactPath,onStatus);
  await sendPrompt(cdp,context.prompt,onStatus,{requiredAttachmentName:path.basename(context.artifactPath)});
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
  await waitHandoffComposerReady(cdp,60000);
  await delay(1200);
}
function saveRecoveryState(dataDir,detail){
  try{
    const dir=path.join(dataDir||os.homedir(),'chat-handoff');fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,'recovery.json'),JSON.stringify({...detail,at:new Date().toISOString()},null,2),'utf8');
  }catch{}
}
async function startFreshChat(cdp,mode,model,thinkingEffort,artifactPath,prompt,onStatus,dataDir,reason='Chat is too long'){
  onStatus?.(reason+'. Saving continuation state and starting a fresh ChatGPT conversation.');
  const oldUrl=await cdp.eval('location.href').catch(()=>null);
  const dir=path.join(dataDir||os.homedir(),'chat-handoff');fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'continuation.txt'),'YARDMASTER CHAT CONTINUATION\n\nPrevious chat: '+String(oldUrl||'unknown')+'\n\n'+prompt,'utf8');
  fs.writeFileSync(path.join(dir,'continuation.json'),JSON.stringify({oldUrl,mode,model,artifactPath,createdAt:new Date().toISOString()},null,2),'utf8');
  await cdp.send('Page.navigate',{url:'https://chatgpt.com/'}).catch(()=>{});
  await waitHandoffComposerReady(cdp,60000);
  const modelOk=await chooseModeAndModel(cdp,mode,model,onStatus);
  if(modelOk===false)throw new Error('Yardmaster could not verify the requested ChatGPT model: '+model);
  const effortOk=await chooseThinkingEffort(cdp,thinkingEffort,onStatus);
  if(effortOk===false)throw new Error('Yardmaster could not verify the requested ChatGPT thinking effort: '+thinkingEffort);
  if(!artifactPath)throw new Error('Yardmaster continuation cannot start without the handoff ZIP.');
  await attachFile(cdp,artifactPath,onStatus);
  await sendPrompt(cdp,'Continue this Yardmaster repair in this new chat. Use the attached handoff and finish the requested repair. Return ONE COMPLETE APPLICATION ZIP when finished.\n\n'+prompt,onStatus,{requiredAttachmentName:path.basename(artifactPath)});
}
function snapshot(dir){
  const out=new Map();
  try{
    for(const name of fs.readdirSync(dir)){
      const full=path.join(dir,name);
      try{
        const stat=fs.statSync(full);
        if(stat.isFile())out.set(full,{mtimeMs:stat.mtimeMs,ctimeMs:stat.ctimeMs,size:stat.size});
      }catch{}
    }
  }catch{}
  return out;
}
function downloadFileChanged(before,file,stat){
  const previous=before instanceof Map?before.get(file):(before?.has?.(file)?{mtimeMs:stat.mtimeMs,ctimeMs:stat.ctimeMs,size:stat.size}:null);
  if(!previous)return true;
  return Number(stat.mtimeMs)!==Number(previous.mtimeMs)||Number(stat.ctimeMs)!==Number(previous.ctimeMs)||Number(stat.size)!==Number(previous.size);
}
function findFreshDownloadedZip(dir,before,{minimumAgeMs=800,now=Date.now()}={}){
  try{
    return fs.readdirSync(dir)
      .map(name=>path.join(dir,name))
      .filter(file=>/\.zip$/i.test(file)&&!file.endsWith('.crdownload')&&!file.endsWith('.tmp'))
      .map(file=>{try{return {file,stat:fs.statSync(file)}}catch{return null}})
      .filter(Boolean)
      .filter(({file,stat})=>stat.isFile()&&downloadFileChanged(before,file,stat)&&(minimumAgeMs===0||now-stat.mtimeMs>=minimumAgeMs))
      .sort((a,b)=>b.stat.mtimeMs-a.stat.mtimeMs)[0]?.file||null;
  }catch{return null}
}
function hasFreshDownloadActivity(dir,before){
  try{
    return fs.readdirSync(dir)
      .map(name=>path.join(dir,name))
      .some(file=>{
        if(!/\.(?:crdownload|tmp)$/i.test(file))return false;
        try{const stat=fs.statSync(file);return stat.isFile()&&downloadFileChanged(before,file,stat)}catch{return false}
      });
  }catch{return false}
}
function extractYardmasterProtocol(text){
  const source=String(text||'').replace(/\r\n?/g,'\n');
  const re=/(?:^|\n)\s*YARDMASTER\s*\n[\s\S]*?\n\s*END\s*(?=\n|$)/gi;
  let match,last='';
  while((match=re.exec(source)))last=String(match[0]||'').replace(/^\n/,'').trim();
  return last;
}
function assistantTextValue(element){
  // Code blocks retain literal backticks, $_ and $env: values that normal
  // Markdown can render as inline code or math and corrupt in page text.
  const blocks=[...(element?.querySelectorAll?.('pre code,pre')||[])];
  for(const block of blocks.reverse()){
    const text=String(block.textContent||'').trim();
    if(/(?:^|\n)\s*YARDMASTER\s*\n[\s\S]*?\n\s*END\s*(?=\n|$)/i.test(text))return text;
  }
  const rendered=String(element?.innerText||element?.textContent||'').trim();
  const raw=String(element?.textContent||'').trim();
  // Normal-flow HTML may collapse a multiline command in innerText. Preserve
  // raw line boundaries only when they contain a complete protocol block.
  return /(?:^|\n)\s*YARDMASTER\s*\n[\s\S]*?\n\s*END\s*(?=\n|$)/i.test(raw)?raw:rendered;
}
async function latestAssistantText(cdp){
  return String(await cdp.eval(`/*YM_LATEST_ASSISTANT_TEXT*/(()=>{const text=${assistantTextValue.toString()};const direct=[...document.querySelectorAll('[data-message-author-role="assistant"]')].filter(e=>text(e));if(direct.length)return text(direct.at(-1));const turns=[...document.querySelectorAll('[data-testid^="conversation-turn-"],article,[role="article"]')].filter(e=>text(e));const assistant=turns.filter(turn=>{if(turn.matches?.('[data-message-author-role="assistant"]')||turn.querySelector?.('[data-message-author-role="assistant"]'))return true;const meta=((turn.getAttribute?.('data-author')||'')+' '+(turn.getAttribute?.('data-role')||'')+' '+(turn.getAttribute?.('aria-label')||'')).toLowerCase();if(/assistant|chatgpt/.test(meta))return true;if(turn.matches?.('[data-message-author-role="user"]')||turn.querySelector?.('[data-message-author-role="user"]'))return false;const actions=[...turn.querySelectorAll('button,[role="button"]')].map(e=>(e.getAttribute('aria-label')||e.getAttribute('title')||e.innerText||'').trim()).join(' ').toLowerCase();return /copy|read aloud|good response|bad response|regenerate|retry/.test(actions)});return assistant.length?text(assistant.at(-1)):''})()`,10000).catch(()=>''));
}
async function assistantProtocol(cdp){
  const latest=await latestAssistantText(cdp);
  let protocol=extractYardmasterProtocol(latest);
  if(protocol)return {protocol,source:'assistant-turn'};
  const body=String(await pageText(cdp).catch(()=>''));
  protocol=extractYardmasterProtocol(body);
  return {protocol,source:protocol?'page-fallback':null};
}
async function clickLatestDownload(cdp){
  return cdp.eval(`(()=>{const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};const els=[...document.querySelectorAll('a,button,[role="button"]')].filter(visible);const zip=[...els].reverse().find(e=>/\.zip\b|download/i.test((e.innerText||e.getAttribute('aria-label')||e.getAttribute('download')||e.getAttribute('href')||'')));if(zip){zip.click();return true}return false})()`);
}
async function chatResponseActivity(cdp){
  return cdp.eval(`/*YM_CHAT_RESPONSE_ACTIVITY*/(()=>{const visible=e=>{if(!e)return false;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};const label=e=>(e.getAttribute('aria-label')||e.getAttribute('title')||e.getAttribute('data-testid')||e.innerText||'').trim();const buttons=[...document.querySelectorAll('button,[role="button"]')];const notice=[...document.querySelectorAll('[role="alert"],[role="status"],p,span,div')].find(e=>visible(e)&&!e.closest('[data-message-author-role="user"],pre,code,blockquote')&&/^connection interrupted(?:[.!:]|\\s+we|$)/i.test((e.children.length?[...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(' '):(e.innerText||'')).trim()));let retryPoint=null;if(notice){let scope=notice;for(let i=0;i<4&&scope&&scope!==document.body;i++,scope=scope.parentElement){const retry=[...scope.querySelectorAll('button,[role="button"]')].find(e=>visible(e)&&!e.disabled&&/^(retry|try again|continue generating)$/i.test(label(e)));if(retry){const r=retry.getBoundingClientRect();retryPoint={x:r.left+r.width/2,y:r.top+r.height/2};break}}}const interrupted=!!notice;const generating=!interrupted&&buttons.some(e=>visible(e)&&/(stop|cancel|interrupt)/i.test(label(e)));const assistants=[...document.querySelectorAll('[data-message-author-role="assistant"]')];const latest=(assistants.at(-1)?.innerText||assistants.at(-1)?.textContent||'').replace(/\\s+/g,' ').trim();return {generating,interrupted,retryPoint,assistantMessages:assistants.length,assistantText:latest,assistantLength:latest.length,href:location.href}})()`,7000).catch(()=>({generating:false,interrupted:false,assistantMessages:0,assistantText:'',assistantLength:0,href:''}));
}
function interruptionRecoveryStep(activity,attempt=1){return activity.retryPoint&&[1,3].includes(attempt)?'retry':'refresh'}
async function recoverInterruptedResponse(cdp,activity,onStatus,attempt=1){
  onStatus?.('Recovering ChatGPT connection (attempt '+attempt+'/5). The failed-test report and current conversation are saved.');
  if(interruptionRecoveryStep(activity,attempt)==='retry'&&await trustedPointerClick(cdp,activity.retryPoint)){await delay(1200);return 'retry'}
  await refreshChat(cdp,onStatus);
  await sendPrompt(cdp,'please finish',onStatus);
  return 'refresh';
}
function responseActivityChanged(previous,next){
  if(!next)return false;
  if(next.generating)return true;
  if(!previous)return Number(next.assistantMessages||0)>0||Number(next.assistantLength||0)>0;
  return Number(next.assistantMessages||0)>Number(previous.assistantMessages||0)||String(next.assistantText||'')!==String(previous.assistantText||'');
}
async function waitRepair(cdp,downloads,before,onStatus,shouldCancel=()=>false,assistantBefore=0,context={},timeoutMs=4*60*60*1000){
  const stallMs=Number(context.stallMs||20*60*1000);
  const exchangeBudget=context.exchangeBudget;
  const rollover=async(commandResult='')=>{
    if(!exchangeBudget?.due)return false;
    if(shouldCancel())throw new Error('Yardmaster work was stopped by the user.');
    const turns=await cdp.eval(`/*YM_CONTINUATION_TURNS*/[...document.querySelectorAll('[data-message-author-role]')].slice(-4).map(e=>({role:e.getAttribute('data-message-author-role'),text:(e.innerText||e.textContent||'').slice(-12000)}))`).catch(()=>[]);
    const prompt=continuationPrompt(context.prompt,turns,commandResult);
    await (context.startFreshChat||startFreshChat)(cdp,context.mode,context.model,context.thinkingEffort,context.artifactPath,prompt,onStatus,context.dataDir,'Two exchanges completed');
    exchangeBudget.reset(await cdp.eval('location.href').catch(()=>''));
    lastAssistant=0;sawResponse=false;finishFirstPending=false;protocolState=null;lastClick=0;downloadClickCount=0;lastProgress=Date.now();
    lastActivity={generating:false,assistantMessages:0,assistantText:'',assistantLength:0,href:''};
    return true;
  };
  let interruptedRecoveries=0,lastInterruptedRecovery=0,interruptionRecoveryPending=false,commandFailures=0;
  let deadline=Date.now()+timeoutMs;let lastClick=0,downloadClickCount=0,lastStatus=0,lastProgress=Date.now(),lastAssistant=assistantBefore,recoveries=0,sawResponse=false,finishFirstPending=false,lastProtocolText='',protocolState=null,lastActivity={generating:false,assistantMessages:assistantBefore,assistantText:'',assistantLength:0,href:''};
  while(Date.now()<deadline){
    if(shouldCancel())throw new Error('Yardmaster work was stopped by the user.');
    const fresh=findFreshDownloadedZip(downloads,before);
    if(fresh)return fresh;
    const downloadActive=hasFreshDownloadActivity(downloads,before)||!!findFreshDownloadedZip(downloads,before,{minimumAgeMs:0});
    const requiredAction=await chatGPTRequiredAction(cdp);
    if(requiredAction)throw Object.assign(new Error(attentionMessage(requiredAction)),{code:'CHATGPT_ACTION_REQUIRED',requiredAction});

    const activityState=await chatResponseActivity(cdp);
    if(activityState.interrupted||interruptionRecoveryPending){
      if(Date.now()-lastInterruptedRecovery<Number(context.interruptionRetryMs||30000)){await delay(1200);continue}
      if(interruptedRecoveries>=5)throw Object.assign(new Error('ChatGPT connection remains interrupted after five recovery attempts, including refresh and "please finish" retries. The failed-test report is saved; resume this handoff when ChatGPT is available.'),{code:'CHATGPT_CONNECTION_INTERRUPTED'});
      interruptedRecoveries++;lastInterruptedRecovery=Date.now();
      saveRecoveryState(context.dataDir,{reason:'connection_interrupted',attempt:interruptedRecoveries,url:activityState.href});
      try{await (context.recoverInterruptedResponse||recoverInterruptedResponse)(cdp,activityState,onStatus,interruptedRecoveries);interruptionRecoveryPending=false}catch(error){
        if(shouldCancel())throw error;
        interruptionRecoveryPending=true;
        onStatus?.('ChatGPT recovery attempt '+interruptedRecoveries+'/5 could not reconnect. Yardmaster will try again before requesting your help.');
        saveRecoveryState(context.dataDir,{reason:'connection_interrupted',attempt:interruptedRecoveries,error:String(error.message||error),url:activityState.href});
      }
      lastProgress=Date.now();continue;
    }
    const generating=!!activityState.generating;
    exchangeBudget?.complete(activityState);
    if(responseActivityChanged(lastActivity,activityState)){lastProgress=Date.now();sawResponse=true;finishFirstPending=false}
    lastActivity=activityState;
    const assistantNow=Number(activityState.assistantMessages||lastAssistant);
    if(assistantNow>lastAssistant){lastAssistant=assistantNow;lastProgress=Date.now();sawResponse=true}
    protocolState=typeof context.onAssistantProtocol==='function'?await assistantProtocol(cdp).catch(()=>({protocol:'',source:null})):null;
    if(protocolState?.protocol&&protocolState.protocol!==lastProtocolText){lastProgress=Date.now();sawResponse=true}

    const usage=await usageLimitInfo(cdp).catch(()=>({limited:false}));
    if(usage.limited){
      await waitForUsageAvailability(cdp,context,onStatus,shouldCancel,true);
      exchangeBudget?.reset(await cdp.eval('location.href').catch(()=>''));
      deadline=Date.now()+timeoutMs;lastProgress=Date.now();lastAssistant=0;sawResponse=false;finishFirstPending=false;lastActivity={generating:false,assistantMessages:0,assistantText:'',assistantLength:0,href:''};
      continue;
    }

    const condition=await chatCondition(cdp).catch(()=>null);
    if(condition==='too_long'&&!generating&&recoveries<4){
      recoveries++;lastProgress=Date.now();lastAssistant=0;sawResponse=false;
      await startFreshChat(cdp,context.mode,context.model,context.thinkingEffort,context.artifactPath,context.prompt,onStatus,context.dataDir);
      exchangeBudget?.reset(await cdp.eval('location.href').catch(()=>''));
      lastActivity={generating:false,assistantMessages:0,assistantText:'',assistantLength:0,href:''};
      continue;
    }
    if(condition==='error'&&!generating&&recoveries<8){
      if(!downloadActive&&await rollover())continue;
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
    if(!generating&&Date.now()-lastProgress>stallMs&&recoveries<8){
      if(!downloadActive&&await rollover())continue;
      recoveries++;lastProgress=Date.now();
      if(!finishFirstPending){
        finishFirstPending=true;
        onStatus?.('ChatGPT has shown no response activity for 20 minutes. Sending exactly "finish please" before refreshing.');
        saveRecoveryState(context.dataDir,{reason:'stall',step:'finish_please',inactivityMs:stallMs,url:await cdp.eval('location.href').catch(()=>null)});
        await sendPrompt(cdp,'finish please',onStatus);
      }else{
        finishFirstPending=false;
        saveRecoveryState(context.dataDir,{reason:'stall',step:'refresh',inactivityMs:stallMs,url:await cdp.eval('location.href').catch(()=>null)});
        await refreshChat(cdp,onStatus);
        await sendPrompt(cdp,'finish please',onStatus);
      }
      continue;
    }

    if(sawResponse&&!generating&&typeof context.onAssistantProtocol==='function'){
      const protocol=String(protocolState?.protocol||'');
      if(protocol&&protocol!==lastProtocolText){
        lastProtocolText=protocol;lastProgress=Date.now();onStatus?.('ChatGPT returned Yardmaster instructions ('+(protocolState?.source||'detected')+'). Executing them on the Windows PC.');
        let result;
        try{result=await context.onAssistantProtocol(protocol)}catch(error){
          if(shouldCancel()||!['POWERSHELL_SYNTAX','POWERSHELL_COMMAND_FAILED','POWERSHELL_TIMEOUT'].includes(error.code))throw error;
          commandFailures++;
          if(commandFailures>=3)throw Object.assign(new Error('PowerShell commands still fail after three attempts. Open ChatGPT on your PC to review the command error, then choose Resume Handoff. Your failed-test report is saved.'),{code:'CHATGPT_ACTION_REQUIRED',requiredAction:{service:'PowerShell',kind:'command-repair'}});
          result='Windows command failed (attempt '+commandFailures+'/3): '+String(error.message||error).slice(0,3000)+'\nCorrect the command and return a new YARDMASTER block. Do not repeat completed commands. Do not request interactive input. Provide complete valid PowerShell syntax.';
          onStatus?.('PowerShell command failed. Sending its error to ChatGPT for correction (attempt '+commandFailures+'/3).');
        }
        const summary=String(result||'Yardmaster instructions completed.').slice(0,6000);
        if(await rollover(summary))continue;
        await sendPrompt(cdp,'Yardmaster command result:\n'+summary+'\n\nContinue the repair. Return another YARDMASTER command block if more PC work is needed, or return ONE COMPLETE APPLICATION ZIP when finished.',onStatus);
        lastProgress=Date.now();sawResponse=false;protocolState=null;lastActivity={generating:false,assistantMessages:lastAssistant,assistantText:'',assistantLength:0,href:''};continue;
      }
    }
    if(sawResponse&&!generating&&!downloadActive){
      const retryDelay=downloadClickCount===0?0:90000;
      if(downloadClickCount<2&&Date.now()-lastClick>=retryDelay){
        const clicked=await clickLatestDownload(cdp).catch(()=>false);
        if(clicked){downloadClickCount++;lastClick=Date.now();lastProgress=Date.now();onStatus?.(downloadClickCount===1?'Repair ZIP download started. Waiting for it to finish.':'Repair ZIP download retry started. Waiting for it to finish.')}
      }
      if(downloadClickCount===0&&await rollover())continue;
    }
    if(Date.now()-lastStatus>15000){
      const inactiveFor=Math.max(0,Date.now()-lastProgress),minutes=Math.floor(inactiveFor/60000);
      onStatus?.(generating?'ChatGPT is actively working on the repair. Yardmaster will keep waiting.':downloadActive?'Repair ZIP is downloading. Waiting for completion.':sawResponse?'Waiting for ChatGPT repair download. Last response activity '+minutes+' minute'+(minutes===1?'':'s')+' ago.':'Waiting for ChatGPT to begin its response. Yardmaster will not treat the handoff as stalled until 20 minutes of inactivity.');
      lastStatus=Date.now()
    }
    await delay(1200);
  }
  throw new Error('Timed out after four hours waiting for a repaired ZIP from ChatGPT.');
}

async function manualComposerText(cdp){
  return String(await cdp.eval(`/*YM_MANUAL_CHAT_TEXT*/(()=>{const e=${composerExpression};if(!e)return '';return (e instanceof HTMLTextAreaElement||e instanceof HTMLInputElement?e.value:(e.innerText||e.textContent||''))})()`,5000).catch(()=>''));
}
async function trustedClearComposer(cdp){
  const focused=await cdp.eval(`/*YM_MANUAL_CHAT_FOCUS*/(()=>{const e=${composerExpression};if(!e)return false;e.focus();return true})()`,5000).catch(()=>false);
  if(!focused)return false;
  try{
    await cdp.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Control',code:'ControlLeft',windowsVirtualKeyCode:17,nativeVirtualKeyCode:17,modifiers:2},4000);
    await cdp.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,nativeVirtualKeyCode:65,modifiers:2},4000);
    await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,nativeVirtualKeyCode:65,modifiers:2},4000);
    await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Control',code:'ControlLeft',windowsVirtualKeyCode:17,nativeVirtualKeyCode:17,modifiers:0},4000);
    await cdp.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8,nativeVirtualKeyCode:8},4000);
    await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8,nativeVirtualKeyCode:8},4000);
  }catch{return false}
  return true;
}
async function prepareManualChat(cdp){
  await cdp.send('Page.navigate',{url:'https://chatgpt.com/'},10000).catch(()=>{});
  const composer=await waitComposer(cdp,25000);
  if(!composer)return false;

  // ChatGPT can restore a persisted draft after the composer first appears.
  // Keep clearing with trusted keyboard input until the composer remains empty
  // for a stability window, so Open ChatGPT can never surface an old handoff draft.
  const deadline=Date.now()+12000;
  let emptySince=0;
  while(Date.now()<deadline){
    const text=(await manualComposerText(cdp)).trim();
    if(text){
      emptySince=0;
      if(!await trustedClearComposer(cdp))break;
      await delay(250);
      continue;
    }
    if(!emptySince)emptySince=Date.now();
    if(Date.now()-emptySince>=2200){
      const stable=(await manualComposerText(cdp)).trim().length===0;
      if(stable)return true;
      emptySince=0;
    }
    await delay(200);
  }
  throw new Error('ChatGPT manual-open composer did not stay empty. Yardmaster refused to leave a stale handoff draft visible.');
}
const manualWorkSolHighStages={
  work:{notFound:'Work mode not found',notSelected:'Work mode could not be selected',notVerified:'Work mode could not be verified'},
  model:{notFound:'GPT-5.6 Sol selector not found',notSelected:'GPT-5.6 Sol could not be selected',notVerified:'GPT-5.6 Sol could not be verified'},
  thinking:{notFound:'High thinking selector not found',notSelected:'High could not be selected',notVerified:'High could not be verified'}
};
function isManualWorkSolHigh(mode,model,thinkingEffort){
  return /^work$/i.test(String(mode||'').trim())
    &&/^gpt[- ]?5\.6\s+sol$/i.test(String(model||'').trim())
    &&/^high$/i.test(String(thinkingEffort||'').trim());
}
async function readManualWorkSolHighStage(cdp,stage){
  return cdp.eval(`/*YM_MANUAL_STAGE_READ:${stage}*/(()=>{const stage=${safeJson(stage)};const composer=${composerExpression};if(!composer)return null;const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};const text=e=>(e.innerText||e.textContent||e.getAttribute('aria-label')||e.getAttribute('title')||'').replace(/\\s+/g,' ').trim();const menuish=e=>!!e.closest('[role="menu"],[role="listbox"],[role="dialog"],[data-radix-menu-content],[data-radix-popper-content-wrapper]');const active=e=>e.getAttribute('aria-selected')==='true'||e.getAttribute('aria-pressed')==='true'||e.getAttribute('aria-current')==='true'||/^(active|checked|selected|on)$/i.test(e.getAttribute('data-state')||'')||e.getAttribute('data-selected')==='true'||e.getAttribute('data-active')==='true';const key=(e,index)=>({id:e.id||'',testid:e.getAttribute('data-testid')||'',aria:e.getAttribute('aria-label')||'',title:e.getAttribute('title')||'',label:text(e),index});const controls=[...document.querySelectorAll('button,[role="button"],[role="tab"],[role="combobox"]')].filter(e=>visible(e)&&!menuish(e));let ranked=[];if(stage==='work'){ranked=controls.map((e,index)=>{const t=text(e).toLowerCase(),r=e.getBoundingClientRect(),c=composer.getBoundingClientRect();let score=0;if(t==='work'||t==='work mode')score+=30;if(e.getAttribute('role')==='tab')score+=10;if(r.bottom<c.top)score+=6;return {e,index,score}})}else if(stage==='model'){ranked=controls.map((e,index)=>{const t=text(e).toLowerCase(),meta=((e.getAttribute('data-testid')||'')+' '+(e.getAttribute('aria-label')||'')+' '+(e.getAttribute('title')||'')).toLowerCase();let score=0;if(/model|model-switcher|model selector|model picker/.test(meta))score+=22;if(/gpt[- ]?5\\.6\\s+sol|\\bsol\\b/.test(t))score+=18;if(/thinking|reasoning|effort/.test(meta))score-=30;return {e,index,score}})}else{ranked=controls.map((e,index)=>{const t=text(e).toLowerCase(),meta=((e.getAttribute('data-testid')||'')+' '+(e.getAttribute('aria-label')||'')+' '+(e.getAttribute('title')||'')).toLowerCase();let score=0;if(/thinking|reasoning|effort/.test(meta))score+=24;if(/^(high|medium|instant|auto|extra high)$/.test(t))score+=16;if(/model|model-switcher|model selector|model picker/.test(meta))score-=30;return {e,index,score}})}ranked=ranked.filter(x=>x.score>=18).sort((a,b)=>b.score-a.score);const hit=ranked[0];if(!hit)return null;return {label:text(hit.e),active:active(hit.e),fingerprint:key(hit.e,hit.index)}})()`,5000).catch(()=>null);
}
async function manualStagePoint(cdp,marker,stage,fingerprint=null){
  return cdp.eval(`/*${marker}:${stage}*/(()=>{const stage=${safeJson(stage)},wanted=${safeJson(fingerprint)};const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};const text=e=>(e.innerText||e.textContent||e.getAttribute('aria-label')||e.getAttribute('title')||'').replace(/\\s+/g,' ').trim().toLowerCase();const same=(e,index)=>!!wanted&&((wanted.id&&e.id===wanted.id)||(wanted.testid&&e.getAttribute('data-testid')===wanted.testid)||(wanted.aria&&e.getAttribute('aria-label')===wanted.aria)||(wanted.title&&e.getAttribute('title')===wanted.title)||(wanted.label&&wanted.index===index&&text(e)===String(wanted.label).toLowerCase()));let hit;if(wanted)hit=[...document.querySelectorAll('button,[role="button"],[role="tab"],[role="combobox"]')].filter(visible).find((e,index)=>same(e,index));else{const aliases=stage==='model'?['gpt-5.6 sol','gpt 5.6 sol','sol']:['high'];const options=[...document.querySelectorAll('[role="menuitem"],[role="menuitemradio"],[role="option"],[role="radio"],button,[role="button"]')].filter(e=>visible(e)&&!!e.closest('[role="menu"],[role="listbox"],[role="dialog"],[data-radix-menu-content],[data-radix-popper-content-wrapper]'));hit=options.find(e=>aliases.some(a=>{const t=text(e);return t===a||t.startsWith(a+' ')||t.endsWith(' '+a)}))}if(!hit)return null;const r=hit.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`,5000).catch(()=>null);
}
async function openManualWorkSolHighStage(cdp,stage,fingerprint){
  const point=await manualStagePoint(cdp,'YM_MANUAL_STAGE_OPEN',stage,fingerprint);
  return !!point&&trustedPointerClick(cdp,point).catch(()=>false);
}
async function pickManualWorkSolHighOption(cdp,stage){
  const point=await manualStagePoint(cdp,'YM_MANUAL_STAGE_PICK',stage);
  return !!point&&trustedPointerClick(cdp,point).catch(()=>false);
}
function manualStageVerified(stage,read){
  if(!read)return false;
  if(stage==='work')return read.active===true&&/^work(?: mode)?$/i.test(read.label||'');
  if(stage==='model')return /(?:gpt[- ]?5\.6\s+sol|\bsol\b)/i.test(read.label||'');
  return /^high$/i.test(String(read.label||'').trim());
}
async function waitForStableManualStage(cdp,stage,deadline){
  let previous='',stable=0,last=null;
  while(Date.now()<deadline){
    const read=await readManualWorkSolHighStage(cdp,stage);
    if(read){
      const signature=JSON.stringify(read.fingerprint||{})+'|'+read.label+'|'+read.active;
      stable=signature===previous?stable+1:1;previous=signature;last=read;
      if(stable>=2)return read;
    }else{stable=0;previous='';last=null}
    await delay(400);
  }
  return last;
}
async function waitForManualStageVerification(cdp,stage,deadline){
  while(Date.now()<deadline){
    const read=await readManualWorkSolHighStage(cdp,stage);
    if(manualStageVerified(stage,read))return read;
    await delay(450);
  }
  return null;
}
async function selectManualWorkSolHighStage(cdp,stage,overallDeadline){
  const details=manualWorkSolHighStages[stage];
  let found=false,opened=false,picked=stage==='work';
  for(let attempt=1;attempt<=3&&Date.now()<overallDeadline;attempt++){
    const settleDeadline=Math.min(overallDeadline,Date.now()+9000);
    const control=await waitForStableManualStage(cdp,stage,settleDeadline);
    if(!control){await delay(500);continue}
    found=true;
    if(manualStageVerified(stage,control))return true;
    if(!await openManualWorkSolHighStage(cdp,stage,control.fingerprint)){await delay(650);continue}
    opened=true;
    await delay(700);
    if(stage!=='work'){
      if(!await pickManualWorkSolHighOption(cdp,stage)){await closeConversationMenu(cdp);await delay(800);continue}
      picked=true;
      await delay(900);
    }
    const verified=await waitForManualStageVerification(cdp,stage,Math.min(overallDeadline,Date.now()+9000));
    await closeConversationMenu(cdp);
    if(verified)return true;
    await delay(900);
  }
  if(!found)throw new Error(details.notFound);
  if(!opened||!picked)throw new Error(details.notSelected);
  throw new Error(details.notVerified);
}
async function configureManualWorkSolHigh(cdp,{timeoutMs=75000}={}){
  const deadline=Date.now()+Number(timeoutMs||75000);
  await delay(1800);
  await selectManualWorkSolHighStage(cdp,'work',deadline);
  await delay(900);
  await selectManualWorkSolHighStage(cdp,'model',deadline);
  await delay(900);
  await selectManualWorkSolHighStage(cdp,'thinking',deadline);
  const stray=(await manualComposerText(cdp)).trim();
  if(stray){
    await trustedClearComposer(cdp);
    await delay(350);
    if((await manualComposerText(cdp)).trim())throw new Error('Manual ChatGPT settings were applied, but the composer was not empty.');
  }
  return true;
}
async function configureManualChat(cdp,{mode,model,thinkingEffort,timeoutMs=75000}){
  if(isManualWorkSolHigh(mode,model,thinkingEffort))return configureManualWorkSolHigh(cdp,{timeoutMs});
  const deadline=Date.now()+Number(timeoutMs||75000);
  let modelOk=false,effortOk=false,attempt=0,interactiveFailures=0,lastControlStatus='';
  // Slower Windows laptops can render the composer before ChatGPT's controls
  // finish hydrating. Wait patiently, but do not repeatedly flash menus forever.
  await delay(1800);
  while(Date.now()<deadline){
    attempt++;
    modelOk=await chooseModeAndModel(cdp,mode,model,m=>{lastControlStatus=m}).catch(()=>false);
    if(modelOk){
      await delay(900);
      effortOk=await chooseThinkingEffort(cdp,thinkingEffort,()=>{}).catch(()=>false);
      if(effortOk)break;
      interactiveFailures++;
      if(interactiveFailures>=3)break;
    }
    await closeConversationMenu(cdp).catch(()=>{});
    await delay(Math.min(3500,1200+attempt*350));
  }
  await closeConversationMenu(cdp).catch(()=>{});
  if(!modelOk)throw new Error('Yardmaster could not verify the selected manual ChatGPT mode/model after waiting for the page to finish loading: '+mode+' / '+model+' ('+lastControlStatus+')');
  if(!effortOk)throw new Error('Yardmaster could not set the selected manual ChatGPT thinking effort after 3 trusted attempts: '+thinkingEffort);
  const stray=(await manualComposerText(cdp)).trim();
  if(stray){
    await trustedClearComposer(cdp);
    await delay(350);
    if((await manualComposerText(cdp)).trim())throw new Error('Manual ChatGPT settings were applied, but the composer was not empty.');
  }
  return true;
}

export async function openChatGPT({mode='Work',model='GPT-5.6 Sol',thinkingEffort='High',prompt='',artifactPath=null,dataDir}){
  // Manual Open ChatGPT is intentionally isolated from the automation profile.
  // It still applies and verifies the exact mode/model/thinking effort selected
  // in Yardmaster, but never prepares, uploads, or sends an automated handoff.
  const launched=await launch(dataDir,{purpose:'manual'});const {cdp,downloads,profile,port}=launched;
  try{
    const composer=await prepareManualChat(cdp);
    if(!composer)return {...await composerUnavailableResult(cdp,launched),mode,model,thinkingEffort,promptPrepared:false,artifactPath:null,downloads,profile,port};
    await configureManualChat(cdp,{mode,model,thinkingEffort});
    return {state:'ready',mode,model,thinkingEffort,promptPrepared:false,artifactPath:null,downloads,profile,port};
  }finally{cdp.close()}
}

export async function submitRepairToChatGPT({mode='Work',model='GPT-5.6 Sol',thinkingEffort='High',prompt,artifactPath,dataDir,onStatus=()=>{},shouldCancel=()=>false,onAssistantProtocol=null,loopRun=false}){
  if(!artifactPath)throw new Error('Yardmaster handoff ZIP is missing. Refusing to open or send a repair prompt without the archive.');
  const handoffPath=path.resolve(artifactPath);
  if(!fs.existsSync(handoffPath))throw new Error('Yardmaster handoff ZIP does not exist: '+handoffPath);
  if(!/\.zip$/i.test(path.basename(handoffPath)))throw new Error('Yardmaster handoff archive must be a ZIP file: '+handoffPath);
  const diagnostics=createHandoffDiagnostics(dataDir,{version:'0.1.69',mode,model,thinkingEffort,artifactPath:handoffPath,prompt});
  const status=message=>{diagnostics.record('status',{message});onStatus?.(message)};
  let cdp=null,downloads=null;
  try{
    diagnostics.record('browser-launch-start',{});
    const launched=await launch(dataDir,{onStatus:status});cdp=launched.cdp;downloads=launched.downloads;
    let exchangeBudget=null;
    if(loopRun){
      const url=await cdp.eval('location.href').catch(()=>'');
      exchangeBudget=createChatExchangeBudget({dataDir,url});
      if(exchangeBudget.due){
        status('Two exchanges completed. Opening a fresh ChatGPT conversation for the next loop handoff.');
        await cdp.send('Page.navigate',{url:'https://chatgpt.com/'});
        exchangeBudget.reset('https://chatgpt.com/');
      }
    }
    diagnostics.record('browser-attached',{port:launched.port,purpose:launched.purpose});
    const composer=await waitHandoffComposerReady(cdp,120000);
    diagnostics.record('composer-wait',{found:!!composer,hydrated:!!composer,composer});
    if(!composer){const result=await composerUnavailableResult(cdp,launched);diagnostics.record('confirmed-sign-in-required',{session:result.session});diagnostics.success();return result}
    await diagnostics.snapshot(cdp,'composer-ready');
    let modelOk=await chooseModeAndModel(cdp,mode,model,status);
    diagnostics.record('mode-model-result',{ok:!!modelOk,mode,model});
    if(modelOk===false){
      const limited=await usageLimitInfo(cdp).catch(()=>({limited:false}));
      diagnostics.record('usage-check-after-model-failure',limited);
      if(limited.limited){
        await waitForUsageAvailability(cdp,{mode,model,thinkingEffort,artifactPath:handoffPath,prompt,dataDir},status,shouldCancel,false);
        modelOk=await chooseModeAndModel(cdp,mode,model,status);
        diagnostics.record('mode-model-result-after-usage',{ok:!!modelOk,mode,model});
      }
    }
    if(modelOk===false)throw new Error('Yardmaster could not verify the requested ChatGPT model: '+model);
    const effortOk=await chooseThinkingEffort(cdp,thinkingEffort,status);
    diagnostics.record('thinking-result',{ok:!!effortOk,thinkingEffort});
    if(effortOk===false)throw new Error('Yardmaster could not verify the requested ChatGPT thinking effort: '+thinkingEffort);
    const before=snapshot(downloads);
    await attachFile(cdp,handoffPath,status,diagnostics);
    await diagnostics.snapshot(cdp,'after-attachment');
    const assistantBefore=await cdp.eval(`document.querySelectorAll('[data-message-author-role="assistant"]').length`).catch(()=>0);
    if(loopRun)exchangeBudget=createChatExchangeBudget({dataDir,url:await cdp.eval('location.href').catch(()=>''),assistantBefore});
    diagnostics.record('assistant-baseline',{assistantMessages:Number(assistantBefore)||0});
    await sendPrompt(cdp,prompt,status,{requiredAttachmentName:path.basename(handoffPath),diagnostics});
    await diagnostics.snapshot(cdp,'after-submit');
    const repairPath=await waitRepair(cdp,downloads,before,status,shouldCancel,assistantBefore,{mode,model,thinkingEffort,artifactPath:handoffPath,prompt,dataDir,onAssistantProtocol,exchangeBudget});
    diagnostics.success();
    return {state:'downloaded',repairPath};
  }catch(error){
    try{error.diagnostic=await diagnostics.fail(error,cdp)}catch(diagnosticError){error.diagnostic={id:diagnostics.id,name:null,path:null,stage:diagnostics.lastStage,error:String(diagnosticError?.message||diagnosticError)}}
    throw error;
  }finally{try{cdp?.close()}catch{}}
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
          const latest=await latestAssistantText(cdp);
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
  launch,
  attachResponsiveChatGPT,
  composerExpression,
  composerUnavailableResult,
  selectAndVerifyConversationControl,
  chooseModeAndModel,
  chooseThinkingEffort,
  attachFile,
  attachmentEvidence,
  attachmentConfirmed,
  clearComposerAttachments,
  waitHandoffComposerReady,
  sendPrompt,
  usageLimitInfo,
  prepareManualChat,
  manualComposerText,
  trustedClearComposer,
  browserSpec,
  configureManualChat,
  configureManualWorkSolHigh,
  selectManualWorkSolHighStage,
  readManualWorkSolHighStage,
  isManualWorkSolHigh,
  chatModelUsesThinkingControl,
  extractYardmasterProtocol,
  latestAssistantText,
  assistantTextValue,
  assistantProtocol,
  snapshotDownloads:snapshot,
  findFreshDownloadedZip,
  hasFreshDownloadActivity,
  chatResponseActivity,
  recoverInterruptedResponse,
  interruptionRecoveryStep,
  responseActivityChanged,
  waitRepair
};
