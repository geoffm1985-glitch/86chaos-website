import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EventEmitter} from 'node:events';
import {createChatExchangeBudget,continuationPrompt} from '../automation/chat-exchanges.mjs';
import {operatorManifestUrl,validateOperatorRelease,launchUpdaterProcess} from '../automation/operator-update.mjs';
import {__testHooks} from '../automation/chatgpt.mjs';

test('Play Store: two completed replies persist a rollover; streaming and duplicate polls do not count',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ym-exchanges-'));
  try{
    const b=createChatExchangeBudget({dataDir:dir,url:'chat-1',assistantBefore:7});
    assert.equal(b.complete({assistantMessages:8,generating:true,href:'chat-1'}),false);
    b.complete({assistantMessages:8,generating:false,href:'chat-1'});assert.equal(b.due,false);
    b.complete({assistantMessages:8,generating:false});assert.equal(b.exchanges,1);
    b.complete({assistantMessages:9,generating:false,href:'chat-1'});assert.equal(b.due,true);
    const resumed=createChatExchangeBudget({dataDir:dir,url:'chat-1',assistantBefore:9});assert.equal(resumed.due,true);
    resumed.reset('chat-2');assert.equal(resumed.exchanges,0);
    resumed.complete({assistantMessages:1,generating:false,href:'chat-2'});assert.equal(resumed.due,false);
    assert.equal(createChatExchangeBudget({dataDir:dir,url:'manual-new-chat'}).due,false);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('Play Store: exact second command reply rolls over after executing once and carries its result',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ym-wait-rollover-'));
  let fresh=false,executions=0,rollovers=0;
  const protocol='YARDMASTER\nPOWERSHELL\nWrite-Output evidence\nEND_POWERSHELL\nEND';
  const budget=createChatExchangeBudget({url:'chat-1'});budget.complete({assistantMessages:1,generating:false,href:'chat-1'});
  const cdp={eval:async expression=>{
    if(expression.includes('YM_CHAT_RESPONSE_ACTIVITY'))return {generating:false,assistantMessages:2,assistantText:protocol,href:'chat-1'};
    if(expression.includes('YM_LATEST_ASSISTANT_TEXT'))return protocol;
    if(expression.includes('YM_CONTINUATION_TURNS'))return [{role:'assistant',text:protocol}];
    if(expression==='location.href')return fresh?'chat-2':'chat-1';
    return '';
  }};
  try{
    const file=await __testHooks.waitRepair(cdp,dir,new Map(),()=>{},()=>false,1,{
      exchangeBudget:budget,prompt:'Fix only testing',artifactPath:'current.zip',mode:'Work',model:'GPT-5.6 Sol',thinkingEffort:'High',dataDir:dir,
      onAssistantProtocol:async command=>{assert.equal(command,protocol);executions++;return 'POWERSHELL exit=0; evidence captured'},
      startFreshChat:async(_cdp,mode,model,effort,artifact,prompt,_status,_data,reason)=>{
        rollovers++;assert.equal(mode,'Work');assert.equal(model,'GPT-5.6 Sol');assert.equal(effort,'High');assert.equal(artifact,'current.zip');
        assert.match(prompt,/POWERSHELL exit=0; evidence captured/);assert.match(prompt,/must not be executed again/);assert.equal(reason,'Two exchanges completed');
        fresh=true;fs.writeFileSync(path.join(dir,'fixed.zip'),'zip fixture');fs.utimesSync(path.join(dir,'fixed.zip'),new Date(0),new Date(0));
      }
    },3000);
    assert.equal(path.basename(file),'fixed.zip');assert.equal(executions,1);assert.equal(rollovers,1);assert.equal(budget.exchanges,0);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('Play Store: a completed ZIP is collected before any chat rollover',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ym-zip-rollover-'));
  try{
    const file=path.join(dir,'fixed.zip');fs.writeFileSync(file,'zip fixture');fs.utimesSync(file,new Date(0),new Date(0));
    const result=await __testHooks.waitRepair({eval(){throw new Error('Should collect ZIP first')}},dir,new Map(),()=>{},()=>false,0,{exchangeBudget:{due:true}},500);
    assert.equal(result,file);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('Play Store: a newly completed ZIP settling on disk is collected without rolling over',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ym-settling-'));
  const budget=createChatExchangeBudget({url:'chat-1'});
  budget.complete({assistantMessages:1,generating:false,href:'chat-1'});
  let rollover=false;
  try{
    const file=path.join(dir,'fixed.zip');fs.writeFileSync(file,'zip fixture');
    const cdp={eval:async expression=>expression.includes('YM_CHAT_RESPONSE_ACTIVITY')?{assistantMessages:2,generating:false,assistantText:'Completed ZIP',href:'chat-1'}:''};
    const result=await __testHooks.waitRepair(cdp,dir,new Map(),()=>{},()=>false,1,{exchangeBudget:budget,startFreshChat:async()=>{rollover=true}},3000);
    assert.equal(result,file);assert.equal(rollover,false);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('Play Store: continuation includes original task, recent replies and completed command evidence',()=>{
  const prompt=continuationPrompt('testing only',[{role:'assistant',text:'exact diagnosis'}],'exit=0');
  for(const text of ['testing only','exact diagnosis','exit=0','must not be executed again','COMPLETE APPLICATION ZIP'])assert.ok(prompt.includes(text));
});

const candidate={version:'0.1.100',channel:'testing',verified:false,verification:{candidate:'testing-only'},downloadUrl:'https://example.invalid/test.zip',sha256:'a'.repeat(64)};
test('Play Store: testing candidate requires testing channel and a manual update; production verification remains required',()=>{
  assert.equal(validateOperatorRelease(candidate,{channel:'testing',allowTestingCandidate:true}),candidate);
  assert.throws(()=>validateOperatorRelease(candidate),/not verified/);
  assert.throws(()=>validateOperatorRelease(candidate,{channel:'testing'}),/manual update/);
  assert.throws(()=>validateOperatorRelease({...candidate,sha256:'invalid'},{channel:'testing',allowTestingCandidate:true}),/incomplete/);
  assert.equal(validateOperatorRelease({...candidate,verified:true}).verified,true);
  const pinned=validateOperatorRelease({...candidate,updateDownloadUrl:'https://raw.githubusercontent.com/pinned.zip',updateSha256:'b'.repeat(64)},{channel:'testing',allowTestingCandidate:true});
  assert.equal(pinned.downloadUrl,'https://raw.githubusercontent.com/pinned.zip');assert.equal(pinned.sha256,'b'.repeat(64));
  assert.throws(()=>validateOperatorRelease({...candidate,updateDownloadUrl:'https://raw.githubusercontent.com/pinned.zip'},{channel:'testing',allowTestingCandidate:true}),/checksum is incomplete/);
});
test('Play Store: testing feed uses the public branch manifest and honors an explicit environment override',()=>{
  const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url)));
  assert.equal(pkg.releaseChannel,'testing');assert.match(operatorManifestUrl(pkg,{}),/yardmaster-testing\/public\/yardmaster\/release.json$/);
  assert.equal(operatorManifestUrl(pkg,{YARDMASTER_RELEASE_MANIFEST:'https://override.invalid/release.json'}),'https://override.invalid/release.json');
  assert.match(operatorManifestUrl({},{}),/www\.86chaos\.com/);
});
test('Play Store: updater spawn failure propagates and successful launch detaches only after spawn',async()=>{
  const failed=new EventEmitter();queueMicrotask(()=>failed.emit('error',new Error('ENOENT powershell.exe')));
  await assert.rejects(launchUpdaterProcess([],{spawnProcess:()=>failed}),/ENOENT/);
  const child=new EventEmitter();let detached=false;child.unref=()=>{detached=true};
  const launched=launchUpdaterProcess(['-File','update.ps1'],{spawnProcess:(exe,args)=>{assert.equal(exe,'powershell.exe');assert.deepEqual(args,['-File','update.ps1']);return child}});
  assert.equal(detached,false);child.emit('spawn');assert.equal(await launched,child);assert.equal(detached,true);
});
test('Play Store: updater preserves app through canary checks and records installation failures',()=>{
  const server=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const script=fs.readFileSync(new URL('../scripts/Update-Yardmaster.ps1',import.meta.url),'utf8');
  const launch=server.slice(server.indexOf('async function launchOperatorUpdater'),server.indexOf('async function requestOperatorUpdate'));
  assert.doesNotMatch(launch,/process\.exit/);assert.match(launch,/await launchUpdaterProcess/);assert.match(launch,/Could not start Windows updater/);
  assert.ok(script.indexOf("candidate failed its isolated canary launch")<script.indexOf('  Stop-YardmasterAppProcesses'));
  assert.match(script,/AllowTestingCandidate.*manifest.channel -eq 'testing'/);assert.match(script,/operator-update-result.json/);
  assert.match(server,/readOperatorUpdateResult/);assert.match(server,/loopRun:!!wf.closedLoop/);
});
