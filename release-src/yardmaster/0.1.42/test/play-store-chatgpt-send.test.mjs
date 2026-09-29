import test from 'node:test';
import assert from 'node:assert/strict';
import {__testHooks} from '../automation/chatgpt.mjs';

function fakeCdp({pointerSends=false,enterSends=false,attachmentReady=true}={}){
  const calls=[];let sent=false,trustedFilled=false;
  return {
    calls,
    async eval(expression){
      calls.push({kind:'eval',expression});
      if(expression.includes('YM_SEND_BASELINE'))return 0;
      if(expression.includes('YM_TRUSTED_FILL_PROMPT'))return true;
      if(expression.includes('YM_VERIFY_TRUSTED_PROMPT'))return {ok:trustedFilled,length:42};
      if(expression.includes('YM_VERIFY_ATTACHMENT'))return {ok:attachmentReady,busy:false};
      if(expression.includes('YM_VERIFY_PROMPT_SENT'))return sent;
      if(expression.includes('YM_SEND_TARGET'))return trustedFilled?{found:true,enabled:true,topIsButton:true,x:120,y:240,label:'Send'}:{found:false};
      if(expression.includes('YM_FOCUS_COMPOSER'))return true;
      return null;
    },
    async send(method,params){
      calls.push({kind:'send',method,params});
      if(method==='Input.dispatchKeyEvent'&&params.type==='char'&&String(params.text||'').length)trustedFilled=true;
      if(method==='Input.dispatchMouseEvent'&&params.type==='mouseReleased'&&pointerSends&&trustedFilled)sent=true;
      if(method==='Input.dispatchKeyEvent'&&params.type==='keyUp'&&params.key==='Enter'&&enterSends&&trustedFilled)sent=true;
      return {};
    }
  };
}

test('Play Store: filled ChatGPT composer must be submitted by trusted pointer and verified as a user message',async()=>{
  const cdp=fakeCdp({pointerSends:true});
  const status=[];
  await __testHooks.sendPrompt(cdp,'YARDMASTER PLAY STORE SEND PROBE',m=>status.push(m),{sendTimeoutMs:1000,confirmMs:100});
  const typed=cdp.calls.filter(c=>c.kind==='send'&&c.method==='Input.dispatchKeyEvent'&&c.params.type==='char');
  assert.ok(typed.length>1,'prompt must be entered through trusted CDP keyboard input');
  assert.ok(typed.every(c=>Array.from(String(c.params.text||'')).length===1),'trusted typing must send one Unicode code point per CDP char event');
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


test('Play Store: combined handoff re-verifies the ZIP after trusted prompt entry and before submit',async()=>{
  const cdp=fakeCdp({pointerSends:true,attachmentReady:true});
  const status=[];
  await __testHooks.sendPrompt(cdp,'YARDMASTER COMBINED HANDOFF PROBE',m=>status.push(m),{
    sendTimeoutMs:1000,
    confirmMs:80,
    attachmentConfirmMs:80,
    requiredAttachmentName:'Yardmaster-Handoff-Fixture.zip'
  });
  const attachmentCheck=cdp.calls.findIndex(c=>c.kind==='eval'&&c.expression.includes('YM_VERIFY_ATTACHMENT'));
  const sendTarget=cdp.calls.findIndex(c=>c.kind==='eval'&&c.expression.includes('YM_SEND_TARGET'));
  assert.ok(attachmentCheck>=0,'combined handoff must verify the attachment');
  assert.ok(sendTarget>attachmentCheck,'send must happen only after attachment verification');
  assert.ok(status.some(x=>/still attached before send/i.test(x)));
});

test('Play Store: combined handoff refuses to send when the required ZIP is absent',async()=>{
  const cdp=fakeCdp({pointerSends:true,attachmentReady:false});
  await assert.rejects(
    __testHooks.sendPrompt(cdp,'YARDMASTER MISSING ZIP PROBE',null,{
      sendTimeoutMs:250,
      confirmMs:20,
      attachmentConfirmMs:40,
      requiredAttachmentName:'Yardmaster-Handoff-Missing.zip'
    }),
    /lost or did not finish attaching/i
  );
  assert.equal(cdp.calls.some(c=>c.kind==='eval'&&c.expression.includes('YM_SEND_TARGET')),false,'send controls must never be touched without the required ZIP');
});


test('Play Store regression: multiline repair prompt is flattened before trusted typing so Edge cannot drop newline characters',async()=>{
  const cdp=fakeCdp({pointerSends:true});
  await __testHooks.sendPrompt(cdp,'YARDMASTER LINE ONE\n\nYARDMASTER LINE TWO',null,{sendTimeoutMs:1000,confirmMs:80});
  const typed=cdp.calls
    .filter(c=>c.kind==='send'&&c.method==='Input.dispatchKeyEvent'&&c.params.type==='char')
    .map(c=>String(c.params.text||''))
    .join('');
  assert.equal(typed,'YARDMASTER LINE ONE YARDMASTER LINE TWO');
  assert.equal(typed.includes('\n'),false,'trusted character input must never try to type newline code points');
  const verify=cdp.calls.find(c=>c.kind==='eval'&&c.expression.includes('YM_VERIFY_TRUSTED_PROMPT'));
  assert.ok(verify?.expression.includes('YARDMASTER LINE ONE YARDMASTER LINE TWO'),'verification must use the same flattened text that was typed');
});
