import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {readRunProject,workingProject} from '../automation/run-project.mjs';
import {capturePauseCheckpoint} from '../automation/play-store-resume.mjs';
import {startRunProjectFixture,waitForRunProjectTest,RUN_PROJECT_TEST_NAME} from './helpers/run-project-fixture.mjs';

test('working version comes from the target repository package, including prerelease builds',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ym-project-unit-'));
  try{fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({name:'86chaos',version:'18.0.7-rc.1'}));assert.deepEqual(readRunProject(dir),{name:'86chaos',version:'18.0.7-rc.1',label:'86 Chaos 18.0.7-rc.1'})}
  finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('missing or malformed target version is reported as unavailable',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ym-project-unit-'));
  try{assert.equal(readRunProject(dir).version,null);fs.writeFileSync(path.join(dir,'package.json'),'{invalid');assert.equal(readRunProject(dir).label,'Version unavailable');fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({name:'86chaos',version:'historical test 17.0.43+'}));assert.equal(readRunProject(dir).version,null)}
  finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('active run version and pause checkpoint retain the captured source identity',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ym-project-unit-')),project={name:'86chaos',version:'18.0.7',label:'86 Chaos 18.0.7'};
  process.env.YARDMASTER_TEST_PROCESS_STATE_STUB='1';
  try{
    fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({name:'different-app',version:'99.0.0'}));
    assert.deepEqual(workingProject({cwd:dir,project,currentTest:'17.0.43+ regression'},dir),project);
    const saved=capturePauseCheckpoint({dataDir:dir,appRoot:dir,repoPath:dir,ownedPid:424242,stateRun:{project}});assert.deepEqual(saved.project,project);
  }finally{delete process.env.YARDMASTER_TEST_PROCESS_STATE_STUB;fs.rmSync(dir,{recursive:true,force:true})}
});
test('actual operator publishes target version and keeps it stable while a fixture command runs',{timeout:120000},async()=>{
  const f=await startRunProjectFixture();
  try{
    assert.equal((await f.api('/api/status')).workingProject.version,'18.0.7');
    await f.api('/api/action',{action:'start'});
    assert.equal((await f.api('/api/status')).run.project.version,'18.0.7');
    fs.writeFileSync(f.packageFile,JSON.stringify({name:'86chaos',version:'18.0.8'}));
    assert.equal((await f.api('/api/status')).workingProject.label,'86 Chaos 18.0.7');
  }finally{await f.close()}
});

// Windows trace: the fixture signal arrives after the six-second UI assertion.
// Readiness must follow actual output, not HTTP startup.
test('fixture readiness waits through pending output and returns only the actual test signal',async()=>{
  let calls=0;const f={api:async()=>({run:{state:'running',currentTest:++calls<3?'Starting…':RUN_PROJECT_TEST_NAME}})};
  const run=await waitForRunProjectTest(f,{pollMs:0});assert.equal(calls,3);assert.equal(run.currentTest,RUN_PROJECT_TEST_NAME);
});
test('fixture readiness rejects a terminated run instead of masking a real failure',async()=>{
  await assert.rejects(waitForRunProjectTest({api:async()=>({run:{state:'failed',currentTest:'Stopped on failure'}})}),/stopped before its start signal/);
});
test('fixture readiness has a deadline when a running process emits no test signal',async()=>{
  await assert.rejects(waitForRunProjectTest({api:async()=>({run:{state:'running',currentTest:'Starting…'}})},{timeoutMs:10,pollMs:1}),/did not emit its start signal/);
});
