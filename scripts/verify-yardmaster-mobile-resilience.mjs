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
  'navigator.credentials','trycloudflare.com','ym-auth-pending','ym-authenticated'
]) assert.ok(page.includes(marker),marker);
assert.ok(sw.includes(release.version),'Yardmaster service-worker cache must track current release '+release.version);
assert.match(sw,/showNotification/);
assert.match(sw,/notificationclick/);
assert.equal(manifest.start_url,'/yardmaster');
console.log('Yardmaster mobile resilience static PASS');
