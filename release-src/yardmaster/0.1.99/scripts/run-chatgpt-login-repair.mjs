import {fileURLToPath} from 'node:url';
import {runCertification} from './run-play-store.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const result=await runCertification({root,stages:[
  {name:'CONTENTEDITABLE BLANK LINE NODE REGRESSION ONLY',args:['--test','--test-concurrency=1','--test-name-pattern=contenteditable clear leaves a blank line','--test-reporter=./scripts/reporters/node-status.mjs','test/chatgpt-login-state.test.mjs']},
  {name:'EXACT FAILED CHATGPT COMPOSER PLAYWRIGHT TEST ONLY',args:['node_modules/playwright/cli.js','test','--project=desktop-and-regressions','--grep=@chatgptBlank194']}
]});
process.exitCode=result.code;
