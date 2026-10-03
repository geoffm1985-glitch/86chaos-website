import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {__testHooks} from '../automation/chatgpt.mjs';

function composerFixture(transform,actualText=text=>text) {
  const calls=[];
  let typed='',sent=false;
  const editor={get innerText(){return transform(typed)},get textContent(){return actualText(typed)},
    getBoundingClientRect:()=>({width:500,height:100}),getAttribute:()=>null,
    closest:()=>null,contentEditable:'true',focus(){}};
  const context={document:{querySelectorAll:()=>[editor]},getComputedStyle:()=>({display:'block',visibility:'visible'}),
    HTMLTextAreaElement:class {},HTMLInputElement:class {}};
  return {calls,async eval(expression){
    calls.push({expression});
    if(expression.includes('YM_VERIFY_TRUSTED_PROMPT'))return vm.runInNewContext(expression,context);
    if(expression.includes('YM_TRUSTED_FILL_PROMPT'))return true;
    if(expression.includes('YM_SEND_BASELINE'))return {userMessages:0,assistantMessages:0,href:'https://chatgpt.com/'};
    if(expression.includes('YM_VERIFY_PROMPT_SENT'))return {confirmed:sent,userMessage:sent,composerCleared:sent};
    if(expression.includes('YM_SEND_TARGET'))return {found:true,enabled:true,topIsButton:true,x:10,y:20};
    return null;
  },async send(method,params){
    calls.push({method,params});
    if(params.key==='Backspace'&&params.type==='rawKeyDown')typed='';
    if(method==='Input.insertText')typed+=params.text;
    if(params.type==='char')typed+=params.text;
    if(method==='Input.dispatchMouseEvent'&&params.type==='mouseReleased')sent=true;
  }};
}

test('handoff normalization: editor filler and wrapped whitespace do not prevent verified send',async()=>{
  const cdp=composerFixture(text=>'\u200b'+text.replaceAll(' ','\u00a0\n')+'\ufeff');
  await __testHooks.sendPrompt(cdp,'YARDMASTER REPAIR '+('verified complete prompt '.repeat(65)),null,{sendTimeoutMs:1000,confirmMs:30});
  assert.equal(cdp.calls.filter(x=>x.params?.type==='char').length,0);
  assert.equal(cdp.calls.filter(x=>x.params?.type==='mouseReleased').length,1);
});

test('handoff normalization: rendered line break inside a word does not trigger character fallback',async()=>{
  const cdp=composerFixture(text=>text.slice(0,7)+'\n'+text.slice(7));
  await __testHooks.sendPrompt(cdp,'YARDMASTER COMPLETE PROMPT',null,{sendTimeoutMs:1000,confirmMs:30});
  assert.equal(cdp.calls.filter(x=>x.params?.type==='char').length,0);
  assert.equal(cdp.calls.filter(x=>x.params?.type==='mouseReleased').length,1);
});

test('handoff normalization: an altered or incomplete prompt still refuses submission',async()=>{
  const cdp=composerFixture(text=>text.slice(0,-1),text=>text.slice(0,-1));
  await assert.rejects(__testHooks.sendPrompt(cdp,'COMPLETE PROMPT REQUIRED',null,{sendTimeoutMs:100,confirmMs:20}),/did not accept the complete/);
  assert.equal(cdp.calls.filter(x=>x.params?.type==='mouseReleased').length,0);
});
