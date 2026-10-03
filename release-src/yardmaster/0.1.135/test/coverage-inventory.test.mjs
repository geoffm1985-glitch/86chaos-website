import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyInventory} from '../scripts/coverage-inventory.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));

test('every API action, route, dashboard action, and config key is covered and every Playwright spec parses',()=>{
  const inventory=verifyInventory(root);
  assert.ok(inventory.configKeys.includes('chatLoopEnabled'));
  assert.ok(inventory.configKeys.includes('chatLoopPlan'));
  assert.ok(inventory.routes.includes('/api/chatgpt-screenshot'));
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  assert.equal(pkg.scripts['test:playwright:full'],'node scripts/verify-feature-coverage.mjs && playwright test');
});
test('coverage preflight rejects the exact invalid-regexp discovery failure',()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ym-coverage-'));
  try{
    fs.mkdirSync(path.join(temp,'public'));fs.mkdirSync(path.join(temp,'test/playwright'),{recursive:true});
    for(const file of ['server.mjs','public/index.html'])fs.copyFileSync(path.join(root,file),path.join(temp,file));
    fs.writeFileSync(path.join(temp,'test/playwright/broken.spec.mjs'),'const bad = /<'+'\\\\'+'/script/gi;');
    assert.throws(()=>verifyInventory(temp),/Playwright syntax failed/);
  }finally{fs.rmSync(temp,{recursive:true,force:true})}
});
