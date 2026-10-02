import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';

const readJson=(p,f=null)=>{try{return JSON.parse(fs.readFileSync(p,'utf8'))}catch{return f}};
const pidAlive=pid=>{
  const n=Number(pid);if(!n)return false;
  try{process.kill(n,0);return true}catch{
    if(process.platform!=='win32')return false;
    try{
      const out=execFileSync('tasklist.exe',['/FI','PID eq '+n,'/FO','CSV','/NH'],{encoding:'utf8',windowsHide:true,timeout:5000}).trim();
      if(out&&!/^INFO:/i.test(out)&&new RegExp('^"[^"]+","'+n+'"').test(out))return true;
    }catch{}
    try{
      execFileSync('powershell.exe',['-NoProfile','-Command',`if(Get-Process -Id ${n} -ErrorAction SilentlyContinue){exit 0}else{exit 1}`],{windowsHide:true,stdio:'ignore',timeout:5000});
      return true;
    }catch{return false}
  }
};
const inside=(file,root)=>{const f=path.resolve(file),r=path.resolve(root);return f===r||f.startsWith(r+path.sep)};
const psLit=s=>String(s).replaceAll("'","''");

function clipboardText(){
  if(process.platform!=='win32')return null;
  const command=[
    "$ErrorActionPreference='Stop'",
    '$last=$null',
    'for($i=0;$i -lt 12;$i++){',
    '  try{$v=Get-Clipboard -Raw -ErrorAction Stop;if($null -ne $v){[Console]::Out.Write($v)};exit 0}',
    '  catch{$last=$_;Start-Sleep -Milliseconds ([Math]::Min(900,75+($i*75)))}',
    '}',
    'throw $last'
  ].join('\n');
  try{return execFileSync('powershell.exe',['-NoProfile','-Sta','-Command',command],{encoding:'utf8',windowsHide:true,maxBuffer:2*1024*1024,timeout:15000})}catch{return null}
}
function setClipboardFromFile(file){
  const command=[
    "$ErrorActionPreference='Stop'",
    `$value=Get-Content -LiteralPath '${psLit(file)}' -Raw`,
    '$last=$null',
    'for($i=0;$i -lt 12;$i++){',
    '  try{$value | Set-Clipboard -ErrorAction Stop;exit 0}',
    '  catch{$last=$_;Start-Sleep -Milliseconds ([Math]::Min(900,75+($i*75)))}',
    '}',
    'throw $last'
  ].join('\n');
  execFileSync('powershell.exe',['-NoProfile','-Sta','-Command',command],{encoding:'utf8',windowsHide:true,maxBuffer:2*1024*1024,timeout:15000});
}
function clearClipboard(){
  const command=[
    "$ErrorActionPreference='Stop'",
    '$last=$null',
    'for($i=0;$i -lt 12;$i++){',
    '  try{Set-Clipboard -Value $null -ErrorAction Stop;exit 0}',
    '  catch{$last=$_;Start-Sleep -Milliseconds ([Math]::Min(900,75+($i*75)))}',
    '}',
    'throw $last'
  ].join('\n');
  execFileSync('powershell.exe',['-NoProfile','-Sta','-Command',command],{windowsHide:true,stdio:'ignore',timeout:15000});
}
function restoreClipboard(value,dir){
  try{
    if(value===null||value===undefined){clearClipboard();return}
    const p=path.join(dir,'clipboard-restore.txt');fs.writeFileSync(p,String(value),'utf8');setClipboardFromFile(p);
  }catch{}
}
function rejectUnsafeProductionCommand(command){
  const s=String(command||'');
  if(/\bgit\s+push\b[^\r\n]*(?:\bmain\b|\bmaster\b|\bproduction\b|\bprod\b)/i.test(s))throw new Error('Yardmaster refuses a PowerShell command that pushes production/main.');
  if(/\bgit\s+(?:switch|checkout)\b[^\r\n]*(?:\bmain\b|\bmaster\b|\bproduction\b|\bprod\b)/i.test(s))throw new Error('Yardmaster refuses a PowerShell command that switches to production/main.');
}
export function buildPowerShellBootstrapScript({title,readyPath,transcriptPath,startupErrorPath,pidPath}){
  return [
    "$ErrorActionPreference='Continue'",
    `try{$Host.UI.RawUI.WindowTitle='${psLit(title)}'}catch{}`,
    `try{Set-Content -LiteralPath '${psLit(pidPath)}' -Value $PID -Force}catch{$_|Out-String|Set-Content -LiteralPath '${psLit(startupErrorPath)}' -Force;exit 13}`,
    `try{Set-Content -LiteralPath '${psLit(readyPath)}' -Value 'ready' -Force}catch{$_|Out-String|Set-Content -LiteralPath '${psLit(startupErrorPath)}' -Force;exit 13}`,
    `try{Start-Transcript -LiteralPath '${psLit(transcriptPath)}' -Force | Out-Null}catch{$_|Out-String|Set-Content -LiteralPath '${psLit(startupErrorPath)}' -Force}`
  ].join("\n");
}
export function buildPowerShellLauncherScript({bootstrapPath,launcherExitPath}){
  const b=String(bootstrapPath||'').replaceAll('"','');
  const e=String(launcherExitPath||'').replaceAll('"','');
  return [
    '@echo off',
    `start "" powershell.exe -NoLogo -NoProfile -NoExit -ExecutionPolicy Bypass -File "${b}"`,
    `> "${e}" echo %errorlevel%`,
    'exit /b 0'
  ].join('\r\n')+'\r\n';
}
export function buildPowerShellUiPasteScript({title,pid,uiStatePath}){
  const targetPid=Math.max(0,Math.trunc(Number(pid)||0));
  return [
    '$ErrorActionPreference="Stop"',
    '$ws=New-Object -ComObject WScript.Shell',
    "Add-Type -Namespace Yardmaster -Name NativeMethods -MemberDefinition '[System.Runtime.InteropServices.DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(System.IntPtr hWnd); [System.Runtime.InteropServices.DllImport(\"user32.dll\")] public static extern bool BringWindowToTop(System.IntPtr hWnd); [System.Runtime.InteropServices.DllImport(\"user32.dll\")] public static extern bool ShowWindowAsync(System.IntPtr hWnd, int nCmdShow); [System.Runtime.InteropServices.DllImport(\"user32.dll\")] public static extern System.IntPtr GetForegroundWindow();'",
    `$title='${psLit(title)}'`,
    `$pidToActivate=${targetPid}`,
    `$statePath='${psLit(uiStatePath)}'`,
    '$deadline=(Get-Date).AddSeconds(45)',
    '$activated=$false',
    '$activationMethod=""',
    '$targetHandle=[IntPtr]::Zero',
    'while((Get-Date)-lt $deadline){',
    '  $target=if($pidToActivate -gt 0){Get-Process -Id $pidToActivate -ErrorAction SilentlyContinue}else{$null}',
    '  if($target -and $target.MainWindowHandle -ne 0){$targetHandle=[IntPtr]$target.MainWindowHandle}',
    '  $owner=Get-Process -ErrorAction SilentlyContinue | Where-Object {$_.MainWindowTitle -and ($_.MainWindowTitle -eq $title -or $_.MainWindowTitle -like ("*"+$title+"*"))} | Select-Object -First 1',
    '  if($targetHandle -eq [IntPtr]::Zero -and $owner -and $owner.MainWindowHandle -ne 0){$targetHandle=[IntPtr]$owner.MainWindowHandle}',
    '  if($targetHandle -ne [IntPtr]::Zero){',
    '    [Yardmaster.NativeMethods]::ShowWindowAsync($targetHandle,9)|Out-Null',
    '    [Yardmaster.NativeMethods]::BringWindowToTop($targetHandle)|Out-Null',
    '    try{$ws.SendKeys("%")}catch{}',
    '    [Yardmaster.NativeMethods]::SetForegroundWindow($targetHandle)|Out-Null',
    '    Start-Sleep -Milliseconds 300',
    '    if([Yardmaster.NativeMethods]::GetForegroundWindow() -eq $targetHandle){$activated=$true;$activationMethod=if($owner -and $owner.Id -ne $pidToActivate){"native-window-owner"}else{"native-target-window"};break}',
    '  }',
    '  if($pidToActivate -gt 0 -and $ws.AppActivate([int]$pidToActivate)){$activated=$true;$activationMethod="appactivate-target-pid";break}',
    '  if($ws.AppActivate($title)){$activated=$true;$activationMethod="appactivate-title";break}',
    '  if($owner -and $ws.AppActivate([int]$owner.Id)){$activated=$true;$activationMethod="appactivate-window-owner";break}',
    '  Start-Sleep -Milliseconds 250',
    '}',
    'if(-not $activated){$titles=@(Get-Process -ErrorAction SilentlyContinue | Where-Object {$_.MainWindowTitle} | Select-Object -First 50 @{n="pid";e={$_.Id}},@{n="title";e={$_.MainWindowTitle}},@{n="hwnd";e={$_.MainWindowHandle}});@{stage="activate-timeout";pid=$pidToActivate;title=$title;targetHandle=[string]$targetHandle;foregroundHandle=[string][Yardmaster.NativeMethods]::GetForegroundWindow();visibleWindows=$titles;at=(Get-Date -Format o)}|ConvertTo-Json -Depth 5|Set-Content -LiteralPath $statePath;exit 12}',
    '@{stage="activated";method=$activationMethod;pid=$pidToActivate;title=$title;targetHandle=[string]$targetHandle;at=(Get-Date -Format o)}|ConvertTo-Json|Set-Content -LiteralPath $statePath',
    'Start-Sleep -Milliseconds 1500',
    "$ws.SendKeys('^v')",
    '@{stage="ctrl-v-sent";method=$activationMethod;at=(Get-Date -Format o)}|ConvertTo-Json|Set-Content -LiteralPath $statePath',
    'Start-Sleep -Milliseconds 600',
    "$ws.SendKeys('{ENTER}')",
    '@{stage="enter-sent";method=$activationMethod;at=(Get-Date -Format o)}|ConvertTo-Json|Set-Content -LiteralPath $statePath'
  ].join(';');
}
export async function runPowerShellClipboardCommand({dataDir,cwd,script,env=process.env,onOutput=()=>{},onEvent=()=>{},timeoutMs=30*60*1000}){
  if(process.platform!=='win32')throw new Error('PowerShell clipboard execution requires Windows.');
  const command=String(script||'').replace(/\r\n/g,'\n').trim();
  if(!command)throw new Error('PowerShell command block is empty.');
  if(command.length>30000)throw new Error('PowerShell command block is too large. Keep it under 30,000 characters.');
  if(command.includes('\0'))throw new Error('PowerShell command contains an invalid NUL character.');
  rejectUnsafeProductionCommand(command);
  const root=path.join(dataDir,'powershell-runs'),id=new Date().toISOString().replace(/[-:.]/g,'')+'-'+crypto.randomBytes(2).toString('hex'),dir=path.join(root,id);
  fs.mkdirSync(dir,{recursive:true});
  const commandPath=path.join(dir,'clipboard-command.ps1'),transcriptPath=path.join(dir,'powershell-transcript.txt'),readyPath=path.join(dir,'ready.txt'),donePath=path.join(dir,'done.json'),uiStatePath=path.join(dir,'ui-state.json'),bootstrapPath=path.join(dir,'powershell-bootstrap.ps1'),startupErrorPath=path.join(dir,'powershell-startup-error.txt'),pidPath=path.join(dir,'powershell-pid.txt'),launcherPath=path.join(dir,'powershell-launch.cmd'),launcherExitPath=path.join(dir,'powershell-launch-exit.txt');
  fs.writeFileSync(commandPath,command+'\n','utf8');
  const previous=clipboardText(),expectedCommandHash=crypto.createHash('sha256').update(command+'\n').digest('hex');
  const emit=(stage,detail={})=>{try{onEvent({at:new Date().toISOString(),stage,...detail})}catch{}};
  let lastStage='created',child=null,settled=false;
  const stage=(name,detail={})=>{lastStage=name;emit(name,detail)};
  const fail=(error)=>{
    error.powerShellDiagnostic={stage:lastStage,dir,id,commandPath,transcriptPath,readyPath,donePath,uiStatePath,bootstrapPath,startupErrorPath,pidPath,launcherPath,launcherExitPath};
    return error;
  };
  const wrapped=[
    command,
    '',
    '$__ym_success=$?',
    '$__ym_code=if($null -ne $LASTEXITCODE){[int]$LASTEXITCODE}elseif($__ym_success){0}else{1}',
    `@{code=$__ym_code;finishedAt=(Get-Date -Format o)} | ConvertTo-Json | Set-Content -LiteralPath '${psLit(donePath)}'`,
    'exit $__ym_code'
  ].join('\n');
  const pastePath=path.join(dir,'clipboard-paste.ps1');fs.writeFileSync(pastePath,wrapped+'\n','utf8');
  try{
    stage('clipboard-write-start',{commandLength:command.length,commandSha256:expectedCommandHash});
    const wrappedHash=crypto.createHash('sha256').update(wrapped+'\n').digest('hex');
    let actualHash='',clipboardAttempts=0;
    for(let attempt=1;attempt<=3;attempt++){
      clipboardAttempts=attempt;
      setClipboardFromFile(pastePath);
      const pasted=clipboardText();
      actualHash=crypto.createHash('sha256').update(String(pasted||'')).digest('hex');
      if(actualHash===wrappedHash)break;
      await new Promise(r=>setTimeout(r,100*attempt));
    }
    if(actualHash!==wrappedHash)throw new Error('Windows clipboard did not preserve the PowerShell command exactly after '+clipboardAttempts+' verified attempts.');
    stage('clipboard-verified',{wrappedSha256:wrappedHash,attempts:clipboardAttempts});
    if(process.env.YARDMASTER_TEST_POWERSHELL_PASTE_STUB==='1'){
      const direct=spawn('powershell.exe',['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',pastePath],{cwd:path.resolve(cwd),env,windowsHide:true,stdio:['ignore','pipe','pipe']});
      let stdout='',stderr='';direct.stdout.on('data',d=>stdout+=String(d));direct.stderr.on('data',d=>stderr+=String(d));
      const code=await new Promise((resolve,reject)=>{direct.on('error',reject);direct.on('close',resolve)});
      stage('stub-executed',{code:Number(code||0),simulatedCtrlV:true});restoreClipboard(previous,dir);return {code:Number(code||0),stdout,stderr,elapsedMs:0,commandSha256:expectedCommandHash,clipboardVerified:true,pastedWithCtrlV:true,testStub:true,simulatedCtrlV:true,diagnosticDir:dir}
    }
    const title='Yardmaster Paste '+id;
    fs.writeFileSync(bootstrapPath,buildPowerShellBootstrapScript({title,readyPath,transcriptPath,startupErrorPath,pidPath})+'\n','utf8');
    fs.writeFileSync(launcherPath,buildPowerShellLauncherScript({bootstrapPath,launcherExitPath}),'utf8');
    stage('powershell-launch',{title,bootstrapPath,launcherPath});
    child=spawn('cmd.exe',['/d','/s','/c',launcherPath],{cwd:path.resolve(cwd),env,windowsHide:true,stdio:'ignore'});
    const started=Date.now(),readyDeadline=Date.now()+30000;
    let targetPid=0;
    while(Date.now()<readyDeadline){
      if(fs.existsSync(pidPath)){
        try{targetPid=Number(fs.readFileSync(pidPath,'utf8').trim())||0}catch{}
      }
      if(targetPid>0&&fs.existsSync(readyPath))break;
      const launcherExit=(()=>{try{return Number(fs.readFileSync(launcherExitPath,'utf8').trim())}catch{return null}})();
      if(Number.isFinite(launcherExit)&&launcherExit!==0){
        let startup='';try{startup=fs.readFileSync(startupErrorPath,'utf8').trim()}catch{}
        throw new Error('PowerShell launcher failed before the paste window became ready (launcher exit '+launcherExit+').'+(startup?' Startup error: '+startup.slice(0,800):''));
      }
      await new Promise(r=>setTimeout(r,100))
    }
    if(!(targetPid>0&&fs.existsSync(readyPath))){
      let startup='';try{startup=fs.readFileSync(startupErrorPath,'utf8').trim()}catch{}
      const launcherExit=(()=>{try{return fs.readFileSync(launcherExitPath,'utf8').trim()}catch{return 'unknown'}})();
      throw new Error('PowerShell paste window did not become ready. Launcher exit: '+launcherExit+'.'+(startup?' Startup error: '+startup.slice(0,800):''));
    }
    stage('powershell-ready',{pid:targetPid});
    await new Promise(r=>setTimeout(r,900));
    const sendKeys=buildPowerShellUiPasteScript({title,pid:targetPid,uiStatePath});
    try{execFileSync('powershell.exe',['-NoProfile','-Sta','-Command',sendKeys],{windowsHide:true,stdio:'ignore'})}catch(error){
      const ui=readJson(uiStatePath,null);throw new Error('Could not activate/paste into the Yardmaster PowerShell window'+(ui?.stage?' (UI stage: '+ui.stage+')':'')+'.');
    }
    const ui=readJson(uiStatePath,null);stage('paste-dispatched',{uiStage:ui?.stage||'unknown'});
    return await new Promise((resolve,reject)=>{
      let poll=null,timer=null;
      const finish=(error,code)=>{
        if(settled)return;settled=true;if(poll)clearInterval(poll);if(timer)clearTimeout(timer);restoreClipboard(previous,dir);
        let transcript='';try{transcript=fs.readFileSync(transcriptPath,'utf8')}catch{}
        for(const line of transcript.split(/\r?\n/))if(line.trim())onOutput(line,'transcript');
        const result={code:Number(code??1),stdout:transcript,stderr:'',elapsedMs:Date.now()-started,commandSha256:expectedCommandHash,clipboardVerified:true,pastedWithCtrlV:true,diagnosticDir:dir,uiState:readJson(uiStatePath,null),powerShellPid:targetPid};
        if(error){reject(fail(error));return}
        stage('command-finished',{code:result.code});resolve(result);
      };
      poll=setInterval(()=>{
        const done=readJson(donePath,null);
        if(done&&Number.isFinite(Number(done.code))){try{if(pidAlive(targetPid))execFileSync('taskkill',['/PID',String(targetPid),'/T','/F'],{windowsHide:true,stdio:'ignore'})}catch{}finish(null,Number(done.code));return}
        if(targetPid>0&&!pidAlive(targetPid))finish(new Error('PowerShell paste window closed before the command completed.'));
      },200);
      timer=setTimeout(()=>{try{if(targetPid>0&&pidAlive(targetPid))execFileSync('taskkill',['/PID',String(targetPid),'/T','/F'],{windowsHide:true,stdio:'ignore'})}catch{}finish(new Error('PowerShell clipboard paste command timed out.'))},Math.max(1000,Number(timeoutMs)||30*60*1000));
    });
  }catch(error){
    restoreClipboard(previous,dir);
    let cleanupPid=0;try{cleanupPid=Number(fs.readFileSync(pidPath,'utf8').trim())||0}catch{}
    try{if(cleanupPid>0&&pidAlive(cleanupPid))execFileSync('taskkill',['/PID',String(cleanupPid),'/T','/F'],{windowsHide:true,stdio:'ignore'})}catch{}
    throw fail(error)
  }
}

function runRoot(repoPath){return path.join(path.resolve(repoPath),'test-results','86chaos-play-store-release-gate')}
function latestGateActivityAt(runDir,statePath){
  let latest=0;
  try{latest=Math.max(latest,fs.statSync(statePath).mtimeMs)}catch{}
  try{
    for(const name of fs.readdirSync(path.join(runDir,'runner-logs'))){
      const file=path.join(runDir,'runner-logs',name);
      try{const stat=fs.statSync(file);if(stat.isFile())latest=Math.max(latest,stat.mtimeMs)}catch{}
    }
  }catch{}
  return latest;
}
function releaseGateActivityFresh(runDir,statePath,{now=Date.now(),maxAgeMs=10*60*1000}={}){
  const at=latestGateActivityAt(runDir,statePath);return at>0&&now-at<=maxAgeMs;
}
export function discoverAdoptableReleaseGate(repoPath){
  const root=runRoot(repoPath),lockPath=path.join(root,'.current-run.lock'),lastPath=path.join(root,'.last-run.json');
  const lock=readJson(lockPath,null),last=readJson(lastPath,null),candidate=lock||last;
  if(!candidate?.runDir||!candidate?.runId)return null;
  const runDir=path.resolve(candidate.runDir);if(!inside(runDir,root))throw new Error('Release-gate run directory is outside the expected results root.');
  const statePath=path.join(runDir,'runner-state.json'),runnerState=readJson(statePath,{});
  const pid=Number(lock?.pid||0),alive=pid?pidAlive(pid):false,activityAt=latestGateActivityAt(runDir,statePath),activityFresh=releaseGateActivityFresh(runDir,statePath);
  const running=String(runnerState.status||'').toLowerCase()==='running';
  const active=running&&(alive||activityFresh);
  return {root,lockPath,lastPath,runId:String(candidate.runId),mode:String(last?.mode||runnerState.mode||'full'),runDir,statePath,pid,alive,activityAt,activityFresh,active,runnerState};
}
function progressOf(state={}){
  const phases=['created','environment-preflight','dependency-install','dependency-preflight','source-inventory','server-identity-preflight','test-account-provision','role-preflight','java-prerequisite','local-release-readiness','mobile-layout-smoke','playwright','qa-cleanup','report-collection'];
  if(['passed','failed','blocked'].includes(String(state.status||'').toLowerCase()))return 100;
  const i=Math.max(0,phases.indexOf(String(state.currentPhase||'created')));return Math.max(1,Math.min(99,Math.round((i+1)/phases.length*100)));
}
function logs(runDir){
  try{return fs.readdirSync(path.join(runDir,'runner-logs')).filter(n=>/\.log$/i.test(n)).map(n=>path.join(runDir,'runner-logs',n)).filter(p=>fs.statSync(p).isFile()).sort()}catch{return []}
}
export function adoptRunningReleaseGate({repoPath,onLine=()=>{},onState=()=>{},onFinish=()=>{},pollMs=750}){
  const info=discoverAdoptableReleaseGate(repoPath);
  if(!info?.active)throw new Error('No active manually started Play Store release gate was found.');
  let stopped=false,timer=null,last='',offsets=new Map(),inactiveSince=0;
  const emit=()=>{
    for(const file of logs(info.runDir)){
      const size=fs.statSync(file).size,offset=Math.min(offsets.get(file)||0,size);if(size<=offset)continue;
      const fd=fs.openSync(file,'r'),buf=Buffer.alloc(size-offset);fs.readSync(fd,buf,0,buf.length,offset);fs.closeSync(fd);offsets.set(file,size);
      for(const line of buf.toString('utf8').split(/\r?\n/))if(line.trim())onLine(line);
    }
  };
  const tick=()=>{
    if(stopped)return;emit();const s=readJson(info.statePath,{});
    const snap={source:'adopted-manual',runId:info.runId,mode:info.mode,pid:info.pid,currentPhase:s.currentPhase||'unknown',status:s.status||'running',progress:progressOf(s),playwrightStarted:!!s.playwrightStarted,playwrightCompleted:!!s.playwrightCompleted,lastCompletedStep:s.lastCompletedStep||'',blockingReason:s.blockingReason||'',finalExitCode:s.finalExitCode};
    const key=JSON.stringify(snap);if(key!==last){last=key;onState(snap)}
    const terminal=['passed','failed','blocked'].includes(String(s.status||'').toLowerCase())||(s.finalExitCode!==null&&s.finalExitCode!==undefined&&s.finalExitCode!=='');
    const alive=info.pid?pidAlive(info.pid):false,activityFresh=releaseGateActivityFresh(info.runDir,info.statePath);
    const active=alive||activityFresh;
    const terminalReady=terminal&&(!info.pid||!alive);
    if(terminalReady||(!active&&String(s.status||'')!=='running')){
      stopped=true;clearInterval(timer);emit();const code=Number.isFinite(Number(s.finalExitCode))?Number(s.finalExitCode):(String(s.status).toLowerCase()==='passed'?0:1);onFinish(code,{...snap,finalExitCode:code});return
    }
    if(!active&&String(s.status||'')==='running'){
      if(!inactiveSince)inactiveSince=Date.now();
      if(Date.now()-inactiveSince>15000){stopped=true;clearInterval(timer);onFinish(1,{...snap,status:'failed',finalExitCode:1,blockingReason:'Adopted release-gate process stopped and its runner logs are no longer updating.'});return}
    }else inactiveSince=0
  };
  timer=setInterval(tick,Math.max(250,Number(pollMs)||750));tick();
  return {info,stop({terminate=false}={}){stopped=true;clearInterval(timer);if(terminate&&info.pid&&pidAlive(info.pid)){try{execFileSync('taskkill',['/PID',String(info.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'})}catch{}}}};
}
