import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Execute the production wait loop with a controlled clock, so five-hour
// command durations are verified without running another release gate.
function fixture({rollover=false,noCommand=false,waiting=false}={}){
 const text=fs.readFileSync(new URL('../automation/chatgpt.mjs',import.meta.url),'utf8').replaceAll('\r\n','\n');
 const start=text.indexOf('async function waitRepair('),end=text.indexOf('\n}\n',start)+3;
 let now=1000,ready=false,commands=0,prompts=0,chats=0,savedConversation='';
 const budget={due:noCommand&&rollover,complete(){},reset(){this.due=false}};
 const scope={Date:{now:()=>now},Number,String,Math,Error,Set,path:{basename:s=>s},
  delay:async ms=>{now+=ms},findFreshDownloadedZip:()=>ready?'received-repair.zip':null,
  hasFreshDownloadActivity:()=>false,chatGPTRequiredAction:async()=>null,
  chatResponseActivity:async()=>({generating:waiting,assistantMessages:waiting?0:1,assistantText:waiting?'':'command',href:'https://chatgpt.com/c/owned'}),
  responseActivityChanged:()=>!waiting,assistantProtocol:async()=>({protocol:noCommand||waiting?'':'YARDMASTER RUN full END'}),
  repairDownloadCandidate:async()=>null,usageLimitInfo:async()=>({limited:false}),chatCondition:async()=>null,
  continuationPrompt:()=> 'saved continuation',sendPrompt:async()=>{prompts++;now+=5*60*60*1000;ready=true},
  saveRecoveryState(){}};
 vm.createContext(scope);vm.runInContext(text.slice(start,end)+'\nthis.waitRepair=waitRepair;',scope);
 const context={exchangeBudget:budget,onAssistantProtocol:async()=>{commands++;now+=5*60*60*1000;budget.due=rollover;return 'owned test finished'},
  startFreshChat:async()=>{chats++;now+=5*60*60*1000;ready=true},onConversation:url=>{savedConversation=url},artifactPath:'owned-source.zip'};
 return {run:()=>scope.waitRepair({eval:async e=>e==='location.href'?'https://chatgpt.com/c/fresh':[]},'downloads',new Map(),()=>{},()=>false,0,context,4000),counts:()=>({commands,prompts,chats}),now:()=>now,saved:()=>savedConversation};
}
test('five-hour managed test and command-result submission leave a fresh bounded repair wait',async()=>{const f=fixture();assert.equal(await f.run(),'received-repair.zip');assert.deepEqual(f.counts(),{commands:1,prompts:1,chats:0})});
test('five-hour managed test followed by a fresh conversation does not reuse its expired timer',async()=>{const f=fixture({rollover:true});assert.equal(await f.run(),'received-repair.zip');assert.deepEqual(f.counts(),{commands:1,prompts:0,chats:1});assert.equal(f.saved(),'https://chatgpt.com/c/fresh')});
test('response-driven conversation rollover starts the budget after the new handoff is sent',async()=>{const f=fixture({rollover:true,noCommand:true});assert.equal(await f.run(),'received-repair.zip');assert.deepEqual(f.counts(),{commands:0,prompts:0,chats:1})});
test('unchanged ChatGPT waiting still expires; activity polling cannot extend the deadline',async()=>{const f=fixture({waiting:true});await assert.rejects(f.run(),/Timed out after four hours/);assert.equal(f.now(),5800);assert.deepEqual(f.counts(),{commands:0,prompts:0,chats:0})});
