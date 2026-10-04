import {test} from 'node:test';
import assert from 'node:assert/strict';
import {interruptedRunAction} from '../automation/interrupted-run.mjs';
const saved={run:{state:'running'},workflow:{state:'testing',closedLoop:true}};
test('restart recovers a saved closed loop with no surviving test worker',()=>assert.equal(interruptedRunAction(saved),'resume'));
test('surviving verified gate is adopted instead of duplicated',()=>assert.equal(interruptedRunAction({...saved,adoptable:true}),'adopt'));
test('healthy workers, paused work and active handoffs are left alone',()=>{
 for(const change of [{owned:true},{paused:true},{workflow:{state:'chatgpt',closedLoop:true}},{workflow:{state:'testing',closedLoop:false}}])assert.equal(interruptedRunAction({...saved,...change}),'none');
});
test('repeated operator exits are bounded and surfaced',()=>assert.equal(interruptedRunAction({...saved,workflow:{...saved.workflow,operatorRecoveryAttempts:3}}),'blocked'));
