import {fileURLToPath} from 'node:url';
import {runCertification} from './run-play-store.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const result=await runCertification({root,stages:[
  {name:'ELECTRON COLD START NODE REGRESSIONS',args:['--test','--test-concurrency=1','--test-reporter=./scripts/reporters/node-status.mjs','test/electron-test-runtime.test.mjs']},
  {name:'PREPARE ELECTRON BEFORE TIMED PLAYWRIGHT LAUNCH',args:['scripts/electron-test-runtime.mjs']},
  {name:'PREVIOUSLY FAILED ELECTRON DOCK PLAYWRIGHT TEST',args:['node_modules/playwright/cli.js','test','--project=desktop-and-regressions','--grep=@chatgptCold197']}
]});
process.exitCode=result.code;
