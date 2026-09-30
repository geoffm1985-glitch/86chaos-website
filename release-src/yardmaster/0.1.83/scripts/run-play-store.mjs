import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

export function certificationStages(root){
  const files=fs.readdirSync(path.join(root,'test')).filter(f=>f.endsWith('.test.mjs')).sort().map(f=>path.join('test',f));
  return [
    {name:'FEATURE COVERAGE',args:['scripts/verify-feature-coverage.mjs']},
    {name:'NODE TESTS',args:['--test','--test-concurrency=1','--test-reporter=./scripts/reporters/node-status.mjs',...files]},
    {name:'PLAYWRIGHT TESTS',args:['node_modules/playwright/cli.js','test']}
  ];
}

export async function runCertification({root,stages=certificationStages(root),write=console.log}={}){
  const started=Date.now(),results=[];
  const env={...process.env,NO_COLOR:'1'};delete env.FORCE_COLOR;
  for(let index=0;index<stages.length;index++){
    const stage=stages[index];write(`\n[RUNNING] PHASE ${index+1}/${stages.length}: ${stage.name}`);
    const code=await new Promise(resolve=>{
      const child=spawn(process.execPath,stage.args,{cwd:root,env,stdio:'inherit',windowsHide:true});
      const interrupt=()=>{child.kill('SIGINT');};process.once('SIGINT',interrupt);
      child.once('error',error=>{write('[FAIL] Could not start '+stage.name+': '+error.message);});
      child.once('close',(code,signal)=>{process.removeListener('SIGINT',interrupt);resolve(Number.isInteger(code)?code:signal==='SIGINT'?130:1);});
    });
    results.push({name:stage.name,code});write(`[${code===0?'PASS':'FAIL'}] PHASE ${index+1}/${stages.length}: ${stage.name} - exit code ${code}`);
    if(code!==0){
      for(const remaining of stages.slice(index+1))write(`[NOT RUN] ${remaining.name} - ${stage.name} failed`);
      write(`\n================ OVERALL FAIL ================\nFailed phase: ${stage.name}\nExit code: ${code}\nElapsed: ${((Date.now()-started)/1000).toFixed(1)} seconds\n`);
      return {code,results};
    }
  }
  write(`\n================ OVERALL PASS ================\nAll ${stages.length} required phases passed.\nExit code: 0\nElapsed: ${((Date.now()-started)/1000).toFixed(1)} seconds\n`);
  return {code:0,results};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
  try{process.exitCode=(await runCertification({root})).code;}
  catch(error){console.error('\n================ OVERALL FAIL ================\n'+error.stack);process.exitCode=1;}
}
