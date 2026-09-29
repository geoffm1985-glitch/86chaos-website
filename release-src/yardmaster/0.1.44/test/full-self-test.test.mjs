import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  createSandboxFixture,runFixtureTest,buildSandboxHandoff,createKnownGoodSandboxRepair,
  applySandboxRepair,commitAndPushSandbox,verifySandboxDeploymentIdentity,sandboxChatPrompt
} from '../automation/full-self-test.mjs';

test('full sandbox engine exercises fail -> handoff -> repair -> retest -> local push -> deployment identity',async t=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster-full-self-test-'));
  try{
    const workspace=createSandboxFixture(temp,{id:'fixture'});
    assert.ok(workspace.repo.startsWith(temp));
    assert.ok(!workspace.repo.toLowerCase().includes(path.join('documents','github','86chaos').toLowerCase()));
    const initial=await runFixtureTest(workspace.repo);
    assert.notEqual(initial.code,0,'fixture must fail before repair');

    const handoff=path.join(workspace.root,'handoff.zip');
    buildSandboxHandoff(workspace,handoff);
    const bytes=fs.readFileSync(handoff);
    assert.equal(bytes.subarray(0,2).toString(),'PK');
    assert.ok(bytes.length<200000,'sandbox handoff should remain tiny and fast');
    const prompt=sandboxChatPrompt();
    assert.match(prompt,/disposable fixture/i);
    assert.match(prompt,/Do not access or modify 86 Chaos/i);

    if(process.platform!=='win32'){t.diagnostic('Windows-only repair overlay portion skipped.');return}
    const repair=path.join(workspace.root,'repair.zip');
    createKnownGoodSandboxRepair(workspace,repair);
    applySandboxRepair({appRoot:path.dirname(path.dirname(fileURLToPath(import.meta.url))),workspace,repairPath:repair});
    const retest=await runFixtureTest(workspace.repo);
    assert.equal(retest.code,0,'repaired fixture must pass');
    const commit=commitAndPushSandbox(workspace);
    const identity=verifySandboxDeploymentIdentity(workspace,commit);
    assert.equal(identity.gitBranch,'testing');
    assert.equal(identity.gitCommit,commit);
    const post=await runFixtureTest(workspace.repo);
    assert.equal(post.code,0,'post-deployment fixture test must pass');
  } finally {
    fs.rmSync(temp,{recursive:true,force:true});
  }
});
