import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {__testHooks} from '../automation/chatgpt.mjs';

test('contenteditable clear leaves a blank line without restoring or sending a draft',async()=>{
  let text='Yardmaster stale handoff draft',clears=0;const calls=[];
  const cdp={
    async eval(expression){
      calls.push(expression);
      if(expression.includes('YM_MANUAL_CHAT_TEXT'))return text;
      if(expression.includes('YM_MANUAL_CHAT_FOCUS'))return true;
      return {tag:'DIV',id:'prompt-textarea',editable:'true'};
    },
    async send(method,params){
      calls.push(method);
      if(method==='Input.dispatchKeyEvent'&&params.type==='keyUp'&&params.key==='Backspace'){text='\n';clears++}
      return {};
    }
  };
  assert.equal(await __testHooks.prepareManualChat(cdp),true);
  assert.equal(await __testHooks.manualComposerText(cdp),'\n');assert.equal(text.trim(),'');assert.equal(clears,1);
  assert.ok(!calls.some(expression=>/YM_VERIFY_ATTACHMENT|YM_VERIFY_PROMPT_SENT|YM_TRUSTED_FILL_PROMPT|Input.insertText/.test(expression)),'manual preparation must neither upload nor send a handoff');
});

test('a signed-in page without a composer is a readiness error, not a logout',async()=>{
  await assert.rejects(__testHooks.composerUnavailableResult({eval:async()=>({loginRequired:false})},{docked:true}),error=>{
    assert.equal(error.code,'CHATGPT_COMPOSER_UNAVAILABLE');
    assert.match(error.message,/docked ChatGPT window/);
    assert.match(error.message,/Resume Handoff/);
    return true;
  });
});

test('a disconnected DevTools session cannot establish that ChatGPT is signed out',async()=>{
  await assert.rejects(__testHooks.composerUnavailableResult({eval:async()=>{throw new Error('DevTools connection closed')}}),{code:'CHATGPT_COMPOSER_UNAVAILABLE'});
});

test('confirmed sign-out identifies the dock, manual window, or automation profile',async()=>{
  for(const [options,label] of [[{docked:true},'docked ChatGPT window'],[{purpose:'manual'},'manual Yardmaster Edge window'],[{},'automation Yardmaster Edge profile']]){
    const result=await __testHooks.composerUnavailableResult({eval:async()=>({loginRequired:true})},options);
    assert.equal(result.state,'login_required');assert.ok(result.message.includes(label));
  }
});

test('login-route detection executes correctly and only matches authentication routes',async()=>{
  for(const pathname of ['/auth/login','/auth/signin/step','/login','/signin','/c/login-discussion','/']){
    const cdp={eval:async expression=>vm.runInNewContext(expression,{location:{pathname,href:'https://chatgpt.com'+pathname},document:{querySelectorAll:()=>[],readyState:'complete'}})};
    if(['/auth/login','/auth/signin/step','/login','/signin'].includes(pathname))assert.equal((await __testHooks.composerUnavailableResult(cdp)).state,'login_required');
    else await assert.rejects(__testHooks.composerUnavailableResult(cdp),{code:'CHATGPT_COMPOSER_UNAVAILABLE'});
  }
});

function handoffHarness({loginRequired=false,disconnect=false}={}){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster-login-')),zip=path.join(temp,'existing-failure.zip');fs.writeFileSync(zip,'existing handoff bytes');
  const events=[],diagnostic={path:path.join(temp,'readiness-diagnostic.zip'),name:'readiness-diagnostic.zip'};
  const cdp={eval:async()=>{if(disconnect)throw new Error('DevTools disconnected');return {loginRequired}},close:()=>events.push('close')};
  const context={fs,path,os,process,Map,setTimeout,clearTimeout,URL,WebSocket:class{},spawn:()=>assert.fail('must reuse attached dock'),createHandoffDiagnostics:()=>({record:(stage)=>events.push(stage),snapshot:async()=>{},success:()=>events.push('success'),fail:async()=>{events.push('fail');fs.writeFileSync(diagnostic.path,'diagnostic evidence');return diagnostic}}),fixtureCdp:cdp,fixtureDownloads:temp};
  const source=fs.readFileSync(new URL('../automation/chatgpt.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
  vm.runInNewContext(source+"\nlaunch=async()=>({cdp:fixtureCdp,downloads:fixtureDownloads,docked:true,purpose:'automation',port:9224});waitHandoffComposerReady=async()=>null;this.submit=submitRepairToChatGPT;this.manual=openChatGPT;prepareManualChat=async()=>null;",context);
  return {temp,zip,events,diagnostic,submit:context.submit,manual:context.manual,cleanup:()=>fs.rmSync(temp,{recursive:true,force:true})};
}

test('automated readiness failure preserves the current ZIP and diagnostic evidence',async()=>{
  const fixture=handoffHarness();try{
    await assert.rejects(fixture.submit({artifactPath:fixture.zip,dataDir:fixture.temp,prompt:'repair this existing failure'}),error=>{
      assert.equal(error.code,'CHATGPT_COMPOSER_UNAVAILABLE');assert.equal(error.diagnostic.path,fixture.diagnostic.path);return true;
    });
    assert.equal(fs.readFileSync(fixture.zip,'utf8'),'existing handoff bytes');assert.ok(fs.existsSync(fixture.diagnostic.path));
    assert.ok(fixture.events.includes('fail'));assert.ok(!fixture.events.includes('success'));assert.equal(fixture.events.at(-1),'close');
    assert.ok(!fixture.events.includes('mode-model-result'));
  }finally{fixture.cleanup()}
});

test('a genuinely signed-out automated dock returns login_required and closes its session',async()=>{
  const fixture=handoffHarness({loginRequired:true});try{
    const result=await fixture.submit({artifactPath:fixture.zip,dataDir:fixture.temp,prompt:'repair'});
    assert.equal(result.state,'login_required');assert.match(result.message,/docked/);assert.ok(fixture.events.includes('confirmed-sign-in-required'));
    assert.ok(!fixture.events.includes('fail'));assert.equal(fixture.events.at(-1),'close');assert.ok(fs.existsSync(fixture.zip));
  }finally{fixture.cleanup()}
});

test('manual Open ChatGPT also rejects a missing composer without inventing a logout',async()=>{
  const fixture=handoffHarness({disconnect:true});try{
    await assert.rejects(fixture.manual({dataDir:fixture.temp}),{code:'CHATGPT_COMPOSER_UNAVAILABLE'});assert.equal(fixture.events.at(-1),'close');
  }finally{fixture.cleanup()}
});

test('Resume Handoff retains the same archive and stays retryable without recursive self-heal',async()=>{
  const source=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const fn=source.slice(source.indexOf('async function submitCurrentHandoff('),source.indexOf('\nasync function submitImplementationTask',source.indexOf('async function submitCurrentHandoff(')));
  const state={workflow:{state:'waiting-login',repairAttempts:2,handoffPath:'/existing/failure.zip'},run:{state:'failed',exitCode:1}};
  let selfHeals=0,rebuilds=0,submittedPath,persists=0;
  const error=Object.assign(new Error('ChatGPT composer is unavailable in the docked ChatGPT window. Reload it, then choose Resume Handoff.'),{code:'CHATGPT_COMPOSER_UNAVAILABLE',diagnostic:{path:'/diagnostic.zip',name:'diagnostic.zip'}});
  const context={state,workflowBusy:false,cancelRequested:false,process:{env:{}},fs:{existsSync:()=>true},nextChatLoopSelection:()=>({mode:'Work',model:'GPT-5.6 Sol',thinkingEffort:'High'}),activity:()=>{},notify:()=>{},persist:()=>persists++,repairPrompt:()=> 'existing failure',dataDir:'/data',config:{autoSelfHeal:true},executeProtocol:async()=>{},submitRepairToChatGPT:async options=>{submittedPath=options.artifactPath;throw error},queueSelfHeal:()=>selfHeals++,selfHealCheckpoint:()=>({}),readSelfHealRequest:()=>null,setTimeout:()=>0,buildHandoff:()=>rebuilds++};
  vm.runInNewContext(fn+';this.resume=()=>submitCurrentHandoff({resume:true});',context);
  await context.resume();
  assert.equal(state.workflow.state,'handoff-error');assert.equal(state.workflow.handoffPath,'/existing/failure.zip');assert.equal(submittedPath,'/existing/failure.zip');
  assert.equal(state.workflow.repairAttempts,2);assert.equal(state.run.exitCode,1);assert.equal(selfHeals,0);assert.equal(rebuilds,0);assert.ok(persists>0);assert.equal(context.workflowBusy,false);
});
