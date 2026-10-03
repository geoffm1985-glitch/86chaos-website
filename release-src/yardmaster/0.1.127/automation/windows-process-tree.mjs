import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const run=promisify(execFile);

// ParentProcessId remains available for orphaned children. taskkill /T alone
// misses those children when npm or its shell has already exited.
export async function killWindowsProcessTrees(pids){
  const owned=new Set(pids.filter(pid=>Number.isInteger(pid)&&pid>0));
  if(!owned.size)return;
  const {stdout}=await run('powershell.exe',['-NoProfile','-Command',
    'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress'],
    {windowsHide:true,maxBuffer:4*1024*1024,timeout:15000});
  const processes=JSON.parse(stdout||'[]');
  let changed;
  do{
    changed=false;
    for(const child of Array.isArray(processes)?processes:[processes]){
      if(owned.has(child.ParentProcessId)&&!owned.has(child.ProcessId)){
        owned.add(child.ProcessId);changed=true;
      }
    }
  }while(changed);
  // Include descendants explicitly, even if their recorded root is dead.
  const args=[...owned].reverse().flatMap(pid=>['/PID',String(pid)]);
  try{await run('taskkill.exe',[...args,'/T','/F'],{windowsHide:true,timeout:15000})}
  catch(error){if(!Number.isInteger(error.code))throw error}
}
