import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {releaseGateProgress} from '../automation/release-gate-progress.mjs';

test('published release metadata has a valid channel and matches both locked package versions',()=>{
 const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url))),lock=JSON.parse(fs.readFileSync(new URL('../package-lock.json',import.meta.url)));
 assert.ok(['production','testing'].includes(pkg.releaseChannel));assert.equal(pkg.version,lock.version);assert.equal(pkg.version,lock.packages[''].version);
 assert.equal(pkg.updateManifestUrl,'https://www.86chaos.com/yardmaster/release.json');
});
test('selected browser phase replaces preliminary counts without claiming cases passed',()=>{
 assert.deepEqual(releaseGateProgress('TOTAL SELECTED: 70'),{total:70,counts:{pass:0,fail:0,timeout:0,skip:0},currentTest:'Preparing selected Playwright cases',progress:0});
 assert.equal(releaseGateProgress('01. [chromium] spec :: selected test'),null);
});
test('real timeout reporter updates name and independent browser counters',()=>{
 const p=releaseGateProgress('[TIMEOUT] 02/70 chromium | 17.0.26 Phase 1 Spanish interface | a user can switch their own interface to Spanish | 2m 40s | running: 0 pass, 0 fail, 2 timeout, 0 skip');
 assert.equal(p.total,70);assert.deepEqual(p.counts,{pass:0,fail:0,timeout:2,skip:0});assert.equal(p.progress,3);assert.match(p.currentTest,/chromium.*Spanish interface.*switch/);assert.doesNotMatch(p.currentTest,/running:|2m 40s/);
});
test('final case output retains a sub-100 progress until process completion verifies success',()=>{
 const p=releaseGateProgress('[PASS] 70/70 mobile-chromium | bridge regression | 5s | running: 68 pass, 0 fail, 2 timeout, 0 skip');
 assert.equal(p.progress,99);assert.equal(p.counts.pass,68);assert.equal(p.counts.timeout,2);
});
