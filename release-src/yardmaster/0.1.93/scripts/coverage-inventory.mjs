import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {COVERED_ACTIONS,COVERED_API_ROUTES,COVERED_UI_ACTIONS,COVERED_CONFIG_KEYS} from '../test/playwright/full-coverage-matrix.mjs';

export function verifyInventory(root){
  const read=file=>fs.readFileSync(path.join(root,file),'utf8');
  const server=read('server.mjs'),html=read('public/index.html');
  const unique=values=>[...new Set(values)].sort();
  const actual={
    actions:unique([...server.matchAll(/action==='([^']+)'/g)].map(m=>m[1])),
    routes:unique([...server.matchAll(/url\.pathname==='([^']+)'/g)].map(m=>m[1])),
    uiActions:unique([...html.matchAll(/data-action="([^"]+)"/g)].map(m=>m[1])),
    configKeys:[...String(server.match(/const allowed=\[([^\]]+)\];for\(const k of allowed\)/)?.[1]||'').matchAll(/'([^']+)'/g)].map(m=>m[1]).sort()
  };
  for(const [key,expected] of Object.entries({actions:COVERED_ACTIONS,routes:COVERED_API_ROUTES,uiActions:COVERED_UI_ACTIONS,configKeys:COVERED_CONFIG_KEYS}))assert.deepEqual(actual[key],expected,'Missing or stale dual-suite inventory: '+key);
  const specs=fs.readdirSync(path.join(root,'test/playwright')).filter(name=>/\.(spec|test)\.mjs$/.test(name)).sort();
  for(const name of specs){
    const result=spawnSync(process.execPath,['--check',path.join(root,'test/playwright',name)],{encoding:'utf8'});
    assert.equal(result.status,0,'Playwright syntax failed: '+name+'\n'+result.stderr);
  }
  return {...actual,playwrightSpecs:specs};
}
