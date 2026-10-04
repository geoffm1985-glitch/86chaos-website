import {spawn} from 'node:child_process';

export function operatorManifestUrl(pkg,env=process.env){
  return env.YARDMASTER_RELEASE_MANIFEST||pkg.updateManifestUrl||'https://www.86chaos.com/yardmaster/release.json';
}
export function validateOperatorRelease(release,{channel='production',allowTestingCandidate=false}={}){
  const testingCandidate=channel==='testing'&&allowTestingCandidate&&release?.channel==='testing'&&release?.verification?.candidate==='testing-only';
  if(!release?.version||!/^\d+\.\d+\.\d+$/.test(release.version)||!release.downloadUrl||!/^https:\/\//.test(release.downloadUrl)&&!release.downloadUrl.startsWith('/')||!/^[a-f0-9]{64}$/i.test(release.sha256||'')||release.verified!==true&&!testingCandidate){
    throw new Error('Release manifest is incomplete or not verified. Testing candidates require a manual update from a testing installation.');
  }
  if(release.updateDownloadUrl){
    if(!/^https:\/\//.test(release.updateDownloadUrl)||!/^[a-f0-9]{64}$/i.test(release.updateSha256||''))throw new Error('Update package URL or checksum is incomplete.');
    return {...release,downloadUrl:release.updateDownloadUrl,sha256:release.updateSha256};
  }
  return release;
}
const psLiteral=value=>"'"+String(value).replaceAll("'","''")+"'";
export function guardedUpdaterArguments(args,{dataDir,startedAt}){
  const fileIndex=args.indexOf('-File');
  if(fileIndex<0||!args[fileIndex+1])throw new Error('Updater script is missing.');
  const progress=psLiteral(dataDir+'/operator-update-progress.json'),result=psLiteral(dataDir+'/operator-update-result.json'),log=psLiteral(dataDir+'/operator-update.log');
  const command=`$ErrorActionPreference='Stop'; try { New-Item -ItemType Directory -Force -Path ${psLiteral(dataDir)} | Out-Null; @{state='starting';pid=$PID;startedAt=${Number(startedAt)}} | ConvertTo-Json | Set-Content -LiteralPath ${progress} -Encoding UTF8; & ${args.slice(fileIndex+1).map(psLiteral).join(' ')} *>> ${log} } catch { @{state='failed';startedAt=${Number(startedAt)};error=$_.Exception.Message;logPath=${log}} | ConvertTo-Json | Set-Content -LiteralPath ${result} -Encoding UTF8; exit 1 }`;
  return ['-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')];
}
export function updaterProcessFailure(update,{now=Date.now(),isAlive}={}){
  if(update?.state!=='Updating'||!update.pid||now-Number(update.startedAt)<10000||isAlive(update.pid))return null;
  return 'The Windows updater stopped before installation completed. The saved workflow is retained; retry the update.';
}
export function launchUpdaterProcess(args,{spawnProcess=spawn,onExit=()=>{},independent=false}={}){
  if(independent){
    // Start-Process gives the updater its own hidden Windows console. Node's
    // detached flag skips execution; an inherited console dies with the operator.
    const command=`$ErrorActionPreference='Stop'; $child=Start-Process -FilePath 'powershell.exe' -WindowStyle Hidden -PassThru -ArgumentList @(${args.map(psLiteral).join(',')}); [Console]::Out.Write($child.Id)`;
    return new Promise((resolve,reject)=>{
      const child=spawnProcess('powershell.exe',['-NoProfile','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{detached:false,stdio:['ignore','pipe','pipe'],windowsHide:true});
      let output='',error='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);child.once('error',reject);
      child.once('exit',code=>{const pid=Number(output.trim());if(code!==0||!Number.isInteger(pid)||pid<=0){reject(new Error('Windows updater launcher failed: '+(error.trim()||'exit '+code)));return}resolve({pid})});
    });
  }
  return new Promise((resolve,reject)=>{
    // The non-independent path is used by focused launch fixtures.
    const child=spawnProcess('powershell.exe',args,{detached:false,stdio:'ignore',windowsHide:true});
    child.once('error',reject);
    child.once('exit',(code,signal)=>onExit({code,signal,pid:child.pid}));
    child.once('spawn',()=>{child.unref();resolve(child)});
  });
}
