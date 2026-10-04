import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import snapshot from '../automation/chatgpt-snapshot.cjs';
import {createContinuousLoopFixture} from './helpers/continuous-loop-fixture.mjs';
test('Play Store: saved ChatGPT capture stays available after misses and retains remote authentication',async()=>{
 const f=await createContinuousLoopFixture(),file=path.join(f.data,'self-heal','last-chatgpt.png');
 try{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'saved-chat');const old=new Date(Date.now()-3600000);fs.utimesSync(file,old,old);
  assert.equal(await snapshot.captureChatGPTSnapshot({isDestroyed:()=>false,capturePage:async()=>({isEmpty:()=>true})},file),false);
  const response=await fetch(f.url+'/api/chatgpt-screenshot');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(await response.text(),'saved-chat');
  const rejected=await fetch(f.url+'/api/chatgpt-screenshot',{headers:{'X-Forwarded-For':'198.51.100.10'}});assert.equal(rejected.status,401);
 }finally{await f.close()}
});
test('Play Store: ChatGPT capture saves only its owned renderer without changing visibility',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ym-chat-capture-')),file=path.join(root,'last-chatgpt.png');let options;
 try{const contents={isDestroyed:()=>false,capturePage:async(rect,opts)=>{assert.equal(rect,undefined);options=opts;return {isEmpty:()=>false,toPNG:()=>Buffer.from('owned-chat-renderer')}}};assert.equal(await snapshot.captureChatGPTSnapshot(contents,file),true);assert.deepEqual(options,{stayHidden:true,stayAwake:true});assert.equal(fs.readFileSync(file,'utf8'),'owned-chat-renderer');assert.equal(fs.existsSync(file+'.tmp'),false);assert.equal(await snapshot.captureChatGPTSnapshot(null,file),false);assert.equal(await snapshot.captureChatGPTSnapshot({isDestroyed:()=>true},file),false)}finally{fs.unlinkSync(file);fs.rmdirSync(root)}
});
