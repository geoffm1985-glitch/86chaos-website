import {test,expect} from '@playwright/test';
import vm from 'node:vm';
import {readWebsite} from '../helpers/website-push-fixture.mjs';
import {mobileFailedGrep,failedTitles} from '../../scripts/mobile-failed-selection.mjs';

test('@mobile notification worker waits for completed activation and rejects failed activation',async()=>{
  const code=readWebsite('mobile.js').split('async function waitForPushWorker')[1].split('let pushRepairBusy')[0],context={setTimeout,clearTimeout};
  vm.runInNewContext('async function waitForPushWorker'+code+';this.wait=waitForPushWorker',context);
  const worker=new EventTarget();worker.state='activating';let done=false;
  const pending=context.wait({active:worker}).then(()=>done=true);await new Promise(r=>setTimeout(r,25));expect(done).toBe(false);worker.state='activated';worker.dispatchEvent(new Event('statechange'));await pending;expect(done).toBe(true);
  worker.state='activating';const failed=context.wait({active:worker});worker.state='redundant';worker.dispatchEvent(new Event('statechange'));expect(await failed.catch(error=>error.message)).toContain('could not activate');
});
test('@mobile targeted runner selects mobile tests and every previous failure without unrelated passed tests',()=>{
  const selected=new RegExp(mobileFailedGrep);for(const title of failedTitles)expect(selected.test('profile > '+title)).toBe(true);expect(selected.test('@mobile Android Chrome > pairing')).toBe(true);expect(selected.test('clean composer uploads one ZIP and ignores a decoy file input')).toBe(false);
});
