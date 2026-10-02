import {fileURLToPath} from 'node:url';
import {runCertification} from './run-play-store.mjs';

// Only the Functions path and local emulator startup regressions.
const root=fileURLToPath(new URL('../',import.meta.url));
const result=await runCertification({root,stages:[
  {name:'FIREBASE SESSION PATH NODE REGRESSIONS',args:['--test','--test-concurrency=1','--test-reporter=./scripts/reporters/node-status.mjs','test/firebase-session-paths.test.mjs']},
  {name:'FIREBASE STARTUP DESKTOP/ANDROID PLAYWRIGHT REGRESSIONS',args:['node_modules/playwright/cli.js','test','--grep','@firebaseWindows110']}
]});
process.exitCode=result.code;
