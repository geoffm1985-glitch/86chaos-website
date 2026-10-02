import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

export const root=path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
export function nodeReporterArgument(repoRoot=root,{windows=process.platform==='win32'}={}){
  const paths=windows?path.win32:path.posix;
  return '--test-reporter='+pathToFileURL(paths.join(repoRoot,'scripts','reporters','node-status.mjs'),{windows}).href;
}
export function reportingProbe(kind,{fail=false}={}){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster-status-'));
  try{
    let args;
    if(kind==='node'){
      const fixture=path.join(temp,'probe.test.mjs');
      fs.writeFileSync(fixture,`import test from 'node:test';import assert from 'node:assert/strict';test('passing probe',()=>{});test.skip('skipped probe',()=>{});${fail?"test('failing probe',()=>assert.equal(1,2));":''}`);
      args=['--test',nodeReporterArgument(),fixture];
    }else{
      const fixture=path.join(temp,'probe.spec.mjs'),config=path.join(temp,'config.mjs');
      const api=pathToFileURL(path.join(root,'node_modules/@playwright/test/index.mjs')).href;
      fs.writeFileSync(fixture,`import {test,expect} from ${JSON.stringify(api)};test('passing probe',()=>{});test.skip('skipped probe',()=>{});${fail?"test('failing probe',()=>expect(1).toBe(2));":''}`);
      fs.writeFileSync(config,'export default '+JSON.stringify({testDir:temp,testMatch:'probe.spec.mjs',workers:1,outputDir:path.join(temp,'results'),reporter:[[path.join(root,'scripts/reporters/playwright-status.mjs')]]}));
      args=[path.join(root,'node_modules/playwright/cli.js'),'test','--config='+config];
    }
    const env={...process.env,NO_COLOR:'1'};delete env.FORCE_COLOR;delete env.NODE_TEST_CONTEXT;
    const result=spawnSync(process.execPath,args,{cwd:root,env,encoding:'utf8',timeout:30000,windowsHide:true});
    if(result.error)throw result.error;
    return {code:result.status,output:result.stdout+result.stderr};
  }finally{fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});}
}
