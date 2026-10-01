import {fileURLToPath} from 'node:url';
import {runCertification} from './run-play-store.mjs';
import {mobileFailedGrep,mobileNodeFiles} from './mobile-failed-selection.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const result=await runCertification({root,stages:[
  {name:'MOBILE AND FAILURE NODE REGRESSIONS',args:['--test','--test-concurrency=1','--test-reporter=./scripts/reporters/node-status.mjs',...mobileNodeFiles]},
  {name:'MOBILE AND PREVIOUSLY FAILED PLAYWRIGHT TESTS',args:['node_modules/playwright/cli.js','test','--grep',mobileFailedGrep]}
]});
process.exitCode=result.code;
