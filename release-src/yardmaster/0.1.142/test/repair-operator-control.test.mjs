import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {assertManagedGateCommand,assertManagedRepairProtocol} from '../automation/loop-test-plan.mjs';
import {createContinuousLoopFixture,eventually} from './helpers/continuous-loop-fixture.mjs';
const rejected=e=>e.code==='POWERSHELL_COMMAND_FAILED';
test('Repair command: exact retained automated Stop API script is rejected before execution',()=>{
 const script=fs.readFileSync(new URL('./fixtures/automatic-stop-142.ps1',import.meta.url),'utf8');
 assert.throws(()=>assertManagedRepairProtocol('YARDMASTER\nPOWERSHELL\n'+script+'\nEND_POWERSHELL\nEND'),rejected);
});
test('Repair command: operator action, recursive command and configuration writes are refused',()=>{
 for(const endpoint of ['action','command','config'])assert.throws(()=>assertManagedGateCommand(`Invoke-RestMethod -Uri "$operatorBase/api/${endpoint}" -Method Post`),rejected);
});
test('Repair command: STOP is rejected before earlier preparation, while PowerShell error policy stays valid',()=>{
 assert.throws(()=>assertManagedRepairProtocol('YARDMASTER\nPOWERSHELL\nWrite-Output preparation\nEND_POWERSHELL\nSTOP\nEND'),rejected);
 assert.doesNotThrow(()=>assertManagedRepairProtocol("YARDMASTER\nPOWERSHELL\n$ErrorActionPreference = 'Stop'\nInvoke-RestMethod http://127.0.0.1:8787/api/status\nEND_POWERSHELL\nRUN delta\nEND"));
});
test('Repair command: an invalid later PowerShell block prevents partial preparation',()=>{
 assert.throws(()=>assertManagedRepairProtocol('YARDMASTER\nPOWERSHELL\nWrite-Output preparation\nEND_POWERSHELL\nPOWERSHELL\nInvoke-RestMethod "$operatorBase/api/action"\nEND_POWERSHELL\nEND'),rejected);
});
test('Repair command: real operator retains completed full checkpoint and repair wait after refusal; human Stop works',async()=>{
 const f=await createContinuousLoopFixture();try{
  await f.api('/api/action',{action:'start'});
  const before=await eventually(async()=>{const s=await f.status();return s.workflow.state==='chatgpt'&&s});
  const script=fs.readFileSync(new URL('./fixtures/automatic-stop-142.ps1',import.meta.url),'utf8');
  const response=await fetch(f.url+'/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'YARDMASTER\nPOWERSHELL\n'+script+'\nEND_POWERSHELL\nEND'})});
  assert.equal(response.status,500);assert.match(await response.text(),/must not call Yardmaster control APIs/);
  const after=await f.status();assert.equal(after.run.startedAt,before.run.startedAt);assert.equal(after.workflow.closedLoop,true);assert.equal(after.workflow.fullFirstComplete,true);assert.equal(after.workflow.state,'chatgpt');assert.equal(fs.existsSync(path.join(f.data,'powershell-runs')),false);
  await f.api('/api/action',{action:'stop'});assert.equal((await f.status()).workflow.state,'stopped');
 }finally{await f.close()}
});
