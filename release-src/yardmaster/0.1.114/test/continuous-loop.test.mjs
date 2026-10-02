import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {plannedTestType,completeFirstFull,TEST_TYPES} from '../automation/loop-test-plan.mjs';
import {createContinuousLoopFixture,driveContinuousCycles,eventually} from './helpers/continuous-loop-fixture.mjs';

test('Play Store: full-first policy retains full on interrupted resume, then delta after completion, preserving operator selection',()=>{
  const workflow={closedLoop:true,testPlan:'full-then-delta',fullFirstComplete:false};
  assert.equal(plannedTestType('full-then-delta',workflow),'full');assert.equal(plannedTestType('delta',workflow),'full');
  const resumed=JSON.parse(JSON.stringify(workflow));assert.equal(plannedTestType('full-then-delta',resumed),'full');
  assert.equal(completeFirstFull(workflow,{testType:'delta'}),false);assert.equal(workflow.fullFirstComplete,false);
  assert.equal(completeFirstFull(workflow,{testType:'full'}),true);assert.equal(plannedTestType('full-then-delta',workflow),'delta');
  assert.equal(plannedTestType('full-then-delta',JSON.parse(JSON.stringify(workflow))),'delta');
  for(const type of ['full','delta','targeted'])assert.equal(plannedTestType(type,{closedLoop:true,testPlan:type}),type);
  assert.ok(TEST_TYPES.includes('full-then-delta'));
});
test('Play Store: continuous full -> handoff -> delayed reply -> ZIP apply -> delta -> local push -> delayed deploy -> failed delta -> second handoff -> repair -> deploy -> PASS',async()=>{
  const f=await createContinuousLoopFixture();
  try{await f.api('/api/action',{action:'start'});await driveContinuousCycles(f)}finally{await f.close()}
});
test('Play Store: initially passing full-first loop stops without a handoff or push and a new loop starts with full again',async()=>{
  const f=await createContinuousLoopFixture({initialLevel:2});
  try{
    for(let i=1;i<=2;i++){
      await f.api('/api/action',{action:'start'});await eventually(async()=>{const s=await f.status();return f.runs().length===i&&s.workflow.state==='complete'&&!s.workflow.closedLoop});
      assert.deepEqual(f.runs().map(x=>x.type),Array(i).fill('full'));assert.equal(f.chats.length,0);assert.equal(f.identityChecks.length,0);
    }
    assert.equal(f.git(['--git-dir',f.remote,'rev-parse','refs/heads/testing']),f.baseline);
  }finally{await f.close()}
});
test('Play Store: full-first loop selector is available in native and hosted mobile controls',()=>{
  for(const file of ['../public/index.html','fixtures/website/yardmaster.astro'])assert.match(fs.readFileSync(new URL(file,import.meta.url),'utf8'),/<option value="full-then-delta">Full first → Failed \/ Delta<\/option>/);
});
