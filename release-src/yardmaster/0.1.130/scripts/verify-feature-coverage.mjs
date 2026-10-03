import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {verifyInventory} from './coverage-inventory.mjs';
const root=process.cwd();
const policy=JSON.parse(fs.readFileSync('YARDMASTER_FEATURES.json','utf8'));
const inventory=verifyInventory(root);
const run=args=>{try{return execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim()}catch{return ''}};
const base=process.env.YARDMASTER_COVERAGE_BASE||'HEAD^';
const files=run(['diff','--name-only',base,'HEAD']).split(/\r?\n/).filter(Boolean);
const implementation=files.filter(f=>f==='server.mjs'||f==='desktop.cjs'||f==='preload.cjs'||f==='package.json'||f.startsWith('automation/')||f.startsWith('public/')||f.startsWith('scripts/')||f.startsWith('electron/'));
if(implementation.length){
  const store=files.some(f=>/^test\/(?!playwright\/).+\.test\.mjs$/.test(f));
  const playwright=files.some(f=>/^test\/playwright\/.+\.(?:spec|test)\.mjs$/.test(f));
  if(!store||!playwright){
    console.error('Yardmaster feature coverage contract FAILED.');
    console.error('Implementation files changed:',implementation.join(', '));
    console.error('Every implementation commit must add/update BOTH a Play Store/certification test and a Playwright test.');
    console.error('Play Store/certification coverage changed:',store);
    console.error('Playwright coverage changed:',playwright);
    process.exit(1);
  }
}
for(const feature of policy.features||[]){
  if(!Array.isArray(feature.playStoreTests)||!feature.playStoreTests.length)throw new Error(feature.id+' is missing Play Store/certification coverage.');
  if(!Array.isArray(feature.playwrightTests)||!feature.playwrightTests.length)throw new Error(feature.id+' is missing Playwright coverage.');
  for(const file of [...feature.playStoreTests,...feature.playwrightTests])if(!fs.existsSync(file))throw new Error(feature.id+' references missing coverage file '+file);
}
console.log('Yardmaster feature coverage contract PASS:',(policy.features||[]).length+' features; '+inventory.actions.length+' actions; '+inventory.routes.length+' routes; '+inventory.uiActions.length+' UI actions; '+inventory.configKeys.length+' configuration keys; '+inventory.playwrightSpecs.length+' parseable Playwright specs.');
