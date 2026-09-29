import test from 'node:test';
import assert from 'node:assert/strict';
import {__testHooks} from '../automation/chatgpt.mjs';

function fakeCdp({pointerSends=false,enterSends=false,transitionSends=false,attachmentReady=true}={}){
  const calls=[];let sent=false,generating=false,trustedFilled=false;
  return {
    calls,
    async eval(expression){
      calls.push({kind:'eval',expression});
      if(expression.includes('YM_SEND_BASELINE'))return {userMessages:0,href:'https://chatgpt.com/',stopVisible:false};
      if(expression.includes('YM_TRUSTED_FILL_PROMPT'))return true;
      if(expression.includes('YM_VERIFY_TRUSTED_PROMPT'))return {ok:trustedFilled,length:42};
      if(expression.includes('YM_VERIFY_ATTACHMENT'))return {ok:attachmentReady,busy:false};
      if(expression.includes('YM_VERIFY_PROMPT_SENT')){
        if(sent)return {confirmed:true,reason:'user-message',userMessage:true,messageCount:1,composerCleared:true,composerLength:0,stopVisible:false,generationStarted:false,routeChanged:true,conversationRoute:true,href:'https://chatgpt.com/c/fixture'};
        if(generating)return {confirmed:true,reason:'generation-transition',userMessage:false,messageCount:0,composerCleared:true,composerLength:0,stopVisible:true,generationStarted:true,routeChanged:true,conversationRoute:true,href:'https://chatgpt.com/c/fixture'};
        return {confirmed:false,reason:null,userMessage:false,messageCount:0,composerCleared:false,composerLength:42,stopVisible:false,generationStarted:false,routeChanged:false,conversationRoute:false,href:'https://chatgpt.com/'};
      }
      if(expression.includes('YM_SEND_TARGET'))return trustedFilled?{found:true,enabled:true,topIsButton:true,x:120,y:240,label:'Send'}:{found:false};
      if(expression.includes('YM_FOCUS_COMPOSER'))return true;
      return null;
    },
    async send(method,params){
      calls.push({kind:'send',method,params});
      if(method==='Input.dispatchKeyEvent'&&params.type==='char'&&String(params.text||'').length)trustedFilled=true;
      if(method==='Input.dispatchMouseEvent'&&params.type==='mouseReleased'&&pointerSends&&trustedFilled)sent=true;
      if(method==='Input.dispatchMouseEvent'&&params.type==='mouseReleased'&&transitionSends&&trustedFilled)generating=true;
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

test('Play Store regression: live generation transition confirms send even before ChatGPT exposes a user-message node',async()=>{
  const cdp=fakeCdp({transitionSends:true});
  const status=[];
  await __testHooks.sendPrompt(cdp,'YARDMASTER LIVE GENERATION EVIDENCE',m=>status.push(m),{sendTimeoutMs:1000,confirmMs:80});
  const checks=cdp.calls.filter(c=>c.kind==='eval'&&c.expression.includes('YM_VERIFY_PROMPT_SENT'));
  assert.ok(checks.length>0);
  assert.ok(checks.some(c=>c.expression.includes('generationStarted')&&c.expression.includes('composerCleared')&&c.expression.includes('conversationRoute')));
  assert.ok(status.includes('Repair prompt sent to ChatGPT.'));
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


test('Play Store regression: sandbox PowerShell response is recovered when ChatGPT omits the legacy assistant-role node',async()=>{
  const protocol=['YARDMASTER','POWERSHELL',"Set-Content -LiteralPath '.\\chatgpt-powershell-marker.txt' -Value 'CHATGPT-POWERSHELL-ROUNDTRIP'",'END_POWERSHELL','END'].join('\n');
  const calls=[];
  const cdp={
    async eval(expression){
      calls.push(expression);
      if(expression.includes('YM_LATEST_ASSISTANT_TEXT'))return '';
      if(expression.includes('document.body?.innerText'))return 'ChatGPT\nWorked for 10s\nAnalyzed\n'+protocol+'\nCopy\nGood response';
      return null;
    }
  };
  const found=await __testHooks.assistantProtocol(cdp);
  assert.equal(found.source,'page-fallback');
  assert.equal(found.protocol,protocol);
  assert.ok(calls.some(x=>x.includes('YM_LATEST_ASSISTANT_TEXT')));
});

test('Play Store regression: Yardmaster protocol extraction ignores ordinary prompt text and returns the complete command block',()=>{
  const ordinary='Yardmaster full-process sandbox test. Return a PowerShell instruction, then a ZIP.';
  assert.equal(__testHooks.extractYardmasterProtocol(ordinary),'');
  const block=['YARDMASTER','POWERSHELL','Write-Output fixture','END_POWERSHELL','END'].join('\n');
  assert.equal(__testHooks.extractYardmasterProtocol('Worked for 10s\nAnalyzed\n'+block+'\nCopy'),block);
});
