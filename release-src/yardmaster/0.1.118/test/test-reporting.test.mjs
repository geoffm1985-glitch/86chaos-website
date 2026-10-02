import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {certificationStages,runCertification} from '../scripts/run-play-store.mjs';
import {reportingProbe,nodeReporterArgument,root} from './helpers/test-reporting-fixtures.mjs';

test('certification still runs every Node test and the complete Playwright inventory',()=>{
  const stages=certificationStages(root);
  assert.equal(stages[0].name,'FEATURE COVERAGE');
  assert.deepEqual(stages[1].args.slice(3).sort(),fs.readdirSync(path.join(root,'test')).filter(f=>f.endsWith('.test.mjs')).map(f=>path.join('test',f)).sort());
  assert.deepEqual(stages[2].args,['node_modules/playwright/cli.js','test']);
});

test('Node reporter arguments use importable file URLs for Windows drive paths and spaces',()=>{
  assert.equal(nodeReporterArgument('C:\\Users\\geoff\\Documents\\Yardmaster-Repo',{windows:true}),'--test-reporter=file:///C:/Users/geoff/Documents/Yardmaster-Repo/scripts/reporters/node-status.mjs');
  assert.equal(nodeReporterArgument('C:\\Users\\geoff\\Yardmaster Repo #1',{windows:true}),'--test-reporter=file:///C:/Users/geoff/Yardmaster%20Repo%20%231/scripts/reporters/node-status.mjs');
  assert.equal(nodeReporterArgument('/tmp/Yardmaster Repo',{windows:false}),'--test-reporter=file:///tmp/Yardmaster%20Repo/scripts/reporters/node-status.mjs');
});

test('actual certification inventory retains every test under Windows path semantics',()=>{
  const files=fs.readdirSync(path.join(root,'test'));
  const source=fs.readFileSync(path.join(root,'scripts','run-play-store.mjs'),'utf8').split('\nexport async function runCertification')[0].replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
  const windowsRoot='C:\\Users\\geoff\\Documents\\Yardmaster-Repo';
  const stages=vm.runInNewContext(source+'\ncertificationStages('+JSON.stringify(windowsRoot)+');',{
    fs:{readdirSync:directory=>{assert.equal(directory,path.win32.join(windowsRoot,'test'));return files;}},
    path:path.win32,process:{argv:[]}
  });
  assert.deepEqual(Array.from(stages[1].args.slice(3)).sort(),files.filter(f=>f.endsWith('.test.mjs')).map(f=>path.win32.join('test',f)).sort());
  assert.equal(stages[1].args[2],'--test-reporter=./scripts/reporters/node-status.mjs');
  assert.deepEqual(Array.from(stages[2].args),['node_modules/playwright/cli.js','test']);
});

test('certification prints overall PASS only after every phase passes',async()=>{
  const lines=[],stages=['FIRST','SECOND'].map(name=>({name,args:['-e','process.exit(0)']}));
  const result=await runCertification({root,stages,write:line=>lines.push(line)});
  assert.equal(result.code,0);assert.equal(result.results.length,2);
  assert.match(lines.join('\n'),/OVERALL PASS/);assert.doesNotMatch(lines.join('\n'),/OVERALL FAIL/);
});

test('certification preserves a failure exit code, stops later phases, and exports one diagnostic ZIP',async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster-cert-diag-')),diagnosticDir=path.join(temp,'diagnostics'),lines=[];
  try{
    const stages=[{name:'BROKEN',args:['-e',"console.error('fixture diagnostic failure');process.exit(7)"]},{name:'LATER',args:['-e','process.exit(0)']}];
    const result=await runCertification({root,stages,write:line=>lines.push(line),diagnosticDir});
    assert.equal(result.code,7);assert.deepEqual(result.results,[{name:'BROKEN',code:7}]);
    assert.ok(result.diagnosticPath,'a failed phase must return the diagnostic ZIP path');
    assert.equal(fs.existsSync(result.diagnosticPath),true);
    const zip=fs.readFileSync(result.diagnosticPath);
    assert.equal(zip.readUInt32LE(0),0x04034b50,'diagnostic must be a real ZIP');
    for(const marker of ['diagnostic.json','stage-output.log','fixture diagnostic failure','BROKEN'])assert.ok(zip.includes(Buffer.from(marker)),marker);
    assert.match(lines.join('\n'),/\[DIAGNOSTIC\] Exported failure ZIP:/);
    assert.match(lines.join('\n'),/OVERALL FAIL/);assert.match(lines.join('\n'),/\[NOT RUN\] LATER/);assert.doesNotMatch(lines.join('\n'),/OVERALL PASS/);
  }finally{fs.rmSync(temp,{recursive:true,force:true})}
});

test('every possible failed certification phase uses the same automatic diagnostic export path',async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster-cert-every-phase-'));
  try{
    for(let failAt=0;failAt<3;failAt++){
      const diagnosticDir=path.join(temp,'phase-'+failAt),stages=['FEATURE COVERAGE','NODE TESTS','PLAYWRIGHT TESTS'].map((name,index)=>({name,args:['-e',index===failAt?'process.exit(5)':'process.exit(0)']}));
      const result=await runCertification({root,stages,write:()=>{},diagnosticDir});
      assert.equal(result.code,5);assert.ok(result.diagnosticPath,stages[failAt].name);assert.equal(fs.existsSync(result.diagnosticPath),true);
      assert.ok(fs.readFileSync(result.diagnosticPath).includes(Buffer.from(stages[failAt].name)));
    }
  }finally{fs.rmSync(temp,{recursive:true,force:true})}
});

for(const kind of ['node','playwright'])for(const fail of [false,true])test(`${kind} console reporter distinguishes ${fail?'failure':'success'} from skipped tests`,()=>{
  const result=reportingProbe(kind,{fail}),label=kind.toUpperCase();
  assert.equal(result.code,fail?1:0,result.output);
  assert.match(result.output,new RegExp('\\[PASS\\] '+label+': passing probe'));
  assert.match(result.output,new RegExp('\\[SKIP\\] '+label+': skipped probe'));
  assert.match(result.output,new RegExp('\\['+(fail?'FAIL':'PASS')+'\\] '+label+' TESTS'));
  assert.match(result.output,new RegExp('pass 1 \\| fail '+(fail?'1':'0')+' \\| skipped 1'));
  if(fail)assert.match(result.output,new RegExp('\\[FAIL\\] '+label+': failing probe'));
  assert.doesNotMatch(result.output,/\u001b|[✓✘✔✖]/);
});
