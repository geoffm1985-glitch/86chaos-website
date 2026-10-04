import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {__testHooks as hooks} from '../automation/chatgpt.mjs';

test('Play Store: connection interruption recovers the existing handoff despite a stale Stop button',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ym-interruption-'));
  let recoveries=0;
  try{
    const cdp={eval:async()=>({interrupted:true,generating:false,href:'https://chatgpt.com/c/saved'})};
    const file=await hooks.waitRepair(cdp,dir,new Map(),()=>{},()=>false,0,{dataDir:dir,recoverInterruptedResponse:async(_cdp,activity)=>{
      assert.equal(activity.href,'https://chatgpt.com/c/saved');recoveries++;
      const file=path.join(dir,'fixed.zip');fs.writeFileSync(file,'fixture');fs.utimesSync(file,new Date(0),new Date(0));
    }},3000);
    assert.equal(path.basename(file),'fixed.zip');assert.equal(recoveries,1);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('Play Store: persistent connection interruption exhausts five retries even when recovery throws, and retains the report',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ym-interruption-bounded-'));
  const handoff=path.join(dir,'saved-report.txt');fs.writeFileSync(handoff,'failed check evidence');let attempts=0;
  try{
    await assert.rejects(hooks.waitRepair({eval:async()=>({interrupted:attempts===0,href:'saved-chat'})},dir,new Map(),()=>{},()=>false,0,{dataDir:dir,interruptionRetryMs:1,recoverInterruptedResponse:async(_cdp,_state,_status,attempt)=>{attempts++;assert.equal(attempt,attempts);await new Promise(r=>setTimeout(r,3));throw new Error('Temporary connection failure')}},3000),error=>error.code==='CHATGPT_CONNECTION_INTERRUPTED');
    assert.equal(attempts,5);assert.equal(fs.readFileSync(handoff,'utf8'),'failed check evidence');
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('Play Store: Retry alternates with three refresh-and-finish attempts before asking for help',()=>{
  assert.deepEqual([1,2,3,4,5].map(attempt=>hooks.interruptionRecoveryStep({retryPoint:{x:50,y:75}},attempt)),['retry','refresh','retry','refresh','refresh']);
  assert.deepEqual([1,2,3,4,5].map(attempt=>hooks.interruptionRecoveryStep({},attempt)),Array(5).fill('refresh'));
});
test('Play Store: interruption Retry uses trusted pointer events rather than resending the failure ZIP',async()=>{
  const events=[];
  const result=await hooks.recoverInterruptedResponse({send:async(method,params)=>events.push({method,...params})},{retryPoint:{x:50,y:75}},()=>{});
  assert.equal(result,'retry');assert.deepEqual(events.map(e=>e.type),['mouseMoved','mousePressed','mouseReleased']);assert.ok(events.every(e=>e.method==='Input.dispatchMouseEvent'));
});
