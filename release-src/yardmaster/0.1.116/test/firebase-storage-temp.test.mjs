import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {firebaseFixture} from './helpers/firebase-fixture.mjs';
import {newFirebaseRun,spawnManaged} from '../automation/firebase-target.mjs';
test('Play Store: emulator storage owns an isolated temporary directory while test children retain their own temp',async()=>{
 const f=await firebaseFixture(),seen=[],s=f.session({spawnProcess:(command,args,options)=>{seen.push(options.env);return spawnManaged(command,args,options)}});
 try{await s.start(newFirebaseRun({}));const cli=seen[0],app=seen[1],expected=path.join(s.dataDir,'runtime-tmp');
  assert.equal(cli.TEMP,expected);assert.equal(cli.TMP,expected);assert.equal(cli.TMPDIR,expected);assert.ok(fs.statSync(expected).isDirectory());
  assert.notEqual(app.TEMP,expected);assert.notEqual(expected,os.tmpdir());
  fs.mkdirSync(path.join(expected,'firebase/storage/blobs'),{recursive:true});fs.writeFileSync(path.join(expected,'firebase/storage/blobs/active-upload'),'preserved');
  const unrelated=fs.mkdtempSync(path.join(os.tmpdir(),'firebase-fixture-'));fs.rmSync(unrelated,{recursive:true});assert.equal(fs.readFileSync(path.join(expected,'firebase/storage/blobs/active-upload'),'utf8'),'preserved');
 }finally{await s.stop();await f.close()}
});
