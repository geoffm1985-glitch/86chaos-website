import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {firebaseSessionConfiguration,FirebaseSession,newFirebaseRun} from '../automation/firebase-target.mjs';
import {firebaseFixture} from './helpers/firebase-fixture.mjs';
import fs from 'node:fs';

test('Play Store: Windows Firebase CLI joins the real Functions directory from the external session config',()=>{
  const repo='C:\\Users\\Geoff User\\Documents\\GitHub\\86chaos';
  const data='C:\\Users\\Geoff User\\AppData\\Local\\Yardmaster\\firebase';
  const input={functions:{source:'functions',runtime:'nodejs20'},firestore:{rules:'firestore.rules',indexes:'firestore.indexes.json'},storage:{rules:'storage.rules'},database:{rules:'database.rules.json'}};
  const config=firebaseSessionConfiguration(input,repo,data,{pathImpl:path.win32});
  assert.equal(path.win32.isAbsolute(config.functions.source),false);
  assert.equal(path.win32.join(data,config.functions.source),path.win32.join(repo,'functions'));
  assert.equal(config.functions.runtime,'nodejs20');
  assert.equal(config.firestore.rules,path.win32.join(repo,'firestore.rules'));
  assert.equal(config.database.rules,path.win32.join(repo,'database.rules.json'));
  assert.equal(input.functions.source,'functions');
});

test('Play Store: cross-drive Functions codebases receive session-local junctions with preserved settings',()=>{
  const repo='D:\\Source Repo',data='C:\\Yardmaster State',junctions=[];
  const config=firebaseSessionConfiguration({functions:[{source:'functions',runtime:'nodejs20',codebase:'default'},{source:'other',runtime:'nodejs22',codebase:'second'}]},repo,data,{pathImpl:path.win32,makeJunction:(...args)=>junctions.push(args)});
  assert.deepEqual(junctions,[[path.win32.join(data,'functions-source-0'),path.win32.join(repo,'functions')],[path.win32.join(data,'functions-source-1'),path.win32.join(repo,'other')]]);
  assert.deepEqual(config.functions.map(c=>[c.source,c.runtime,c.codebase]),[['functions-source-0','nodejs20','default'],['functions-source-1','nodejs22','second']]);
});

test('Play Store: cold local compilation has a bounded five-minute emulator startup budget',()=>{
  assert.equal(new FirebaseSession().timeoutMs,300000);
  assert.equal(new FirebaseSession({timeoutMs:4000}).timeoutMs,4000);
});

test('Play Store: actual managed session writes Functions source relative to its config and keeps repository clean',async()=>{
  const f=await firebaseFixture();const source=path.join(f.repo,'functions');fs.mkdirSync(source);
  const configFile=path.join(f.repo,'firebase.json'),firebase=JSON.parse(fs.readFileSync(configFile));firebase.functions={source:'functions',runtime:'nodejs20'};fs.writeFileSync(configFile,JSON.stringify(firebase));
  f.git(['add','.']);f.git(['commit','-m','Add Functions source to managed session fixture']);
  const session=f.session({timeoutMs:20000});
  try{
    await session.start(newFirebaseRun({}));
    const generated=JSON.parse(fs.readFileSync(path.join(session.dataDir,'firebase-session.json')));
    assert.equal(path.join(session.dataDir,generated.functions.source),source);
    assert.equal(path.isAbsolute(generated.functions.source),false);
    assert.equal(f.git(['status','--porcelain']),'');
    assert.equal(session.status,'running');
  }finally{await session.stop();await f.close()}
});
