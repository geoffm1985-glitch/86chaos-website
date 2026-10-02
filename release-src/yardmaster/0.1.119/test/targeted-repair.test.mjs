import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {stopFixture} from './helpers/fixture-cleanup.mjs';
import {findControlSection} from './helpers/mobile-control.mjs';
import {repairGrep,repairedTitles,repairProjects} from '../scripts/repair-190-selection.mjs';
import fs from 'node:fs';

test('fixture cleanup waits for process close before deleting Windows-locked files',async()=>{
  const child=new EventEmitter(),order=[];child.kill=()=>assert.fail('Graceful close should not kill');
  await stopFixture({child,temp:'fixture-only',graceMs:100,shutdown:async()=>{setTimeout(()=>{order.push('close');child.emit('close')},25)},remove:(dir,options)=>{order.push('remove');assert.equal(dir,'fixture-only');assert.deepEqual(options,{recursive:true,force:true,maxRetries:10,retryDelay:100})}});
  assert.deepEqual(order,['close','remove']);assert.equal(child.listenerCount('close'),0);
});
test('forced fixture termination also waits for close before deletion',async()=>{
  const child=new EventEmitter(),order=[];child.kill=signal=>{assert.equal(signal,'SIGKILL');order.push('kill');setTimeout(()=>{order.push('close');child.emit('close')},10)};
  await stopFixture({child,temp:'fixture-only',graceMs:10,killMs:100,shutdown:async()=>{},remove:()=>order.push('remove')});assert.deepEqual(order,['kill','close','remove']);assert.equal(child.listenerCount('close'),0);
});
test('unclosed fixture retains files and reports a bounded cleanup failure',async()=>{
  const child=new EventEmitter();child.kill=()=>{};
  await assert.rejects(stopFixture({child,temp:'fixture-only',graceMs:5,killMs:5,shutdown:async()=>{},remove:()=>assert.fail('Process still holds files')}),/temporary files were retained/);assert.equal(child.listenerCount('close'),0);
});
test('detached dynamic phone row retries section discovery until Settings is attached',async()=>{
  let calls=0;const locator={evaluate:async()=>++calls===1?undefined:'settings'};assert.equal(await findControlSection(locator,{timeoutMs:100,pollMs:5}),'settings');assert.equal(calls,2);
});
test('phone control without an attached section fails explicitly instead of clicking hidden UI',async()=>{
  await assert.rejects(findControlSection({evaluate:async()=>undefined},{timeoutMs:10,pollMs:2}),/no attached section/);
});
test('repair rerun includes only the three failed PC/Android tests and exact helper regressions',()=>{
  const selected=new RegExp(repairGrep);for(const title of repairedTitles)assert.ok(selected.test(title));assert.equal(selected.test('PWA install uses the browser prompt and gives a menu fallback'),false);assert.equal(selected.test('all eight tabs render within phone width and block pinch zoom'),false);assert.deepEqual(repairProjects,['desktop-and-regressions','mobile-android']);
  const source=fs.readFileSync(new URL('./playwright/operations-intelligence.e2e.spec.mjs',import.meta.url),'utf8');assert.match(source,/test\.setTimeout\(120000\)/);
});
