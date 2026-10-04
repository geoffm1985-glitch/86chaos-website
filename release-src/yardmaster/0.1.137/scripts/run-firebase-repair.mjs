import {fileURLToPath} from 'node:url';
import {runCertification} from './run-play-store.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const result=await runCertification({root,stages:[
  {name:'FEATURE COVERAGE',args:['scripts/verify-feature-coverage.mjs']},
  {name:'FIREBASE TARGET AND REPAIRED LOOP NODE REGRESSIONS',args:['--test','--test-concurrency=1','--test-reporter=./scripts/reporters/node-status.mjs','test/firebase-target.test.mjs','test/continuous-loop.test.mjs','test/loop-update.test.mjs','test/model-controls.test.mjs','test/coverage-inventory.test.mjs','test/mobile-regressions.test.mjs','test/resumable-pause-docked-chatgpt.test.mjs','test/self-heal.test.mjs','test/static-contracts.test.mjs','test/yardmaster-1.85-control-parity.test.mjs','test/operator.integration.test.mjs','test/resilience-sandbox.test.mjs','test/targeted-repair.test.mjs']},
  {name:'PC/ANDROID FIREBASE AND REPAIRED LOOP PLAYWRIGHT REGRESSIONS',args:['node_modules/playwright/cli.js','test','test/playwright/firebase-target.e2e.spec.mjs','test/playwright/continuous-loop.e2e.spec.mjs','test/playwright/loop-update.e2e.spec.mjs','test/playwright/model-controls.e2e.spec.mjs','test/playwright/desktop-layout.e2e.spec.mjs','test/playwright/website-push-scope.e2e.spec.mjs']}
]});process.exitCode=result.code;
