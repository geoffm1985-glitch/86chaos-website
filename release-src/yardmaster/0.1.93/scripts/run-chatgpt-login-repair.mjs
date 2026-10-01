import {fileURLToPath} from 'node:url';
import {runCertification} from './run-play-store.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const result=await runCertification({root,stages:[
  {name:'CHATGPT SIGN-IN AND PRESERVED HANDOFF NODE REGRESSIONS',args:['--test','--test-concurrency=1','--test-reporter=./scripts/reporters/node-status.mjs','test/chatgpt-login-state.test.mjs']},
  {name:'CHATGPT COMPOSER AND AUTHENTICATION DESKTOP PLAYWRIGHT REGRESSIONS',args:['node_modules/playwright/cli.js','test','--project=desktop-and-regressions','--grep=@chatgptLogin193']}
]});
process.exitCode=result.code;
