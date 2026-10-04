import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import vm from 'node:vm';
export async function sourceHandoffRegression(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ym-source-handoff-')),repo=path.join(dir,'repo'),output=path.join(dir,'complete.zip');
 fs.mkdirSync(path.join(repo,'src'),{recursive:true});fs.mkdirSync(path.join(repo,'test-results'),{recursive:true});
 fs.writeFileSync(path.join(repo,'package.json'),'{"name":"handoff-fixture","version":"1.0.0"}');fs.writeFileSync(path.join(repo,'src/app.js'),'export const value=42;');
 for(const name of ['.env.local','service-account.json','86chaos-17.0.57-EXACT-FAILED-SOURCE.zip'])fs.writeFileSync(path.join(repo,name),'must stay local');
 const report=path.join(dir,'saved-SLIM-UPLOAD-ME.zip');fs.writeFileSync(report,'exact saved failure evidence');
 try{
  execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',new URL('../../scripts/New-Handoff.ps1',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'),'-RepoPath',repo,'-OutputPath',output,'-FailureArchive',report,'-FailureSummary','actual failed test'],{windowsHide:true,timeout:30000,stdio:'pipe'});
  const inspect=path.join(dir,'inspect.ps1');fs.writeFileSync(inspect,`Add-Type -AssemblyName System.IO.Compression.FileSystem\n$zip=[IO.Compression.ZipFile]::OpenRead('${output.replaceAll("'","''")}')\ntry{foreach($entry in $zip.Entries){$reader=[IO.StreamReader]::new($entry.Open());try{@{name=$entry.FullName;content=$reader.ReadToEnd()}|ConvertTo-Json -Compress}finally{$reader.Dispose()}}}finally{$zip.Dispose()}`);
  const entries=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-File',inspect],{encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/).map(x=>JSON.parse(x));
  const entry=name=>entries.find(x=>x.name.replaceAll('\\','/')===name);
  assert.equal(entry('app/src/app.js')?.content,'export const value=42;');assert.ok(entry('app/package.json'));
  assert.equal(entry('evidence/saved-SLIM-UPLOAD-ME.zip')?.content,'exact saved failure evidence');assert.match(entry('YARDMASTER_PROMPT.txt')?.content||'',/actual failed test/);
  assert.ok(!entries.some(x=>/\.env|service-account|EXACT-FAILED-SOURCE/.test(x.name)));assert.equal(fs.readFileSync(report,'utf8'),'exact saved failure evidence');
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
}
export async function resumeSourceHandoffRegression(){
 const source=fs.readFileSync(new URL('../../server.mjs',import.meta.url),'utf8');
 const start=source.indexOf('async function submitCurrentHandoff('),end=source.indexOf('  if(!resume){wf.repairAttempts',start);
 assert.ok(start>=0&&end>start,'Saved handoff function boundaries must exist');
 const prefix=source.slice(start,end)+'\nreturn wf;\n}';
 for(const kind of ['release-gate-slim',null]){
  const calls=[],state={workflow:{state:'waiting-action',handoffPath:'saved-SLIM-UPLOAD-ME.zip',handoffKind:kind,repairAttempts:4,requiredAction:{service:'PowerShell'}}};
  const fn=vm.runInNewContext(prefix+'\nsubmitCurrentHandoff;',{state,process:{env:{}},fs:{existsSync:()=>true},activity(){},persist(){},latestReleaseGateSlimZip:()=>null,buildHandoff:report=>{calls.push(report);return 'combined-source-report.zip'},workflowBusy:false});
  const result=await fn({resume:true});
  calls.push(result);assert.equal(calls[0],'saved-SLIM-UPLOAD-ME.zip');assert.equal(state.workflow.handoffPath,'combined-source-report.zip');assert.equal(state.workflow.failureReportPath,'saved-SLIM-UPLOAD-ME.zip');assert.equal(state.workflow.repairAttempts,4);
 }
}
