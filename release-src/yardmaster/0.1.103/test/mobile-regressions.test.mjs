import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {readWebsite} from './helpers/website-push-fixture.mjs';
import {mobileFailedGrep,failedTitles,mobileNodeFiles} from '../scripts/mobile-failed-selection.mjs';

function workerWait(worker){
  const code=readWebsite('mobile.js').split('async function waitForPushWorker')[1].split('let pushRepairBusy')[0];
  const context={setTimeout,clearTimeout};vm.runInNewContext('async function waitForPushWorker'+code+';this.wait=waitForPushWorker',context);return context.wait({active:worker});
}
test('push waits through activating state and removes its listener after activation',async()=>{
  const worker=new EventTarget();worker.state='activating';let finished=false;
  const pending=workerWait(worker).then(()=>finished=true);await new Promise(r=>setTimeout(r,20));assert.equal(finished,false);
  worker.state='activated';worker.dispatchEvent(new Event('statechange'));await pending;assert.equal(finished,true);
});
test('push rejects a redundant worker and accepts one already activated',async()=>{
  const worker=new EventTarget();worker.state='activating';const pending=workerWait(worker);worker.state='redundant';worker.dispatchEvent(new Event('statechange'));await assert.rejects(pending,/could not activate/);
  await workerWait({state:'activated'});await assert.rejects(workerWait(null),/unavailable/);
});
test('every navigation selector in repaired specs targets the visible desktop or phone control',()=>{
  for(const file of ['full-app','operations-intelligence','resumable-pause-docked-chatgpt']){
    const source=fs.readFileSync(new URL('./playwright/'+file+'.e2e.spec.mjs',import.meta.url),'utf8');
    const selectors=[...source.matchAll(/\[data-nav=[^\]]+\]([^'"`\s]*)/g)];assert.ok(selectors.length);for(const m of selectors)assert.equal(m[1],':visible');
  }
});
test('mobile preview expectation follows the current UI and Windows lifecycle retains all controls with a bounded budget',()=>{
  const layout=fs.readFileSync(new URL('./playwright/desktop-layout.e2e.spec.mjs',import.meta.url),'utf8');assert.match(layout,/#mobileChatGPTPreview.*toBeVisible/);
  const lifecycle=fs.readFileSync(new URL('./playwright/yardmaster.e2e.spec.mjs',import.meta.url),'utf8').split("test('start, pause, resume, and stop controls")[1];assert.match(lifecycle,/test.setTimeout\(90000\)/);for(const state of ['start','pause','resume','stop'])assert.ok(lifecycle.includes('data-action="'+state+'"'));
});
test('targeted selection includes all failed titles and mobile profiles while excluding unrelated passed tests',()=>{
  const selection=new RegExp(mobileFailedGrep);for(const title of failedTitles)assert.ok(selection.test('fixture > '+title));assert.ok(selection.test('@mobile Android Chrome > pairing'));assert.equal(selection.test('all configuration fields persist and invalid enum values fall back safely'),false);assert.equal(selection.test('clean composer uploads one ZIP and ignores a decoy file input'),false);assert.deepEqual(mobileNodeFiles,['test/mobile-pwa.test.mjs','test/mobile-regressions.test.mjs']);
});
