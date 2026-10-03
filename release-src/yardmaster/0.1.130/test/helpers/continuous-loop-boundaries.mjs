import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {writeStoredZip} from '../../automation/handoff-diagnostics.mjs';
import {__testHooks} from '../../automation/chatgpt.mjs';

export function sourceEntries(repo){
  const entries=[];
  const walk=(dir,prefix='')=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    if(['.git','node_modules','test-results'].includes(e.name))continue;
    const rel=prefix+e.name,file=path.join(dir,e.name);
    if(e.isDirectory())walk(file,rel+'/');else entries.push({name:rel,data:fs.readFileSync(file)});
  }};walk(repo);return entries;
}
export function storedZipEntries(file){
  const bytes=fs.readFileSync(file),entries=[];let offset=0;
  while(bytes.readUInt32LE(offset)===0x04034b50){
    const flags=bytes.readUInt16LE(offset+6),method=bytes.readUInt16LE(offset+8),size=bytes.readUInt32LE(offset+18),nameSize=bytes.readUInt16LE(offset+26),extraSize=bytes.readUInt16LE(offset+28);
    if(method!==0||(flags&8))throw new Error('Continuous fixture requires stored ZIP entries.');
    const name=bytes.subarray(offset+30,offset+30+nameSize).toString('utf8'),start=offset+30+nameSize+extraSize;
    if(name.includes('..')||path.isAbsolute(name)||name.startsWith('.git/'))throw new Error('Unsafe fixture archive entry.');
    entries.push({name,data:bytes.subarray(start,start+size)});offset=start+size;
  }
  return entries;
}
export function createContinuousLoopBoundaries({dataDir,repoPath,testingUrl}){
  const sandbox=path.join(dataDir,'sandbox'),repo=path.join(sandbox,'repo'),remote=path.join(sandbox,'remote.git');
  const pkg=JSON.parse(fs.readFileSync(path.join(repoPath,'package.json'),'utf8'));
  const origin=execFileSync('git',['remote','get-url','origin'],{cwd:repoPath,encoding:'utf8'}).trim();
  const base=new URL(testingUrl);
  if(path.resolve(repoPath)!==path.resolve(repo)||pkg.name!=='yardmaster-continuous-loop-fixture'||!fs.existsSync(path.join(sandbox,'fixture.marker'))||path.resolve(origin)!==path.resolve(remote)||base.protocol!=='http:'||base.hostname!=='127.0.0.1')throw new Error('Continuous loop simulation requires its isolated local sandbox.');
  const request=async(route,body)=>{
    const response=await fetch(new URL(route,base),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const result=await response.json();if(!response.ok||result.error)throw new Error(result.error||'Fixture transport failed');return result;
  };
  return {
    buildHandoff({failure,prompt}){
      const dir=path.join(dataDir,'handoffs');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'Continuous-Handoff-'+Date.now()+'.zip');
      writeStoredZip(file,[...sourceEntries(repo),{name:'YARDMASTER_PROMPT.txt',data:prompt},{name:'evidence/current-failure.txt',data:failure}]);return file;
    },
    async submitRepair(options){
      const downloads=path.join(dataDir,'chatgpt-downloads');fs.mkdirSync(downloads,{recursive:true});const before=__testHooks.snapshotDownloads(downloads);
      await request('/chat/start',{artifactPath:options.artifactPath,prompt:options.prompt,mode:options.mode,model:options.model,thinkingEffort:options.thinkingEffort,downloads});
      const cdp={eval:async expression=>(await request('/chat/eval',{expression})).value};
      const repairPath=await __testHooks.waitRepair(cdp,downloads,before,options.onStatus,options.shouldCancel,0,{...options},120000);
      return {state:'downloaded',repairPath};
    },
    applyRepair(zip){
      const entries=storedZipEntries(zip);if(entries.length<50)throw new Error('Fixture repair archive is incomplete.');
      const incoming=JSON.parse(entries.find(e=>e.name==='package.json').data.toString());const current=JSON.parse(fs.readFileSync(path.join(repo,'package.json'),'utf8'));
      if(incoming.version.localeCompare(current.version,undefined,{numeric:true})<=0)throw new Error('Fixture repair must increment version.');
      for(const e of entries){const p=path.join(repo,e.name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,e.data)}
    }
  };
}
