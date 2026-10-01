import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('1.86 mobile parity uses section tabs, blocks zoom, timestamps live status and exposes every desktop section',()=>{
  const html=read('public/index.html'),css=read('public/styles.css'),app=read('public/app.js');
  assert.match(html,/maximum-scale=1,user-scalable=no/);assert.match(app,/gesturestart/);assert.match(app,/ctrlKey/);
  for(const section of ['operations','runs','branches','queue','chatgpt','deployments','settings','intelligence'])assert.match(html,new RegExp('mobile-tabbar[\\s\\S]*data-nav="'+section+'"'));
  assert.match(css,/grid-template-columns:repeat\(4,1fr\)/);assert.match(html,/liveStatusTimestamp/);assert.match(html,/intelUpdatedAt/);assert.match(app,/Updated .*toLocaleTimeString/);
});

test('1.86 authenticated mobile API has the same protected controls and evidence access as desktop',()=>{
  const server=read('server.mjs');
  for(const action of ['restore-last-snapshot','shutdown-operator','full-self-test','adopt-running-test','revoke-device','save-self-test-diagnostic'])assert.match(server,new RegExp("action==='"+action+"'"));
  assert.doesNotMatch(server,/Remote evidence download is limited/);assert.doesNotMatch(server,/full sandbox self-test can only be started from the Windows PC/);assert.doesNotMatch(server,/Snapshot restore is available only from the Windows dashboard/);assert.doesNotMatch(server,/Trusted-device revocation is available only from the Windows dashboard/);assert.doesNotMatch(server,/Saving self-test diagnostics directly is available only from the Windows desktop/);
  assert.match(server,/operator-screenshot/);assert.doesNotMatch(server,/Mobile live screenshot is disabled/);
});

test('resume failed handoff is surfaced as active Operations work and continuous ChatGPT route advances mode/model selections',()=>{
  const server=read('server.mjs'),html=read('public/index.html');
  assert.match(server,/wf\.resumeStartedAt=Date\.now\(\)/);assert.match(server,/workflowBusy/);assert.match(server,/phase:'chatgpt'/);
  assert.match(server,/parseChatLoopPlan/);assert.match(server,/nextChatLoopSelection/);assert.match(server,/chatLoopIndex/);assert.match(server,/selection\.mode/);assert.match(server,/selection\.model/);assert.match(server,/selection\.thinkingEffort/);
  assert.match(html,/Rotate modes\/models during continuous loop/);assert.match(html,/Continuous Loop Route/);
});

test('Windows taskbar identity is consistent and the full in-app process validates every 1.86 implementation',()=>{
  const desktop=read('desktop.cjs'),legacy=read('electron-main.cjs'),installer=read('scripts/Install-Yardmaster.ps1'),updater=read('scripts/Update-Yardmaster.ps1'),self=read('automation/full-self-test.mjs'),pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.version,'0.1.100');
  for(const src of [desktop,legacy])assert.match(src,/com\.chiltonappworks\.yardmaster/);assert.match(legacy,/yardmaster-icon\.ico/);assert.match(installer,/yardmaster-icon\.ico/);assert.match(updater,/yardmaster-icon\.ico/);
  assert.match(self,/featureParity:'pending'/);assert.match(self,/feature-parity preflight passed/);assert.ok(self.includes('Full process expected Yardmaster '+pkg.version));
});
