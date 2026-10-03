import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {__testHooks} from '../automation/chatgpt.mjs';
import {attentionMessage} from '../automation/chatgpt-attention.mjs';
const action={service:'YepCode',kind:'connector-reconnect'};
const error=Object.assign(new Error(attentionMessage(action)),{code:'CHATGPT_ACTION_REQUIRED',requiredAction:action});
function handler(state){
 const source=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
 const fn=source.slice(source.indexOf('function holdChatGPTForAction('),source.indexOf('function operatorStatusSnapshot('));
 const pushes=[];
 return {hold:vm.runInNewContext(fn+'\nholdChatGPTForAction;',{state,Date,activity(){},persist(){},notify(...args){pushes.push(args)}}),pushes};
}
test('Play Store: an expired connection pauses before any refresh or repeat submission, keeping the report',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ym-attention-')),report=path.join(dir,'saved-failure.zip');fs.writeFileSync(report,'preserved report');
 try{
  const cdp={eval:async expression=>{assert.ok(expression.includes('YM_CHAT_REQUIRED_ACTION'));return action},send(){assert.fail('Do not retry a required user sign-in')}};
  await assert.rejects(__testHooks.waitRepair(cdp,dir,new Map([[report,fs.statSync(report).mtimeMs]]),()=>{},()=>false,0,{},1000),e=>e.code==='CHATGPT_ACTION_REQUIRED'&&e.requiredAction.service==='YepCode');
  assert.equal(fs.readFileSync(report,'utf8'),'preserved report');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('Play Store: required action sends one specific alert and retains the failure checkpoint',()=>{
 const state={workflow:{state:'chatgpt',handoffPath:'saved-report.zip',repairAttempts:2},selfHeal:{state:'idle'}};
 const {hold,pushes}=handler(state);assert.equal(hold(error),true);assert.equal(hold(error),true);
 assert.equal(state.workflow.state,'waiting-action');assert.equal(state.workflow.handoffPath,'saved-report.zip');assert.equal(state.workflow.repairAttempts,2);
 assert.equal(state.selfHeal.state,'idle');assert.equal(pushes.length,1);assert.equal(pushes[0][0],'Yardmaster: your action is needed');
 assert.match(pushes[0][1],/reconnect YepCode/);assert.match(pushes[0][1],/Resume Handoff/);assert.match(pushes[0][1],/report is saved/);
 assert.equal(hold(new Error('unrelated failure')),false);
});
test('Play Store: any named connection gets the appropriate initial-connect, reconnect or sign-in instruction',()=>{
 for(const [service,kind,task] of [['Google Drive','connector-connect','connect'],['GitHub','connector-reconnect','reconnect'],['Calendar','connector-sign-in','sign in to']]){
  const message=attentionMessage({service,kind});assert.ok(message.includes(task+' '+service));assert.match(message,/report is saved/);
 }
});
test('Play Store: self-heal connection expiry pauses its diagnostic without another repair attempt',()=>{
 const state={workflow:{handoffPath:'86chaos-report.zip'},selfHeal:{state:'chatgpt',attempt:1,diagnostic:'yardmaster-diagnostic.zip'}};
 const {hold,pushes}=handler(state);assert.equal(hold(error,true),true);assert.equal(state.selfHeal.state,'waiting-action');assert.equal(state.selfHeal.attempt,1);
 assert.equal(state.selfHeal.diagnostic,'yardmaster-diagnostic.zip');assert.equal(state.workflow.handoffPath,'86chaos-report.zip');assert.equal(pushes.length,1);assert.match(pushes[0][1],/Resume Self-Heal/);
});
