import {runCertification} from './run-play-store.mjs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const result=await runCertification({root,stages:[{name:'OWNER RECONNECT RELEASE GATE',args:['--test','test/owner-connection.test.mjs','test/public-owner-discovery.test.mjs','test/firebase-cli-recovery.test.mjs','test/owner-server.integration.test.mjs','test/composer-normalization-repair.test.mjs']},{name:'OWNER RECONNECT PLAYWRIGHT',args:['node_modules/playwright/cli.js','test','--config=playwright.owner-connection.config.mjs']}]});
process.exitCode=result.code;
