import {fileURLToPath} from 'node:url';
import {runCertification} from './run-play-store.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const result=await runCertification({root,stages:[
  {name:'PHONE RECONNECT, RUN VERSION AND STOP NODE REGRESSIONS',args:['--test','--test-concurrency=1','--test-reporter=./scripts/reporters/node-status.mjs','test/phone-reconnect.test.mjs','test/run-project.test.mjs','test/stop-confirmation.test.mjs']},
  {name:'PHONE AND PC REPAIR PLAYWRIGHT TESTS',args:['node_modules/playwright/cli.js','test','--project','desktop-and-regressions','--project','mobile-android','--grep','@phoneReconnect191|@workingVersion191|@stopConfirm191']}
]});
process.exitCode=result.code;
