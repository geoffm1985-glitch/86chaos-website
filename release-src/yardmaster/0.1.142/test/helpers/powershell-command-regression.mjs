import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {runPowerShellClipboardCommand} from '../../automation/windows-operator.mjs';
import {__testHooks} from '../../automation/chatgpt.mjs';

export async function commandExecutionRegression(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ym-command-')),marker=path.join(dir,'marker.txt');
 const literal=marker.replaceAll("'","''"),run=script=>runPowerShellClipboardCommand({dataDir:dir,cwd:dir,script,timeoutMs:8000});
 try{
  // The real failure pasted/executed its first line before reaching this corrupted variable.
  await assert.rejects(run(`Set-Content -LiteralPath '${literal}' -Value 'should never run'\n@('x') | Where-Object { @('y') -notcontains $.Name }`),e=>e.code==='POWERSHELL_SYNTAX');
  assert.equal(fs.existsSync(marker),false);
  const result=await run(`$value=@'\nfirst line\nsecond line $_ $env:TEMP\n'@\nSet-Content -LiteralPath '${literal}' -Value $value\nWrite-Output 'completed evidence'`);
  assert.equal(result.code,0);assert.match(result.stdout,/completed evidence/);
  assert.match(fs.readFileSync(marker,'utf8'),/second line \$_ \$env:TEMP/);
  const started=Date.now(),prompt=await run('Read-Host "This must not wait for keyboard input"');
  assert.notEqual(prompt.code,0);assert.match(prompt.stderr,/NonInteractive/i);assert.ok(Date.now()-started<8000);
  assert.equal(result.pastedWithCtrlV,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
}
export async function commandFeedbackRegression(exhaust=false){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ym-command-feedback-'));
 const report=path.join(dir,'saved-report.txt');fs.writeFileSync(report,'preserved');
 let attempts=0;const prompts=[];
 const protocol=()=>`YARDMASTER\nPOWERSHELL\nWrite-Output attempt${attempts}\nEND_POWERSHELL\nEND`;
 const cdp={eval:async expression=>{
  if(expression.includes('YM_CHAT_RESPONSE_ACTIVITY'))return {generating:false,assistantMessages:attempts+1,assistantText:protocol(),href:'saved-chat'};
  if(expression.includes('YM_LATEST_ASSISTANT_TEXT'))return vm.runInNewContext(expression,{document:{querySelectorAll:selector=>selector==='[data-message-author-role="assistant"]'?[{innerText:protocol(),textContent:protocol()}]:[]}});
  return '';
 }};
 const context={exchangeBudget:{due:true,complete(){},reset(){}},onAssistantProtocol:async()=>{attempts++;throw Object.assign(new Error('Line 2: malformed command'),{code:'POWERSHELL_SYNTAX'})},startFreshChat:async(_cdp,_mode,_model,_effort,_artifact,prompt)=>{
  prompts.push(prompt);if(!exhaust){const zip=path.join(dir,'fixed.zip');fs.writeFileSync(zip,'fixed');fs.utimesSync(zip,new Date(0),new Date(0))}
 }};
 try{
  const promise=__testHooks.waitRepair(cdp,dir,new Map(),()=>{},()=>false,0,context,15000);
  if(exhaust){await assert.rejects(promise,e=>e.code==='CHATGPT_ACTION_REQUIRED'&&e.requiredAction.service==='PowerShell');assert.equal(attempts,3)}
  else {assert.equal(path.basename(await promise),'fixed.zip');assert.equal(attempts,1)}
  assert.match(prompts[0],/Line 2: malformed command/);assert.match(prompts[0],/Do not request interactive input/);
  assert.equal(fs.readFileSync(report,'utf8'),'preserved');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
}
