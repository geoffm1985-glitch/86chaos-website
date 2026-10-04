import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export function updateCopyFixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ym-update-copy-')),source=path.join(root,'source'),installed=path.join(root,'installed');
  for(const [dir,version] of [[source,'0.1.134'],[installed,'0.1.132']]){
    fs.mkdirSync(dir,{recursive:true});
    for(const [name,body] of [['package.json',JSON.stringify({version})],['index.html',`<p id="version">${version}</p>`]]){const file=path.join(dir,name);fs.writeFileSync(file,body);fs.utimesSync(file,new Date('2026-10-01T12:00:00Z'),new Date('2026-10-01T12:00:00Z'))}
  }
  const helper=fileURLToPath(new URL('../../scripts/Copy-YardmasterApplication.ps1',import.meta.url));
  const script=path.join(root,'copy.ps1');
  const quote=s=>"'"+s.replaceAll("'","''")+"'";
  const run=commands=>{fs.writeFileSync(script,`$ErrorActionPreference='Stop'\n. ${quote(helper)}\n${commands}`);return execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script],{encoding:'utf8',windowsHide:true})};
  return {root,source,installed,copy:()=>run(`Copy-YardmasterApplication -Source ${quote(source)} -Destination ${quote(installed)}`),verify:()=>run(`Assert-YardmasterApplicationCopy -Source ${quote(source)} -Destination ${quote(installed)}`),dispose:()=>fs.rmSync(root,{recursive:true,force:true})};
}
