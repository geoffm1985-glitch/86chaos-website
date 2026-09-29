import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHandoffDiagnostics} from '../automation/handoff-diagnostics.mjs';

test('handoff black box produces a sanitized diagnostic ZIP with the exact failure stage',async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster-handoff-diagnostics-'));
  const artifact=path.join(temp,'Yardmaster-Handoff-Fixture.zip');
  fs.writeFileSync(artifact,'fixture');
  const diag=createHandoffDiagnostics(temp,{version:'0.1.42',mode:'Work',model:'GPT-5.6 Sol',thinkingEffort:'High',artifactPath:artifact,prompt:'SECRET PROMPT CONTENT'});
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZLZsAAAAASUVORK5CYII=';
  const cdp={
    async eval(expression){
      if(expression.includes('YM_DIAGNOSTIC_SNAPSHOT'))return {
        href:'https://chatgpt.com/c/fixture?secret=nope',
        readyState:'complete',
        composer:{tag:'TEXTAREA',id:'prompt-textarea',contenteditable:'',textLength:21,rect:{x:10,y:400,width:600,height:120}},
        fileInputCount:0,
        buttons:[{label:'Send',testid:'send-button',type:'button',disabled:true,ariaDisabled:'true',rect:{x:580,y:460,width:40,height:40},topTag:'BUTTON',topTestid:'send-button',topIsSelf:true}],
        attachments:[],userMessages:0,assistantMessages:0
      };
      if(expression.includes('YM_DIAGNOSTIC_CLIP'))return {x:0,y:300,width:700,height:260,scale:1};
      return null;
    },
    async send(method){
      if(method==='Page.captureScreenshot')return {data:png};
      return {};
    }
  };
  diag.record('attachment-button',{found:false,label:null});
  const bundle=await diag.fail(new Error('ChatGPT did not confirm the Yardmaster ZIP attachment after trusted file selection.'),cdp);
  assert.equal(bundle.stage,'attachment-button');
  assert.match(bundle.name,/^Yardmaster-Handoff-Diagnostic-.*\.zip$/);
  assert.ok(fs.existsSync(bundle.path));
  const zip=fs.readFileSync(bundle.path);
  assert.equal(zip.subarray(0,2).toString(),'PK','diagnostic bundle must be a real ZIP');
  const dir=path.join(temp,'handoff-diagnostics');
  const traceFile=fs.readdirSync(dir).find(name=>name.endsWith('.json'));
  assert.ok(traceFile,'sanitized trace JSON must be retained beside the ZIP');
  const trace=fs.readFileSync(path.join(dir,traceFile),'utf8');
  assert.match(trace,/"stage": "attachment-button"/);
  assert.match(trace,/"stage": "failure"/);
  assert.match(trace,/"href": "https:\/\/chatgpt\.com\/c\/fixture"/);
  assert.doesNotMatch(trace,/SECRET PROMPT CONTENT/,'generated prompt body must never be copied into diagnostics');
  assert.match(trace,/"promptLength": 21/);
  assert.equal(bundle.hasScreenshot,true);
  fs.rmSync(temp,{recursive:true,force:true});
});


test('handoff black box replaces the early composer screenshot with the actual failure-state screenshot',async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster-handoff-failure-shot-'));
  const artifact=path.join(temp,'Yardmaster-Handoff-Fixture.zip');fs.writeFileSync(artifact,'fixture');
  const diag=createHandoffDiagnostics(temp,{version:'0.1.42',artifactPath:artifact,prompt:'fixture'});
  let captures=0;
  const cdp={
    async eval(expression){
      if(expression.includes('YM_DIAGNOSTIC_SNAPSHOT'))return {href:'https://chatgpt.com/',readyState:'complete',composer:{tag:'DIV',id:'',contenteditable:'true',textLength:captures?12:5816,rect:{x:10,y:10,width:500,height:120}},fileInputCount:1,buttons:[],attachments:[],userMessages:0,assistantMessages:0};
      if(expression.includes('YM_DIAGNOSTIC_CLIP'))return {x:0,y:0,width:500,height:200,scale:1};
      return null;
    },
    async send(method){
      if(method==='Page.captureScreenshot'){captures++;return {data:Buffer.from(captures===1?'early-state':'failure-state').toString('base64')}};
      return {};
    }
  };
  await diag.snapshot(cdp,'composer-ready');
  const bundle=await diag.fail(new Error('fixture failure'),cdp);
  assert.equal(captures,2,'failure handling must recapture the composer instead of keeping the earlier screenshot');
  const dir=path.join(temp,'handoff-diagnostics');
  const pngFile=fs.readdirSync(dir).find(name=>name.endsWith('-composer.png'));
  assert.ok(pngFile);
  assert.equal(fs.readFileSync(path.join(dir,pngFile),'utf8'),'failure-state');
  assert.equal(bundle.hasScreenshot,true);
  fs.rmSync(temp,{recursive:true,force:true});
});
