import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {__testHooks} from '../automation/chatgpt.mjs';

test('dock discovery accepts document targets even when sessionStorage is unavailable',async()=>{
  for(const type of ['page','other','webview']){
    const calls=[];let closed=false;
    const cdp={connect:async()=>calls.push('connect'),eval:async expression=>vm.runInNewContext(expression,{location:{href:'https://chatgpt.com/c/signed-in'},document:{readyState:'complete',title:'ChatGPT'},sessionStorage:{getItem:()=>{throw new Error('storage unavailable')},setItem:()=>{throw new Error('storage unavailable')}}}),send:async method=>calls.push(method),close:()=>closed=true};
    const result=await __testHooks.attachResponsiveChatGPT([{type,url:'https://chatgpt.com/c/signed-in',webSocketDebuggerUrl:'ws://127.0.0.1:9224/devtools/page/dock'}],'/downloads',{createCdp:()=>cdp});
    assert.equal(result,cdp);assert.equal(closed,false);assert.ok(calls.includes('Browser.setDownloadBehavior'));
  }
});

test('dock discovery excludes workers and unrelated origins and closes navigated-away sessions',async()=>{
  const opened=[];let closed=0;
  const createCdp=url=>{opened.push(url);return {connect:async()=>{},eval:async()=>({href:'https://example.invalid/'}),close:()=>closed++}};
  const targets=[{type:'service_worker',url:'https://chatgpt.com/sw.js',webSocketDebuggerUrl:'worker'},{type:'page',url:'https://chatgpt.com.example.invalid/',webSocketDebuggerUrl:'unrelated'},{type:'other',url:'https://chatgpt.com/',webSocketDebuggerUrl:'redirected'}];
  assert.equal(await __testHooks.attachResponsiveChatGPT(targets,'/downloads',{createCdp}),null);
  assert.deepEqual(opened,['redirected']);assert.equal(closed,1);
});

function launchHarness({recover=true,required=true}={}){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster-dock-')),calls=[],cdp={dock:true};let now=0,dockProbes=0;
  const context={dockBridge:{},fs,path,os,process:{env:required?{YARDMASTER_CHATGPT_DOCK_REQUIRED:'1'}:{}},URL,Map,WebSocket:class{},setTimeout,clearTimeout,Date:class extends Date{static now(){return now}},fixtureCdp:cdp,
    fixtureDelay:async()=>{now+=500},fixtureList:async port=>{calls.push(port);if(port===9224){dockProbes++;return recover&&dockProbes>=3?[{dock:true}]:null}return [{edge:true}]},fixtureAttach:async targets=>targets?.[0]?.dock?cdp:targets?.[0]?.edge?{edge:true}:null,fixtureEdge:()=>{calls.push('edge-path');return 'edge.exe'},spawn:()=>{calls.push('spawn');return {unref(){}}}};
  const source=fs.readFileSync(new URL('../automation/chatgpt.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'').replace('const delay=ms=>new Promise(r=>setTimeout(r,ms));','const delay=fixtureDelay;');
  vm.runInNewContext(source+'\nlistTargets=fixtureList;attachResponsiveChatGPT=fixtureAttach;edgePath=fixtureEdge;this.launch=launch;',context);
  return {temp,calls,cdp,launch:context.launch,cleanup:()=>fs.rmSync(temp,{recursive:true,force:true})};
}

test('desktop handoff retries the dock without using an existing separate Edge profile',async()=>{
  const fixture=launchHarness(),status=[];try{
    const result=await fixture.launch(fixture.temp,{onStatus:message=>status.push(message)});
    assert.equal(result.cdp,fixture.cdp);assert.equal(result.docked,true);assert.equal(result.port,9224);
    assert.deepEqual(fixture.calls,[9224,9224,9224]);assert.match(status[0],/Reconnecting/);assert.match(status.at(-1),/Connected/);
  }finally{fixture.cleanup()}
});

test('unreachable desktop dock fails with an actionable retry instead of spawning hidden Edge',async()=>{
  const fixture=launchHarness({recover:false});try{
    await assert.rejects(fixture.launch(fixture.temp),error=>{assert.equal(error.code,'CHATGPT_DOCK_UNAVAILABLE');assert.match(error.message,/Reload.*Resume Handoff/);assert.match(error.message,/ZIP is preserved/);return true});
    assert.ok(fixture.calls.every(port=>port===9224));
  }finally{fixture.cleanup()}
});

test('standalone server fallback remains available when no desktop dock is required',async()=>{
  const fixture=launchHarness({recover:false,required:false});try{
    const result=await fixture.launch(fixture.temp);assert.equal(result.docked,false);assert.equal(result.port,9222);assert.deepEqual(fixture.calls,[9224,'edge-path',9222]);
  }finally{fixture.cleanup()}
});

test('desktop passes the dock requirement to the operator it actually spawns',async()=>{
  const source=fs.readFileSync(new URL('../desktop.cjs',import.meta.url),'utf8');
  const fn=source.slice(source.indexOf('async function ensureServer(){'),source.indexOf('\nasync function createWindow(){'));
  let options;
  const context={stopOrphanServer:async()=>{},healthy:async()=>true,path,root:'/app',process:{env:{FIXTURE_KEEP:'yes'}},Date,spawn:(command,args,opts)=>{options=opts;return {}},setTimeout,installDockBridge:()=>{}};
  vm.runInNewContext(fn+';this.start=ensureServer;',context);await context.start();
  assert.equal(options.env.YARDMASTER_CHATGPT_DOCK_REQUIRED,'1');assert.equal(options.env.YARDMASTER_CHATGPT_DOCK_PORT,'9224');assert.equal(options.env.FIXTURE_KEEP,'yes');
});

test('dock reconnect failure preserves the current failed run and avoids recursive self-heal',async()=>{
  const source=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const fn=source.slice(source.indexOf('async function submitCurrentHandoff('),source.indexOf('\nasync function submitImplementationTask',source.indexOf('async function submitCurrentHandoff(')));
  const state={workflow:{state:'waiting-login',repairAttempts:2,handoffPath:'/existing/failure.zip'},run:{state:'failed',exitCode:1}};let selfHeals=0,submittedPath;
  const error=Object.assign(new Error('Open ChatGPT, Reload, then Resume Handoff.'),{code:'CHATGPT_DOCK_UNAVAILABLE'});
  const context={state,workflowBusy:false,cancelRequested:false,process:{env:{}},fs:{existsSync:()=>true},nextChatLoopSelection:()=>({mode:'Work',model:'GPT-5.6 Sol',thinkingEffort:'High'}),activity:()=>{},notify:()=>{},persist:()=>{},repairPrompt:()=> 'existing failure',dataDir:'/data',config:{autoSelfHeal:true},executeProtocol:async()=>{},submitRepairToChatGPT:async options=>{submittedPath=options.artifactPath;throw error},queueSelfHeal:()=>selfHeals++,selfHealCheckpoint:()=>({}),readSelfHealRequest:()=>null,setTimeout:()=>0};
  vm.runInNewContext(fn+';this.resume=()=>submitCurrentHandoff({resume:true});',context);await context.resume();
  assert.equal(state.workflow.state,'handoff-error');assert.equal(state.workflow.handoffPath,'/existing/failure.zip');assert.equal(submittedPath,'/existing/failure.zip');assert.equal(state.workflow.repairAttempts,2);assert.equal(state.run.exitCode,1);assert.equal(selfHeals,0);
});
