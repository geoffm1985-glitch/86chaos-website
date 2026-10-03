import {fileURLToPath} from 'node:url';
import {runCertification} from './run-play-store.mjs';
// Exactly the three Node failures from the 20261001-214056 handoff,
// followed by the desktop/Android counterparts that the failed phase blocked.
export const nodeFailurePattern='operator crash triggers|@firebaseWindows106';
export const browserFailurePattern='@firebaseWindows106';
const root=fileURLToPath(new URL('../',import.meta.url));
const result=await runCertification({root,stages:[
  {name:'WINDOWS FIREBASE FAILED-ONLY NODE REGRESSIONS',args:['--test','--test-concurrency=1','--test-reporter=./scripts/reporters/node-status.mjs','--test-name-pattern='+nodeFailurePattern,'test/firebase-target.test.mjs']},
  {name:'AFFECTED FIREBASE DESKTOP/ANDROID PLAYWRIGHT REGRESSIONS',args:['node_modules/playwright/cli.js','test','test/playwright/firebase-target.e2e.spec.mjs','--grep',browserFailurePattern]}
]});process.exitCode=result.code;
