import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {firebaseEnvironment,newFirebaseRun} from '../automation/firebase-target.mjs';

const aliases=['REACT_APP_FIREBASE_PROJECT_ID','REACT_APP_TEST_FIREBASE_PROJECT_ID','CHAOS_EXPECTED_TEST_FIREBASE_PROJECT_ID'];
for(const mode of ['emulator','live'])test(`Play Store: ${mode} project aliases override inherited configuration and survive dotenv loading in descendants`,()=>{
  const project=mode==='emulator'?'demo-86chaos':'chaos-test-d1601';
  const env=firebaseEnvironment({run:newFirebaseRun({firebaseMode:mode}),base:{...process.env,...Object.fromEntries(aliases.map(k=>[k,'stale-project']))}});
  for(const key of aliases)assert.equal(env[key],project,key);
  // Gate dotenv loaders fill missing values. A saved live value must never win.
  const child=spawnSync(process.execPath,['-e',`const assert=require('node:assert/strict');for(const key of ${JSON.stringify(aliases)}){process.env[key] ||= 'saved-live-project';assert.equal(process.env[key],${JSON.stringify(project)},key)}`],{env,encoding:'utf8'});
  assert.equal(child.status,0,child.stderr);
});
