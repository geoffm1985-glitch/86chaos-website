import fs from 'node:fs';
import path from 'node:path';

export function readRunProject(repoPath){
  let pkg={};try{pkg=JSON.parse(fs.readFileSync(path.join(repoPath||'','package.json'),'utf8'))}catch{}
  const name=typeof pkg.name==='string'?pkg.name.trim():'';
  const version=typeof pkg.version==='string'&&/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?$/.test(pkg.version)?pkg.version:null;
  const displayName=/^86[-_ ]?chaos$/i.test(name)?'86 Chaos':/^yardmaster$/i.test(name)?'Yardmaster':name;
  return {name:name||null,version,label:[displayName,version||'Version unavailable'].filter(Boolean).join(' ')};
}

// Once a run starts, keep its source identity even if settings or files change.
export function workingProject(run,repositoryPath){return run?.project||readRunProject(run?.cwd||repositoryPath)}
