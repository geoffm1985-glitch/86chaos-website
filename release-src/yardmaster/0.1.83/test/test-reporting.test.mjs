import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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

test('certification preserves a failure exit code and never runs later phases',async()=>{
  const lines=[],stages=[{name:'BROKEN',args:['-e','process.exit(7)']},{name:'LATER',args:['-e','process.exit(0)']}];
  const result=await runCertification({root,stages,write:line=>lines.push(line)});
  assert.equal(result.code,7);assert.deepEqual(result.results,[{name:'BROKEN',code:7}]);
  assert.match(lines.join('\n'),/OVERALL FAIL/);assert.match(lines.join('\n'),/\[NOT RUN\] LATER/);assert.doesNotMatch(lines.join('\n'),/OVERALL PASS/);
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
