import {fileURLToPath} from 'node:url';
import {runCertification} from './run-play-store.mjs';
import {repairGrep,repairProjects} from './repair-190-selection.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const result=await runCertification({root,stages:[
  {name:'EXACT REPAIR NODE REGRESSIONS',args:['--test','--test-concurrency=1','--test-reporter=./scripts/reporters/node-status.mjs','test/targeted-repair.test.mjs']},
  {name:'EXACT REPAIRED PLAYWRIGHT TESTS',args:['node_modules/playwright/cli.js','test',...repairProjects.flatMap(project=>['--project',project]),'--grep',repairGrep]}
]});
process.exitCode=result.code;
