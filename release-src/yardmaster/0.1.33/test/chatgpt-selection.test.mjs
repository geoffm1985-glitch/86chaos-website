import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {__testHooks} from '../automation/chatgpt.mjs';
const projectRoot=path.dirname(path.dirname(fileURLToPath(import.meta.url)));

function selectorCdp({after={mode:'Work',model:'GPT-5.6 Sol',thinking:'High'},stuck=false,genericAfter=false,selectedOnReopen=false}={}){
  const calls=[];const reads={mode:0,model:0,thinking:0};let pickCount=0,verifyCount=0;
  return {
    calls,reads,
    async eval(expression){
      calls.push(expression);
      const match=expression.match(/YM_READ_CONTROL:(model|mode|thinking)/);
      if(match){
        const kind=match[1],read=reads[kind]++;
        const before={mode:'Chat',model:'GPT-5.6 Terra',thinking:'Medium'}[kind];
        let label=stuck||read===0?before:after[kind];
        if(genericAfter&&read>0)label=kind==='model'?'Model':kind==='thinking'?'Thinking':'Mode';
        return {label,fingerprint:{testid:'global-'+kind},score:18};
      }
      if(/YM_VERIFY_SELECTED_OPTION/.test(expression)){
        verifyCount++;
        return selectedOnReopen&&pickCount>0&&verifyCount>1;
      }
      if(/YM_PICK_OPTION/.test(expression)){pickCount++;return true}
      if(/YM_OPEN_CONTROL/.test(expression)||/YM_CLOSE_CONTROL/.test(expression))return true;
      return null;
    }
  };
}

test('ChatGPT mode, model, and thinking use real controls and verified read-back',async()=>{
  const cdp=selectorCdp();const statuses=[];
  const configured=await __testHooks.chooseModeAndModel(cdp,'Work','GPT-5.6 Sol',message=>statuses.push(message));
  assert.equal(configured,true,statuses.join(' | ')+' | reads='+JSON.stringify(cdp.reads));
  assert.equal(await __testHooks.chooseThinkingEffort(cdp,'High',message=>statuses.push(message)),true);
  const markers=cdp.calls.map(value=>(value.match(/YM_(?:READ|OPEN|PICK|CLOSE)_CONTROL(?::(model|mode|thinking))?/)||[])[0]).filter(Boolean);
  assert.ok(markers.some(value=>value.includes('READ_CONTROL:mode')));
  assert.ok(markers.some(value=>value.includes('READ_CONTROL:model')));
  assert.ok(markers.some(value=>value.includes('READ_CONTROL:thinking')));
  assert.ok(statuses.includes('Verified ChatGPT mode: Work'));
  assert.ok(statuses.includes('Verified ChatGPT model: GPT-5.6 Sol'));
  assert.ok(statuses.includes('Verified ChatGPT thinking effort: High'));
});

test('generic ChatGPT model button can be verified from the checked menu option',async()=>{
  const cdp=selectorCdp({genericAfter:true,selectedOnReopen:true});const statuses=[];
  assert.equal(await __testHooks.chooseModeAndModel(cdp,'Work','GPT-5.6 Sol',message=>statuses.push(message)),true);
  assert.ok(cdp.calls.some(x=>/YM_VERIFY_SELECTED_OPTION/.test(x)));
  assert.ok(statuses.includes('Verified ChatGPT model: GPT-5.6 Sol'));
});

test('ChatGPT selector fails closed when neither the control nor checked menu option confirms the request',async()=>{
  const cdp=selectorCdp({stuck:true});const statuses=[];
  assert.equal(await __testHooks.chooseThinkingEffort(cdp,'High',message=>statuses.push(message)),false);
  assert.match(statuses.at(-1),/could not verify/i);
});

test('ChatGPT selector rejects unrelated visible text when no conversation control is found',async()=>{
  const cdp={eval:async expression=>/YM_READ_CONTROL/.test(expression)?null:false};
  assert.equal(await __testHooks.chooseModeAndModel(cdp,'Work','GPT-5.6 Sol'),false);
});

test('usage-limit detection captures reset detail without buying usage',async()=>{
  const cdp={eval:async()=>"You've reached the Work usage limit. Your access resets at 3:00 PM."};
  const result=await __testHooks.usageLimitInfo(cdp);
  assert.equal(result.limited,true);
  assert.match(result.detail,/resets at 3:00 PM/i);
});

test('manual Open ChatGPT starts a clean chat without preparing or sending a Yardmaster handoff',async()=>{
  const calls=[];let text='Yardmaster automated handoff. STALE';
  const cdp={
    async send(method,params){
      calls.push({kind:'send',method,params});
      if(method==='Input.dispatchKeyEvent'&&params.key==='Backspace'&&params.type==='keyUp')text='';
      return {};
    },
    async eval(expression){
      calls.push({kind:'eval',expression});
      if(expression.includes('YM_MANUAL_CHAT_FOCUS'))return true;
      if(expression.includes('YM_MANUAL_CHAT_TEXT'))return text;
      if(expression.includes('document.querySelector'))return {tag:'TEXTAREA',id:'prompt-textarea',editable:null};
      return null;
    }
  };
  assert.equal(await __testHooks.prepareManualChat(cdp),true);
  assert.ok(calls.some(c=>c.kind==='send'&&c.method==='Page.navigate'&&c.params.url==='https://chatgpt.com/'));
  assert.ok(calls.some(c=>c.kind==='eval'&&c.expression.includes('YM_MANUAL_CHAT_TEXT')));
  assert.equal(text,'');
  assert.equal(calls.some(c=>c.kind==='eval'&&/YM_VERIFY_ATTACHMENT|YM_VERIFY_PROMPT_SENT|YM_TRUSTED_FILL_PROMPT/.test(c.expression)),false,'manual open must not prepare an automated handoff');
});

test('manual Open ChatGPT clears a stale handoff draft even when ChatGPT restores it late',async()=>{
  const calls=[];let text='Yardmaster automated handoff. STALE';let clears=0,lastClearAt=0;
  const started=Date.now();
  const cdp={
    async send(method,params){
      calls.push({kind:'send',method,params});
      if(method==='Input.dispatchKeyEvent'&&params.key==='Backspace'&&params.type==='keyUp'){
        clears++;text='';lastClearAt=Date.now();
      }
      return {};
    },
    async eval(expression){
      calls.push({kind:'eval',expression});
      if(expression.includes('YM_MANUAL_CHAT_FOCUS'))return true;
      if(expression.includes('YM_MANUAL_CHAT_TEXT')){
        if(clears===1&&lastClearAt&&Date.now()-lastClearAt>350&&Date.now()-started<1800)text='Yardmaster automated handoff. RESTORED LATE';
        return text;
      }
      if(expression.includes('document.querySelector'))return {tag:'TEXTAREA',id:'prompt-textarea',editable:null};
      return null;
    }
  };
  assert.equal(await __testHooks.prepareManualChat(cdp),true);
  assert.ok(clears>=2,'late restored draft must trigger another trusted clear');
  assert.equal(text,'');
});

test('manual Open ChatGPT uses a different Edge profile and DevTools port than automation',()=>{
  const root='C:\\Users\\fixture\\AppData\\Local\\Yardmaster';
  const automatic=__testHooks.browserSpec(root,'automation');
  const manual=__testHooks.browserSpec(root,'manual');
  assert.equal(automatic.port,9222);
  assert.equal(manual.port,9223);
  assert.notEqual(automatic.profile,manual.profile);
  assert.match(automatic.profile,/edge-profile$/);
  assert.match(manual.profile,/manual-edge-profile$/);
  assert.notEqual(automatic.downloads,manual.downloads);
});

test('manual Open ChatGPT configuration uses the same verified selectors as automated handoff',()=>{
  const source=fs.readFileSync(path.join(projectRoot,'automation','chatgpt.mjs'),'utf8');
  const block=(source.match(/async function configureManualChat\([\s\S]*?\n\}/)||[])[0]||'';
  assert.match(block,/chooseModeAndModel\(cdp,mode,model/);
  assert.match(block,/chooseThinkingEffort\(cdp,thinkingEffort/);
  assert.match(block,/manualComposerText/);
  assert.doesNotMatch(block,/attachFile|sendPrompt|submitRepairToChatGPT/);
});

test('manual ChatGPT configuration waits and retries for slow control hydration',async()=>{
  let modeAttempts=0,thinkingAttempts=0;
  const originalMode=__testHooks.chooseModeAndModel;
  const originalThinking=__testHooks.chooseThinkingEffort;
  const source=fs.readFileSync(path.join(projectRoot,'automation','chatgpt.mjs'),'utf8');
  const block=(source.match(/async function configureManualChat\([\s\S]*?\n\}/)||[])[0]||'';
  assert.match(block,/timeoutMs=75000/);
  assert.match(block,/while\(Date\.now\(\)<deadline\)/);
  assert.match(block,/await delay\(1200\)/);
  assert.match(block,/page to finish loading/);
  assert.doesNotMatch(block,/attachFile|sendPrompt|submitRepairToChatGPT/);
});

test('Chat + GPT-5.6 Sol uses the reasoning control instead of a separate model selector',async()=>{
  const calls=[];let modeReads=0;
  const cdp={
    async eval(expression){
      calls.push(expression);
      if(/YM_READ_CONTROL:mode/.test(expression)){
        modeReads++;
        return {label:'Chat',fingerprint:{testid:'mode'},score:18};
      }
      if(/YM_READ_CONTROL:model/.test(expression))throw new Error('Chat/Sol should not query a separate model selector');
      return false;
    }
  };
  const statuses=[];
  assert.equal(await __testHooks.chooseModeAndModel(cdp,'Chat','GPT-5.6 Sol',m=>statuses.push(m)),true);
  assert.equal(modeReads,1);
  assert.equal(calls.some(x=>/YM_READ_CONTROL:model/.test(x)),false);
  assert.ok(statuses.some(x=>/Sol through the thinking\/reasoning control/.test(x)));
  assert.equal(__testHooks.chatModelUsesThinkingControl('Chat','GPT-5.6 Sol'),true);
  assert.equal(__testHooks.chatModelUsesThinkingControl('Work','GPT-5.6 Sol'),false);
  assert.equal(__testHooks.chatModelUsesThinkingControl('Chat','GPT-6 Astra'),false);
});

