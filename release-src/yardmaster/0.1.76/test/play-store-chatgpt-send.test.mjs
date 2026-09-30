import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {__testHooks} from '../automation/chatgpt.mjs';

function fakeCdp({pointerSends=false,enterSends=false,transitionSends=false,assistantActivitySends=false,composerClearsOnPointer=false,assistantDelayMs=0,attachmentReady=true}={}){
  const calls=[];let sent=false,generating=false,assistantActive=false,trustedFilled=false,composerCleared=false,assistantAt=0;
  return {
    calls,
    async eval(expression){
      calls.push({kind:'eval',expression});
      if(expression.includes('YM_SEND_BASELINE'))return {userMessages:0,assistantMessages:0,assistantText:'',href:'https://chatgpt.com/',stopVisible:false};
      if(expression.includes('YM_TRUSTED_FILL_PROMPT'))return true;
      if(expression.includes('YM_VERIFY_TRUSTED_PROMPT'))return {ok:trustedFilled,length:42};
      if(expression.includes('YM_VERIFY_ATTACHMENT'))return {ok:attachmentReady,busy:false};
      if(expression.includes('YM_VERIFY_PROMPT_SENT')){
        if(assistantAt&&Date.now()>=assistantAt)assistantActive=true;
        if(sent)return {confirmed:true,reason:'user-message',userMessage:true,messageCount:1,composerCleared:true,composerLength:0,stopVisible:false,generationStarted:false,routeChanged:true,conversationRoute:true,href:'https://chatgpt.com/c/fixture'};
        if(generating)return {confirmed:true,reason:'generation-transition',userMessage:false,messageCount:0,assistantMessages:0,assistantAdvanced:false,assistantLength:0,composerCleared:true,composerLength:0,stopVisible:true,generationStarted:true,routeChanged:true,conversationRoute:true,href:'https://chatgpt.com/c/fixture'};
        if(assistantActive)return {confirmed:true,reason:'assistant-activity',userMessage:false,messageCount:0,assistantMessages:1,assistantAdvanced:true,assistantLength:42,composerCleared:true,composerLength:0,stopVisible:false,generationStarted:false,routeChanged:true,conversationRoute:true,href:'https://chatgpt.com/c/fixture'};
        return {confirmed:false,reason:null,userMessage:false,messageCount:0,assistantMessages:0,assistantAdvanced:false,assistantLength:0,composerCleared,composerLength:composerCleared?0:42,stopVisible:false,generationStarted:false,routeChanged:false,conversationRoute:false,href:'https://chatgpt.com/'};
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
      if(method==='Input.dispatchMouseEvent'&&params.type==='mouseReleased'&&assistantActivitySends&&trustedFilled)assistantActive=true;
      if(method==='Input.dispatchMouseEvent'&&params.type==='mouseReleased'&&composerClearsOnPointer&&trustedFilled){composerCleared=true;assistantAt=Date.now()+Math.max(0,Number(assistantDelayMs)||0)}
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
    __testHooks.sendPrompt(cdp,'YARDMASTER FILLED BUT UNSENT PROBE',null,{sendTimeoutMs:350,confirmMs:20,finalConfirmationMs:100}),
    /no submitted user message or response activity appeared/i
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

test('Play Store regression: trusted send that clears the composer waits for delayed assistant activity instead of pressing Enter or submitting the form again',async()=>{
  const cdp=fakeCdp({composerClearsOnPointer:true,assistantDelayMs:250});
  const status=[];
  await __testHooks.sendPrompt(cdp,'YARDMASTER DELAYED COMPOSER-CLEAR EVIDENCE',m=>status.push(m),{sendTimeoutMs:220,confirmMs:30,finalConfirmationMs:1200});
  assert.ok(status.some(x=>/cleared the composer/i.test(x)),'composer-clear grace should be visible in status');
  assert.ok(status.some(x=>/accepted the handoff and response activity is visible/i.test(x)));
  const enterAfterPointer=cdp.calls.some(c=>c.kind==='send'&&c.method==='Input.dispatchKeyEvent'&&c.params?.key==='Enter');
  const syntheticFallback=cdp.calls.some(c=>c.kind==='eval'&&c.expression.includes('YM_SYNTHETIC_SEND_FALLBACK'));
  assert.equal(enterAfterPointer,false,'Yardmaster must not press Enter after a trusted send already cleared the composer');
  assert.equal(syntheticFallback,false,'Yardmaster must not requestSubmit after a trusted send already cleared the composer');
});

test('Play Store regression: assistant response activity confirms a handoff even when ChatGPT never exposes the submitted user-message node',async()=>{
  const cdp=fakeCdp({assistantActivitySends:true});
  const status=[];
  await __testHooks.sendPrompt(cdp,'YARDMASTER ASSISTANT ACTIVITY EVIDENCE',m=>status.push(m),{sendTimeoutMs:1000,confirmMs:80,finalConfirmationMs:300});
  const checks=cdp.calls.filter(c=>c.kind==='eval'&&c.expression.includes('YM_VERIFY_PROMPT_SENT'));
  assert.ok(checks.some(c=>c.expression.includes('assistantAdvanced')&&c.expression.includes('assistant-activity')));
  assert.ok(status.includes('Repair prompt sent to ChatGPT.'));
});

test('Play Store contract: ChatGPT activity watchdog waits twenty minutes before stall recovery and treats active generation as progress',()=>{
  const source=fs.readFileSync(new URL('../automation/chatgpt.mjs',import.meta.url),'utf8');
  assert.match(source,/stallMs\|\|20\*60\*1000/);
  assert.match(source,/if\(responseActivityChanged\(lastActivity,activityState\)\)/);
  assert.match(source,/if\(!generating&&Date\.now\(\)-lastProgress>stallMs/);
  assert.match(source,/ChatGPT is actively working on the repair\. Yardmaster will keep waiting/);
  assert.match(source,/timeoutMs=4\*60\*60\*1000/);
  assert.match(source,/finalConfirmationMs\|\|180000/);
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


test('Play Store regression: second sandbox run recognizes a repaired ZIP even when Edge reuses the same filename',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster-download-reuse-'));
  try{
    const file=path.join(dir,'Yardmaster-Self-Test-Handoff-REPAIRED-0.0.2.zip');
    fs.writeFileSync(file,'first-run');
    const before=__testHooks.snapshotDownloads(dir);
    await new Promise(r=>setTimeout(r,20));
    fs.writeFileSync(file,'second-run-with-same-name');
    const stat=fs.statSync(file);
    const found=__testHooks.findFreshDownloadedZip(dir,before,{minimumAgeMs:0,now:stat.mtimeMs+1});
    assert.equal(found,file,'same-path replacement from the second run must count as a fresh repair ZIP');
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('Play Store regression: an in-progress repair download suppresses repeated download clicks',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster-download-active-'));
  try{
    const before=__testHooks.snapshotDownloads(dir);
    fs.writeFileSync(path.join(dir,'fixture.zip.crdownload'),'partial');
    assert.equal(__testHooks.hasFreshDownloadActivity(dir,before),true);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});


test('Play Store contract: attachment verification treats a stable trusted file-input selection as confirmation when ChatGPT hides the filename chip',async()=>{
  let checks=0;
  const cdp={
    async eval(expression){
      if(expression.includes('YM_VERIFY_ATTACHMENT')){checks++;return {ok:false,visibleHit:false,selected:true,busy:false,failed:false,selectedFiles:['86chaos-release-gate-SLIM-UPLOAD-ME.zip'],errors:''}}
      return null;
    }
  };
  const started=Date.now();
  const ok=await __testHooks.attachmentConfirmed(cdp,'86chaos-release-gate-SLIM-UPLOAD-ME.zip',2500);
  assert.equal(ok,true);
  assert.ok(checks>=2);
  assert.ok(Date.now()-started>=800,'file-input selection must remain stable briefly before it is trusted');
});


test('Play Store regression: attachment evidence is scoped to the composer and duplicate upload fallback is bounded to one file input',()=>{
  const source=fs.readFileSync(new URL('../automation/chatgpt.mjs',import.meta.url),'utf8');
  const start=source.indexOf('async function attachFile(');
  assert.ok(start>=0,'attachFile source must exist');
  const tail=source.slice(start),next=tail.indexOf('\nasync function ',1);
  const attach=next>=0?tail.slice(0,next):tail;
  assert.match(source,/YM_REMOVE_STALE_ATTACHMENT/);
  assert.match(attach,/clearComposerAttachments/);
  assert.match(attach,/const nodeId=\[\.\.\.\(q\.nodeIds\|\|\[\]\)\]\.at\(-1\)/);
  assert.doesNotMatch(attach,/for\(const nodeId of ids\.reverse\(\)\)/);
  assert.match(attach,/will not upload a duplicate copy/i);
});

test('Play Store regression: a selected composer file input is cleared even when no stale chip is visible',async()=>{
  let cleared=0;
  const cdp={
    async eval(expression){
      if(expression.includes('YM_REMOVE_STALE_ATTACHMENT'))return null;
      if(expression.includes('YM_MARK_SELECTED_COMPOSER_FILE_INPUTS'))return 1;
      return true;
    },
    async send(method,params){
      if(method==='DOM.getDocument')return {root:{nodeId:1}};
      if(method==='DOM.querySelectorAll')return {nodeIds:[7]};
      if(method==='DOM.setFileInputFiles'){assert.deepEqual(params.files,[]);cleared++;return {}}
      return {};
    }
  };
  const removed=await __testHooks.clearComposerAttachments(cdp,null,null);
  assert.equal(cleared,1);
  assert.equal(removed,1);
});

test('Play Store regression: a stale attachment is removed before a new handoff upload begins',async()=>{
  let removeCalls=0;
  const cdp={
    async eval(expression){
      if(expression.includes('YM_REMOVE_STALE_ATTACHMENT'))return removeCalls++===0?{x:10,y:10,label:'Remove file'}:null;
      if(expression.includes('YM_ATTACHMENT_EVIDENCE'))return {ok:false,selected:false,visibleHit:false,busy:false,failed:false,attachmentCount:0,selectedFiles:[]};
      return null;
    },
    async send(method){if(method==='Input.dispatchMouseEvent')return {};return {}}
  };
  const removed=await __testHooks.clearComposerAttachments(cdp,null,null);
  assert.equal(removed,1);
});
