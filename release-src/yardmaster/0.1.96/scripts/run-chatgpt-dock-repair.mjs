import {fileURLToPath} from 'node:url';
import {runCertification} from './run-play-store.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const result=await runCertification({root,stages:[
  {name:'CHATGPT DOCK RECONNECT NODE REGRESSIONS',args:['--test','--test-concurrency=1','--test-reporter=./scripts/reporters/node-status.mjs','test/chatgpt-dock-bridge.test.mjs','test/chatgpt-dock-connection.test.mjs']},
  {name:'REAL ELECTRON DOCK IPC PLAYWRIGHT REGRESSIONS',args:['node_modules/playwright/cli.js','test','--project=desktop-and-regressions','--grep=@chatgptBridge196']}
]});
process.exitCode=result.code;
