import test from 'node:test';
import assert from 'node:assert/strict';
import {__testHooks} from '../automation/chatgpt.mjs';

function fakeCdp({pointerSends=false,enterSends=false}={}){
  const calls=[];let sent=false;
  return {
    calls,
    async eval(expression){
      calls.push({kind:'eval',expression});
      if(expression.includes('YM_SEND_BASELINE'))return 0;
      if(expression.includes('YM_FILL_PROMPT'))return {ok:true,length:42};
      if(expression.includes('YM_VERIFY_PROMPT_SENT'))return sent;
      if(expression.includes('YM_SEND_TARGET'))return {found:true,enabled:true,topIsButton:true,x:120,y:240,label:'Send'};
      if(expression.includes('YM_FOCUS_COMPOSER'))return true;
      return null;
    },
    async send(method,params){
      calls.push({kind:'send',method,params});
      if(method==='Input.dispatchMouseEvent'&&params.type==='mouseReleased'&&pointerSends)sent=true;
      if(method==='Input.dispatchKeyEvent'&&params.type==='keyUp'&&params.key==='Enter'&&enterSends)sent=true;
      return {};
    }
  };
}

test('Play Store: filled ChatGPT composer must be submitted by trusted pointer and verified as a user message',async()=>{
  const cdp=fakeCdp({pointerSends:true});
  const status=[];
  await __testHooks.sendPrompt(cdp,'YARDMASTER PLAY STORE SEND PROBE',m=>status.push(m),{sendTimeoutMs:1000,confirmMs:100});
  assert.ok(cdp.calls.some(c=>c.kind==='send'&&c.method==='Input.dispatchMouseEvent'&&c.params.type==='mouseReleased'));
  assert.ok(status.includes('Repair prompt sent to ChatGPT.'));
});

test('Play Store: native Enter is a verified fallback when pointer click does not submit',async()=>{
  const cdp=fakeCdp({enterSends:true});
  await __testHooks.sendPrompt(cdp,'YARDMASTER ENTER FALLBACK PROBE',null,{sendTimeoutMs:1200,confirmMs:60});
  assert.ok(cdp.calls.some(c=>c.kind==='send'&&c.method==='Input.dispatchKeyEvent'&&c.params.type==='keyUp'));
});

test('Play Store regression: merely populating the textbox is a failure when no user message appears',async()=>{
  const cdp=fakeCdp();
  await assert.rejects(
    __testHooks.sendPrompt(cdp,'YARDMASTER FILLED BUT UNSENT PROBE',null,{sendTimeoutMs:350,confirmMs:20}),
    /no submitted user message appeared/i
  );
});

test('Play Store contract: submission verification is based on new user-message evidence, not composer clearing alone',async()=>{
  const cdp=fakeCdp({pointerSends:true});
  await __testHooks.sendPrompt(cdp,'YARDMASTER USER MESSAGE EVIDENCE',null,{sendTimeoutMs:1000,confirmMs:80});
  const checks=cdp.calls.filter(c=>c.kind==='eval'&&c.expression.includes('YM_VERIFY_PROMPT_SENT'));
  assert.ok(checks.length>0);
  assert.ok(checks.every(c=>c.expression.includes('data-message-author-role="user"')));
});
