import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import snapshot from '../automation/chatgpt-snapshot.cjs';
test('Play Store: ChatGPT capture saves only its owned renderer without changing visibility',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ym-chat-capture-')),file=path.join(root,'last-chatgpt.png');let options;
 try{const contents={isDestroyed:()=>false,capturePage:async(rect,opts)=>{assert.equal(rect,undefined);options=opts;return {isEmpty:()=>false,toPNG:()=>Buffer.from('owned-chat-renderer')}}};assert.equal(await snapshot.captureChatGPTSnapshot(contents,file),true);assert.deepEqual(options,{stayHidden:true,stayAwake:true});assert.equal(fs.readFileSync(file,'utf8'),'owned-chat-renderer');assert.equal(fs.existsSync(file+'.tmp'),false);assert.equal(await snapshot.captureChatGPTSnapshot(null,file),false);assert.equal(await snapshot.captureChatGPTSnapshot({isDestroyed:()=>true},file),false)}finally{fs.unlinkSync(file);fs.rmdirSync(root)}
});
