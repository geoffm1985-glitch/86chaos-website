import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const page=fs.readFileSync(path.join(root,'src/pages/yardmaster.astro'),'utf8');
const sw=fs.readFileSync(path.join(root,'public/yardmaster/sw.js'),'utf8');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'public/yardmaster/manifest.webmanifest'),'utf8'));
const release=JSON.parse(fs.readFileSync(path.join(root,'public/yardmaster/release.json'),'utf8'));
const inlineScript=page.match(/<script is:inline>([\s\S]*?)<\/script>/)?.[1];
assert.ok(inlineScript,'Yardmaster inline mobile script is missing');
new Function(inlineScript);
for(const marker of [
  'mDoing','mWaiting','mNext','operatorStatus','Resume Current Failed Test',
  'Upload Failed ZIP & Continue','update-operator-now','updatePcYardmaster',
  'mPushStatus','pushKeyMatches','ensurePush','needsResubscribe',
  'existing failed-test ZIP','data-act="resume-handoff"','mobileNewWork',
  'navigator.credentials','trycloudflare.com','ym-auth-pending','ym-authenticated',
  'data-mobile-section="operations"','data-mobile-section="runs"','data-mobile-section="branches"',
  'data-mobile-section="queue"','data-mobile-section="chatgpt"','data-mobile-section="deployments"',
  'data-mobile-section="settings"','data-mobile-section="intelligence"',
  'maximum-scale=1','user-scalable=no','mLiveUpdated','mIntelUpdated','chatLoopPlan',
  'Resume Failed Run','full-self-test','adopt-running-test','verify-deployment','shutdown-operator'
]) assert.ok(page.includes(marker),marker);
assert.ok(sw.includes(release.version),'Yardmaster service-worker cache must track current release '+release.version);
assert.match(sw,/showNotification/);
assert.match(sw,/notificationclick/);
assert.equal(manifest.start_url,'/yardmaster');
assert.equal(release.version,'0.1.91');
assert.equal(release.verified,false);
for(const section of ['operations','runs','branches','queue','chatgpt','deployments','settings','intelligence'])assert.ok(page.includes('data-mobile-section="'+section+'"'),section);
assert.match(page,/maximum-scale=1,user-scalable=no/);
assert.match(page,/data-mobile-section-target="intelligence"/);
assert.match(page,/renderMobileIntelligence/);
console.log('Yardmaster mobile resilience static PASS');


const config=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
const allowed=config.headers.find(rule=>rule.source==='/yardmaster/sw.js')?.headers.find(h=>h.key==='Service-Worker-Allowed')?.value;
assert.equal(allowed,'/yardmaster','canonical notification scope requires an explicit response header');
assert.ok(inlineScript.includes("scope:'/yardmaster'"));
