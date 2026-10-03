import {fileURLToPath} from 'node:url';
import {runCertification} from './run-play-store.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const result=await runCertification({root,stages:[
  {name:'LOOP, UPDATER AND MODEL CONTROL NODE REGRESSIONS',args:['--test','--test-concurrency=1','--test-reporter=./scripts/reporters/node-status.mjs','test/loop-update.test.mjs','test/model-controls.test.mjs']},
  {name:'LOOP, UPDATER AND PC/PHONE MODEL CONTROL PLAYWRIGHT REGRESSIONS',args:['node_modules/playwright/cli.js','test','test/playwright/loop-update.e2e.spec.mjs','test/playwright/model-controls.e2e.spec.mjs']}
]});
process.exitCode=result.code;
