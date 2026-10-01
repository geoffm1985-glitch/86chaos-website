import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {writeStoredZip} from '../automation/handoff-diagnostics.mjs';

const MAX_STAGE_OUTPUT=5*1024*1024;

function scrubDiagnosticText(value){
  let text=String(value??'');
  const home=os.homedir();
  if(home)text=text.split(home).join('<HOME>');
  return text
    .replace(/C:\\Users\\[^\\\s]+/gi,'C:\\Users\\[USER]')
    .replace(/\/Users\/[^/\s]+/g,'/Users/[USER]')
    .replace(/\/home\/[^/\s]+/g,'/home/[USER]')
    .replace(/(authorization\s*:\s*bearer\s+)[^\s]+/ig,'$1[REDACTED]')
    .replace(/\b(gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{25,}|sk-[A-Za-z0-9_-]{20,})\b/g,'[REDACTED]');
}
function safeSegment(value){return String(value||'failure').replace(/[^A-Za-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,70)||'failure'}
function stamp(){return new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z')}
function readOptional(root,relative){
  try{const file=path.join(root,relative);return fs.existsSync(file)?fs.readFileSync(file):null}catch{return null}
}
function gitSummary(root){
  try{
    const branch=execFileSync('git',['rev-parse','--abbrev-ref','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
    const commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
    const status=execFileSync('git',['status','--short'],{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:2*1024*1024,stdio:['ignore','pipe','pipe']}).trim();
    return scrubDiagnosticText(`branch: ${branch}\ncommit: ${commit}\nstatus:\n${status||'(clean)'}\n`);
  }catch(error){return 'git summary unavailable: '+scrubDiagnosticText(error?.message||error)+'\n'}
}

export function createCertificationDiagnostic({root,stage='UNKNOWN',code=1,results=[],output='',error=null,diagnosticDir}={}){
  const dir=diagnosticDir||path.join(root,'test-results','yardmaster-diagnostics');
  const file=path.join(dir,`Yardmaster-Test-Diagnostic-${stamp()}-${safeSegment(stage)}.zip`);
  const pkg=readOptional(root,'package.json');
  let version='unknown';
  try{version=JSON.parse(pkg?.toString('utf8')||'{}').version||'unknown'}catch{}
  const metadata={
    schema:1,
    createdAt:new Date().toISOString(),
    version,
    failedStage:String(stage),
    exitCode:Number(code)||1,
    results,
    platform:process.platform,
    arch:process.arch,
    node:process.version,
    error:error?String(error?.stack||error?.message||error):null
  };
  const entries=[
    {name:'diagnostic.json',data:JSON.stringify(metadata,null,2)+'\n'},
    {name:'stage-output.log',data:scrubDiagnosticText(output).slice(-MAX_STAGE_OUTPUT)},
    {name:'git.txt',data:gitSummary(root)},
    {name:'README.txt',data:'Yardmaster automatic test diagnostic. This ZIP is exported whenever any certification phase fails. It contains the failed phase, exit code, captured console output, version, and safe repository metadata.\n'}
  ];
  if(pkg)entries.push({name:'package.json',data:pkg});
  for(const relative of ['YARDMASTER_FEATURES.json','FULL_STORE_CANDIDATE.md']){
    const data=readOptional(root,relative);if(data)entries.push({name:relative,data});
  }
  writeStoredZip(file,entries);
  return file;
}

export function certificationStages(root){
  const files=fs.readdirSync(path.join(root,'test')).filter(f=>f.endsWith('.test.mjs')).sort().map(f=>path.join('test',f));
  return [
    {name:'FEATURE COVERAGE',args:['scripts/verify-feature-coverage.mjs']},
    {name:'NODE TESTS',args:['--test','--test-concurrency=1','--test-reporter=./scripts/reporters/node-status.mjs',...files]},
    {name:'PLAYWRIGHT TESTS',args:['node_modules/playwright/cli.js','test']}
  ];
}

export async function runCertification({root,stages=certificationStages(root),write=console.log,diagnosticDir}={}){
  const started=Date.now(),results=[];
  const env={...process.env,NO_COLOR:'1'};delete env.FORCE_COLOR;
  for(let index=0;index<stages.length;index++){
    const stage=stages[index];let stageOutput='';
    write(`\n[RUNNING] PHASE ${index+1}/${stages.length}: ${stage.name}`);
    const code=await new Promise(resolve=>{
      let settled=false;
      const finish=value=>{if(settled)return;settled=true;resolve(value)};
      let child;
      try{child=spawn(process.execPath,stage.args,{cwd:root,env,stdio:['inherit','pipe','pipe'],windowsHide:true})}
      catch(error){stageOutput+='[spawn exception] '+String(error?.stack||error)+'\n';write('[FAIL] Could not start '+stage.name+': '+error.message);finish(1);return}
      const capture=(chunk,target)=>{try{target.write(chunk)}catch{}stageOutput=(stageOutput+String(chunk)).slice(-MAX_STAGE_OUTPUT)};
      child.stdout?.on('data',chunk=>capture(chunk,process.stdout));
      child.stderr?.on('data',chunk=>capture(chunk,process.stderr));
      const interrupt=()=>{try{child.kill('SIGINT')}catch{}};process.once('SIGINT',interrupt);
      child.once('error',error=>{stageOutput+='[spawn error] '+String(error?.stack||error)+'\n';write('[FAIL] Could not start '+stage.name+': '+error.message);process.removeListener('SIGINT',interrupt);finish(1)});
      child.once('close',(childCode,signal)=>{process.removeListener('SIGINT',interrupt);finish(Number.isInteger(childCode)?childCode:signal==='SIGINT'?130:1)});
    });
    results.push({name:stage.name,code});write(`[${code===0?'PASS':'FAIL'}] PHASE ${index+1}/${stages.length}: ${stage.name} - exit code ${code}`);
    if(code!==0){
      for(const remaining of stages.slice(index+1))write(`[NOT RUN] ${remaining.name} - ${stage.name} failed`);
      let diagnosticPath=null;
      try{diagnosticPath=createCertificationDiagnostic({root,stage:stage.name,code,results,output:stageOutput,diagnosticDir});write('[DIAGNOSTIC] Exported failure ZIP: '+diagnosticPath)}
      catch(error){write('[WARN] Could not export failure diagnostic ZIP: '+error.message)}
      write(`\n================ OVERALL FAIL ================\nFailed phase: ${stage.name}\nExit code: ${code}\nElapsed: ${((Date.now()-started)/1000).toFixed(1)} seconds\n`);
      return {code,results,diagnosticPath};
    }
  }
  write(`\n================ OVERALL PASS ================\nAll ${stages.length} required phases passed.\nExit code: 0\nElapsed: ${((Date.now()-started)/1000).toFixed(1)} seconds\n`);
  return {code:0,results,diagnosticPath:null};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  try{process.exitCode=(await runCertification({root})).code;}
  catch(error){
    let diagnosticPath=null;
    try{diagnosticPath=createCertificationDiagnostic({root,stage:'RUNNER EXCEPTION',code:1,results:[],output:String(error?.stack||error),error});}
    catch(diagError){console.error('[WARN] Could not export runner exception diagnostic ZIP: '+diagError.message)}
    console.error('\n================ OVERALL FAIL ================\n'+error.stack+(diagnosticPath?'\n[DIAGNOSTIC] Exported failure ZIP: '+diagnosticPath:''));
    process.exitCode=1;
  }
}
