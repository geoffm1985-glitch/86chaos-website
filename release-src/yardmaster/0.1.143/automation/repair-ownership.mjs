import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execFileAsync=promisify(execFile);

const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const ledgerFile=dataDir=>path.join(dataDir,'applied-repair-ownership.json');
const artifact=name=>/(?:SLIM-UPLOAD-ME|EXACT-FAILED-SOURCE|Yardmaster-Handoff)[^/]*\.zip$/i.test(name);
export function repairSourceFingerprint(repoPath){
 const root=fs.realpathSync(repoPath),git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:10000});
 const paths=[...new Set([...git(['diff','--name-only','-z','HEAD']).split('\0'),...git(['ls-files','--others','--exclude-standard','-z']).split('\0')])].filter(name=>name&&!artifact(name)).sort();
 const files=paths.map(name=>{
  const file=path.resolve(root,name);
  if(!file.startsWith(root+path.sep))throw Error('Repair ownership source is outside the repository.');
  if(!fs.existsSync(file))return [name,'deleted'];
  if(fs.lstatSync(file).isSymbolicLink())throw Error('Repair ownership cannot authorize a symbolic link.');
  return [name,digest(fs.readFileSync(file))];
 });
 return {repository:process.platform==='win32'?root.toLowerCase():root,head:git(['rev-parse','HEAD']).trim(),fingerprint:digest(JSON.stringify(files)),sourceChanges:files.length};
}
export function recordAppliedRepairOwnership(dataDir,repoPath,repair){
 if(!repair?.zipPath||!fs.existsSync(repair.zipPath))throw Error('Applied repair archive is unavailable for ownership recording.');
 const record={schema:1,...repairSourceFingerprint(repoPath),archiveSha256:digest(fs.readFileSync(repair.zipPath)),repair:{...repair},recordedAt:Date.now()};
 fs.mkdirSync(dataDir,{recursive:true});const file=ledgerFile(dataDir);
 fs.writeFileSync(file+'.tmp',JSON.stringify(record,null,2)+'\n');fs.renameSync(file+'.tmp',file);return record;
}
export function repairSourceIsOwned(dataDir,repoPath){
 const current=repairSourceFingerprint(repoPath);
 if(current.sourceChanges===0)return true;
 let saved;try{saved=JSON.parse(fs.readFileSync(ledgerFile(dataDir),'utf8'))}catch{return false}
 return saved.schema===1&&saved.repository===current.repository&&saved.head===current.head&&saved.fingerprint===current.fingerprint;
}

// A repair overlay can trigger a busy application rebuild. Ownership inspection
// must keep the operator responsive and tolerate bounded Git delays without
// weakening the exact source/archive comparison.
export async function repairSourceFingerprintAsync(repoPath,{runGit,timeoutMs=60000}={}){
 const root=fs.realpathSync(repoPath);
 const execute=runGit|| (async args=>(await execFileAsync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,timeout:timeoutMs,maxBuffer:20*1024*1024})).stdout);
 const git=async args=>{for(let attempt=0;;attempt++){try{return await execute(args)}catch(error){if(attempt!==0||!(error.code==='ETIMEDOUT'||(error.killed&&error.signal)))throw error}}};
 const paths=[...new Set([...(await git(['diff','--name-only','-z','HEAD'])).split('\0'),...(await git(['ls-files','--others','--exclude-standard','-z'])).split('\0')])].filter(name=>name&&!artifact(name)).sort();
 const files=paths.map(name=>{const file=path.resolve(root,name);if(!file.startsWith(root+path.sep))throw Error('Repair ownership source is outside the repository.');if(!fs.existsSync(file))return [name,'deleted'];if(fs.lstatSync(file).isSymbolicLink())throw Error('Repair ownership cannot authorize a symbolic link.');return [name,digest(fs.readFileSync(file))]});
 return {repository:process.platform==='win32'?root.toLowerCase():root,head:(await git(['rev-parse','HEAD'])).trim(),fingerprint:digest(JSON.stringify(files)),sourceChanges:files.length};
}
export async function recordAppliedRepairOwnershipAsync(dataDir,repoPath,repair,options){
 if(!repair?.zipPath||!fs.existsSync(repair.zipPath))throw Error('Applied repair archive is unavailable for ownership recording.');
 const record={schema:1,...await repairSourceFingerprintAsync(repoPath,options),archiveSha256:digest(fs.readFileSync(repair.zipPath)),repair:{...repair},recordedAt:Date.now()};
 fs.mkdirSync(dataDir,{recursive:true});const file=ledgerFile(dataDir);fs.writeFileSync(file+'.tmp',JSON.stringify(record,null,2)+'\n');fs.renameSync(file+'.tmp',file);return record;
}
export async function repairSourceIsOwnedAsync(dataDir,repoPath,options){
 const current=await repairSourceFingerprintAsync(repoPath,options);if(current.sourceChanges===0)return true;
 let saved;try{saved=JSON.parse(fs.readFileSync(ledgerFile(dataDir),'utf8'))}catch{return false}
 return saved.schema===1&&saved.repository===current.repository&&saved.head===current.head&&saved.fingerprint===current.fingerprint;
}
