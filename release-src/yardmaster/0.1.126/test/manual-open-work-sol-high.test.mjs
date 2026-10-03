import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {__testHooks} from '../automation/chatgpt.mjs';

const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function stageCdp({missing=null,stuck=null}={}){
  const state={work:false,model:false,thinking:false};
  const calls=[];const events=[];let pending=null;
  const allowed=stage=>!missing||missing!==stage;
  const ready=stage=>stage==='work'||stage==='model'&&state.work||stage==='thinking'&&state.work&&state.model;
  return {
    state,calls,events,
    async eval(expression){
      calls.push({kind:'eval',expression});
      const read=expression.match(/YM_MANUAL_STAGE_READ:(work|model|thinking)/);
      if(read){
        const stage=read[1];
        if(!allowed(stage)||!ready(stage))return null;
        if(stage==='work'&&state.work)events.push('verify Work');
        if(stage==='model'&&state.model)events.push('verify GPT-5.6 Sol');
        if(stage==='thinking'&&state.thinking)events.push('verify High');
        return {
          label:stage==='work'?'Work':stage==='model'?(state.model?'GPT-5.6 Sol':'GPT-5.6 Terra'):(state.thinking?'High':'Medium'),
          active:stage==='work'?state.work:false,
          fingerprint:{testid:'fixture-'+stage}
        };
      }
      const open=expression.match(/YM_MANUAL_STAGE_OPEN:(work|model|thinking)/);
      if(open){pending={kind:'open',stage:open[1]};return {x:100,y:100}}
      const pick=expression.match(/YM_MANUAL_STAGE_PICK:(model|thinking)/);
      if(pick){pending={kind:'pick',stage:pick[1]};return {x:120,y:120}}
      if(expression.includes('YM_CLOSE_CONTROL'))return true;
      if(expression.includes('YM_MANUAL_CHAT_TEXT'))return '';
      return null;
    },
    async send(method,params){
      calls.push({kind:'send',method,params});
      if(method==='Input.dispatchMouseEvent'&&params.type==='mouseReleased'&&pending){
        const action=pending;pending=null;
        if(action.kind==='open'&&action.stage==='work'){
          events.push('select Work');
          if(stuck!=='work')state.work=true;
        }else if(action.kind==='pick'&&action.stage==='model'){
          events.push('select GPT-5.6 Sol');
          if(stuck!=='model')state.model=true;
        }else if(action.kind==='pick'&&action.stage==='thinking'){
          events.push('select High');
          if(stuck!=='thinking')state.thinking=true;
        }
      }
      return {};
    }
  };
}

test('WORK SELECTOR selects Work and verifies it before model discovery',async()=>{
  const cdp=stageCdp();
  assert.equal(await __testHooks.selectManualWorkSolHighStage(cdp,'work',Date.now()+5000),true);
  assert.equal(cdp.state.work,true);
  assert.deepEqual(cdp.events.slice(0,2),['select Work','verify Work']);
});

test('SOL SELECTOR requires verified Work, then selects and verifies GPT-5.6 Sol',async()=>{
  const cdp=stageCdp();cdp.state.work=true;
  assert.equal(await __testHooks.selectManualWorkSolHighStage(cdp,'model',Date.now()+5000),true);
  assert.equal(cdp.state.model,true);
  assert.deepEqual(cdp.events.slice(-2),['select GPT-5.6 Sol','verify GPT-5.6 Sol']);
});

test('HIGH SELECTOR requires Work and Sol, then selects and verifies High',async()=>{
  const cdp=stageCdp();cdp.state.work=true;cdp.state.model=true;
  assert.equal(await __testHooks.selectManualWorkSolHighStage(cdp,'thinking',Date.now()+5000),true);
  assert.equal(cdp.state.thinking,true);
  assert.deepEqual(cdp.events.slice(-2),['select High','verify High']);
});

test('ORDER is Work verify, Sol verify, then High verify',async()=>{
  const cdp=stageCdp();
  assert.equal(await __testHooks.configureManualWorkSolHigh(cdp,{timeoutMs:15000}),true);
  const milestones=cdp.events.filter((value,index,array)=>index===0||value!==array[index-1]);
  assert.deepEqual(milestones,[
    'select Work','verify Work',
    'select GPT-5.6 Sol','verify GPT-5.6 Sol',
    'select High','verify High'
  ]);
});

test('FAILURE reports the precise stage and fails closed',async t=>{
  for(const [stage,message] of [
    ['work','Work mode not found'],
    ['model','GPT-5.6 Sol selector not found'],
    ['thinking','High thinking selector not found']
  ]){
    await t.test(stage,async()=>{
      const cdp=stageCdp({missing:stage});
      if(stage!=='work')cdp.state.work=true;
      if(stage==='thinking')cdp.state.model=true;
      await assert.rejects(
        __testHooks.selectManualWorkSolHighStage(cdp,stage,Date.now()+550),
        error=>error.message===message
      );
    });
  }
  const stuck=stageCdp({stuck:'work'});
  await assert.rejects(
    __testHooks.selectManualWorkSolHighStage(stuck,'work',Date.now()+2300),
    error=>error.message==='Work mode could not be verified'
  );
});

test('LOOP REGRESSION never exceeds three deliberate High control opens',async()=>{
  const cdp=stageCdp({stuck:'thinking'});cdp.state.work=true;cdp.state.model=true;
  await assert.rejects(__testHooks.selectManualWorkSolHighStage(cdp,'thinking',Date.now()+3200),/High could not be verified/);
  const opens=cdp.calls.filter(call=>call.kind==='eval'&&/YM_MANUAL_STAGE_OPEN:thinking/.test(call.expression)).length;
  assert.ok(opens>0&&opens<=3,'High control opens='+opens);
});

test('MANUAL SAFETY leaves composer empty and never starts handoff behavior',async()=>{
  const cdp=stageCdp();
  assert.equal(await __testHooks.configureManualWorkSolHigh(cdp,{timeoutMs:15000}),true);
  const transcript=cdp.calls.map(call=>call.method||call.expression||'').join('\n');
  assert.doesNotMatch(transcript,/YM_VERIFY_ATTACHMENT|YM_TRUSTED_FILL_PROMPT|YM_VERIFY_PROMPT_SENT|Page\.setInterceptFileChooserDialog|DOM\.setFileInputFiles/);
  assert.equal(transcript.includes('Runtime.enable'),false);
  assert.equal(cdp.calls.some(call=>call.kind==='eval'&&call.expression.includes('YM_MANUAL_CHAT_TEXT')),true);
});

function edgePath(){
  return [
    process.env['PROGRAMFILES(X86)']&&path.join(process.env['PROGRAMFILES(X86)'],'Microsoft','Edge','Application','msedge.exe'),
    process.env.PROGRAMFILES&&path.join(process.env.PROGRAMFILES,'Microsoft','Edge','Application','msedge.exe'),
    process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'Microsoft','Edge','Application','msedge.exe')
  ].filter(Boolean).find(fs.existsSync);
}
async function waitJson(url,timeoutMs=20000){
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    try{const response=await fetch(url);if(response.ok)return response.json()}catch{}
    await delay(250);
  }
  throw new Error('Timed out waiting for Edge fixture.');
}
class FixtureCdp{
  constructor(url){this.url=url;this.ws=null;this.id=0;this.pending=new Map()}
  async connect(){
    this.ws=new WebSocket(this.url);
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Timed out connecting to Edge.')),10000);
      this.ws.addEventListener('open',()=>{clearTimeout(timer);resolve()},{once:true});
      this.ws.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('Edge connection failed.'))},{once:true});
    });
    this.ws.addEventListener('message',event=>{
      const message=JSON.parse(event.data);if(!message.id)return;
      const pending=this.pending.get(message.id);if(!pending)return;
      this.pending.delete(message.id);clearTimeout(pending.timer);
      message.error?pending.reject(new Error(message.error.message)):pending.resolve(message.result);
    });
  }
  send(method,params={},timeoutMs=10000){
    const id=++this.id;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('CDP timeout: '+method))},timeoutMs);
      this.pending.set(id,{resolve,reject,timer});
      this.ws.send(JSON.stringify({id,method,params}));
    });
  }
  async eval(expression,timeoutMs=10000){
    const result=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true},timeoutMs);
    if(result.exceptionDetails)throw new Error(result.exceptionDetails.text||'Fixture evaluation failed.');
    return result.result?.value;
  }
  close(){try{this.ws?.close()}catch{}}
}

test('WINDOWS EDGE: manual Open ChatGPT selects Work then GPT-5.6 Sol then High with trusted input',{skip:process.platform!=='win32'},async()=>{
  const edge=edgePath();assert.ok(edge,'Microsoft Edge must be available.');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster-work-sol-high-'));
  const port=9870+Math.floor(Math.random()*100);
  const html=`<!doctype html><meta charset="utf-8"><style>
    button,textarea{display:block;margin:12px;width:220px;height:42px}
    [hidden]{display:none!important}
  </style>
  <div role="tablist"><button id="chat" role="tab" aria-selected="true">Chat</button><button id="work" role="tab" aria-selected="false">Work</button></div>
  <button id="model" data-testid="work-model-selector" aria-label="Model selector" hidden>GPT-5.6 Terra</button>
  <div id="model-menu" role="menu" hidden><button id="sol" role="menuitemradio" aria-checked="false">GPT-5.6 Sol</button></div>
  <button id="thinking" data-testid="thinking-effort-selector" aria-label="Thinking effort" hidden>Medium</button>
  <div id="thinking-menu" role="menu" hidden><button id="high" role="menuitemradio" aria-checked="false">High</button></div>
  <textarea id="prompt-textarea"></textarea><ol id="order"></ol>
  <script>
    const chatTab=document.querySelector('#chat'),workTab=document.querySelector('#work');
    const modelButton=document.querySelector('#model'),modelMenu=document.querySelector('#model-menu'),solOption=document.querySelector('#sol');
    const thinkingButton=document.querySelector('#thinking'),thinkingMenu=document.querySelector('#thinking-menu'),highOption=document.querySelector('#high');
    const orderList=document.querySelector('#order');
    const log=value=>{const li=document.createElement('li');li.textContent=value;orderList.append(li)};
    workTab.addEventListener('click',event=>{if(!event.isTrusted)return;chatTab.ariaSelected='false';workTab.ariaSelected='true';modelButton.hidden=false;log('Work')});
    modelButton.addEventListener('click',event=>{if(!event.isTrusted||workTab.ariaSelected!=='true')return;modelMenu.hidden=false});
    solOption.addEventListener('click',event=>{if(!event.isTrusted||workTab.ariaSelected!=='true'||modelMenu.hidden)return;modelButton.textContent='GPT-5.6 Sol';solOption.ariaChecked='true';modelMenu.hidden=true;thinkingButton.hidden=false;log('GPT-5.6 Sol')});
    thinkingButton.addEventListener('click',event=>{if(!event.isTrusted||modelButton.textContent!=='GPT-5.6 Sol')return;thinkingMenu.hidden=false});
    highOption.addEventListener('click',event=>{if(!event.isTrusted||thinkingMenu.hidden)return;thinkingButton.textContent='High';highOption.ariaChecked='true';thinkingMenu.hidden=true;log('High')});
  </script>`;
  const file=path.join(temp,'work-sol-high.html');fs.writeFileSync(file,html);
  const child=spawn(edge,['--headless=new','--disable-gpu','--no-first-run','--remote-debugging-address=127.0.0.1','--remote-debugging-port='+port,'--user-data-dir='+path.join(temp,'profile'),'file:///'+file.replace(/\\/g,'/')],{stdio:'ignore',windowsHide:true});
  let cdp;
  try{
    const targets=await waitJson('http://127.0.0.1:'+port+'/json/list');
    const page=targets.find(target=>target.type==='page'&&target.webSocketDebuggerUrl);assert.ok(page);
    cdp=new FixtureCdp(page.webSocketDebuggerUrl);await cdp.connect();
    const readyDeadline=Date.now()+5000;let fixtureReady=false;
    while(Date.now()<readyDeadline){
      fixtureReady=await cdp.eval('document.readyState==="complete"&&!!document.querySelector("#work")&&!!document.querySelector("#model")&&!!document.querySelector("#thinking")&&!!document.querySelector("#prompt-textarea")').catch(()=>false);
      if(fixtureReady)break;
      await delay(100);
    }
    assert.equal(fixtureReady,true,'manual Work/Sol/High Edge fixture did not become ready.');
    await cdp.eval('document.querySelector("#work").click()');
    assert.equal(await cdp.eval('document.querySelector("#work").getAttribute("aria-selected")'),'false','synthetic click must be rejected');
    assert.equal(await __testHooks.configureManualWorkSolHigh(cdp,{timeoutMs:30000}),true);
    assert.deepEqual(await cdp.eval('[...document.querySelectorAll("#order li")].map(x=>x.textContent)'),['Work','GPT-5.6 Sol','High']);
    assert.equal(await cdp.eval('document.querySelector("#work").getAttribute("aria-selected")'),'true');
    assert.equal(await cdp.eval('document.querySelector("#model").textContent'),'GPT-5.6 Sol');
    assert.equal(await cdp.eval('document.querySelector("#thinking").textContent'),'High');
    assert.equal(await cdp.eval('document.querySelector("#prompt-textarea").value'),'');
  }finally{
    cdp?.close();try{child.kill()}catch{}await delay(400);
    try{fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:200})}catch{}
  }
});
