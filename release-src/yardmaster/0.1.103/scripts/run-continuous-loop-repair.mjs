import {fileURLToPath} from 'node:url';
import {runCertification} from './run-play-store.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const result=await runCertification({root,stages:[
  {name:'CONTINUOUS LOOP AND FULL-FIRST NODE TESTS',args:['--test','--test-concurrency=1','--test-reporter=./scripts/reporters/node-status.mjs','test/continuous-loop.test.mjs','test/loop-update.test.mjs','test/model-controls.test.mjs']},
  {name:'CONTINUOUS LOOP PC/ANDROID PLAYWRIGHT TESTS',args:['node_modules/playwright/cli.js','test','test/playwright/continuous-loop.e2e.spec.mjs','test/playwright/loop-update.e2e.spec.mjs','test/playwright/model-controls.e2e.spec.mjs']}
]});process.exitCode=result.code;
