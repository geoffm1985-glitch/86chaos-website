param(
  [string]$AppRoot=(Join-Path $env:LOCALAPPDATA 'Yardmaster\app'),
  [int]$Port=8787
)
$ErrorActionPreference='Stop'
$Root=Join-Path $env:LOCALAPPDATA 'Yardmaster'
$Lock=Join-Path $Root 'supervisor.json'
$StopMarker=Join-Path $Root 'supervisor-stop.json'
$UpdateMarker=Join-Path $Root 'update-resume.json'
$Request=Join-Path $Root 'self-heal-request.json'
$RollbackRoot=Join-Path $Root 'rollback\app'
$RollbackMeta=Join-Path $Root 'rollback\rollback.json'
$FailedUpdate=Join-Path $Root 'self-heal\failed-update.json'
$SafeMode=Join-Path $Root 'safe-mode.json'
$DesktopHealth=Join-Path $Root 'self-heal\desktop-health.json'
$LastWindowSnapshot=Join-Path $Root 'self-heal\last-window.png'
$SupervisorStartedMs=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$LogDir=Join-Path $Root 'self-heal\supervisor'
$DiagDir=Join-Path $Root 'self-heal\diagnostics'
New-Item -ItemType Directory -Force -Path $LogDir,$DiagDir|Out-Null
$Log=Join-Path $LogDir 'supervisor.log'

function Write-YmLog([string]$Message){
  $line=('['+(Get-Date).ToString('o')+'] '+$Message)
  Add-Content -LiteralPath $Log -Value $line -Encoding UTF8
}
function Process-Alive([int]$Id){
  if($Id -le 0){return $false}
  return $null -ne (Get-Process -Id $Id -ErrorAction SilentlyContinue)
}
try{
  if(Test-Path $Lock){
    $existing=Get-Content $Lock -Raw|ConvertFrom-Json
    if($existing.pid -and (Process-Alive ([int]$existing.pid))){exit 0}
  }
}catch{}
@{pid=$PID;startedAt=(Get-Date).ToString('o');appRoot=$AppRoot}|ConvertTo-Json|Set-Content $Lock -Encoding UTF8
function Is-PlannedStop {
  try{
    if(Test-Path $UpdateMarker){
      $u=Get-Content $UpdateMarker -Raw|ConvertFrom-Json
      if($u.requestedAt -and [double]$u.requestedAt -ge [double]$SupervisorStartedMs){return $true}
    }
  }catch{}
  try{
    if(Test-Path $StopMarker){
      $m=Get-Content $StopMarker -Raw|ConvertFrom-Json
      if([double]$m.until -gt [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()){return $true}
    }
  }catch{}
  return $false
}
function Status-Healthy {
  try{
    $s=Invoke-RestMethod ("http://127.0.0.1:"+$Port+"/api/status") -TimeoutSec 3
    if($s.online -ne $true){return $false}
    if(Test-Path $DesktopHealth){
      $age=((Get-Date).ToUniversalTime()-(Get-Item $DesktopHealth).LastWriteTimeUtc).TotalSeconds
      if($age -gt 90){Write-YmLog ('Desktop heartbeat is stale by '+[math]::Round($age)+' seconds.');return $false}
      try{
        $desktop=Get-Content $DesktopHealth -Raw|ConvertFrom-Json
        if($desktop.state -eq 'fault'){Write-YmLog ('Desktop fault marker detected: '+[string]$desktop.detail);return $false}
      }catch{}
    }
    return $true
  }catch{return $false}
}
function Capture-Diagnostic([string]$Reason,[int]$ElectronPid){
  $stamp=(Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
  $work=Join-Path $DiagDir ('work-'+$stamp+'-'+[guid]::NewGuid().ToString('N').Substring(0,6))
  New-Item -ItemType Directory -Force -Path $work|Out-Null
  try{
    if(Test-Path $LastWindowSnapshot){Copy-Item -LiteralPath $LastWindowSnapshot -Destination (Join-Path $work 'yardmaster-window.png') -Force}
    else{Set-Content (Join-Path $work 'screenshot-error.txt') 'No recent Yardmaster window snapshot is available.'}
    if(Test-Path $DesktopHealth){Copy-Item -LiteralPath $DesktopHealth -Destination (Join-Path $work 'desktop-health.json') -Force}
  }catch{Set-Content (Join-Path $work 'screenshot-error.txt') $_.Exception.Message}
  $state=$null;$config=$null;$version='unknown'
  try{$state=Get-Content (Join-Path $Root 'state.json') -Raw|ConvertFrom-Json}catch{}
  try{$config=Get-Content (Join-Path $Root 'config.json') -Raw|ConvertFrom-Json}catch{}
  try{$version=(Get-Content (Join-Path $AppRoot 'package.json') -Raw|ConvertFrom-Json).version}catch{}
  $checkpoint=@{
    schema=1;createdAt=(Get-Date).ToString('o');version=$version;
    config=$config;workflow=$state.workflow;run=$state.run;deployment=$state.deployment;chatgpt=$state.chatgpt
  }
  $resumeKind='none'
  if($state.workflow.state -in @('chatgpt','handoff-error','waiting-login','failed-manual')){$resumeKind='resume-handoff'}
  elseif($state.run.state -eq 'running' -or $state.workflow.state -eq 'testing'){$resumeKind='resume-test'}
  elseif($state.deployment.state -eq 'Waiting'){$resumeKind='watch-deployment'}
  elseif($state.workflow.state -eq 'waiting-approval'){$resumeKind='restore-only'}
  $checkpoint.resume=@{kind=$resumeKind;testType=$config.testType;closedLoop=[bool]$state.workflow.closedLoop;expectedCommit=$state.deployment.expectedCommit}
  @{schema=1;reason=$Reason;capturedAt=(Get-Date).ToString('o');version=$version;electronPid=$ElectronPid;checkpoint=$checkpoint}|ConvertTo-Json -Depth 20|Set-Content (Join-Path $work 'SELF_HEAL_DIAGNOSTIC.json') -Encoding UTF8
  if(Test-Path $Log){Copy-Item $Log (Join-Path $work 'supervisor.log') -Force}
  if(Test-Path (Join-Path $Root 'state.json')){Copy-Item (Join-Path $Root 'state.json') (Join-Path $work 'state.json') -Force}
  if(Test-Path (Join-Path $Root 'config.json')){Copy-Item (Join-Path $Root 'config.json') (Join-Path $work 'config.json') -Force}
  try{Get-CimInstance Win32_Process|Where-Object{$_.Name -in @('electron.exe','node.exe','msedge.exe','powershell.exe')}|Select-Object Name,ProcessId,ParentProcessId,ExecutablePath|ConvertTo-Json -Depth 4|Set-Content (Join-Path $work 'processes.json') -Encoding UTF8}catch{}
  $zip=Join-Path $DiagDir ('Yardmaster-Self-Heal-Diagnostic-'+$stamp+'.zip')
  Compress-Archive -Path (Join-Path $work '*') -DestinationPath $zip -Force
  $requestBody=$null
  try{if(Test-Path $Request){$requestBody=Get-Content $Request -Raw|ConvertFrom-Json}}catch{}
  if($requestBody){
    $requestBody.reason=$Reason
    $requestBody.diagnosticPath=$zip
    $requestBody|Add-Member -NotePropertyName latestDiagnosticPath -NotePropertyValue $zip -Force
    $requestBody|Add-Member -NotePropertyName latestDiagnosticAt -NotePropertyValue ((Get-Date).ToString('o')) -Force
    if(-not $requestBody.checkpoint){$requestBody|Add-Member -NotePropertyName checkpoint -NotePropertyValue $checkpoint -Force}
    $requestBody|ConvertTo-Json -Depth 20|Set-Content $Request -Encoding UTF8
  }else{
    @{schema=1;reason=$Reason;diagnosticPath=$zip;checkpoint=$checkpoint;createdAt=(Get-Date).ToString('o');attempt=0}|ConvertTo-Json -Depth 20|Set-Content $Request -Encoding UTF8
  }
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
  Write-YmLog ('Captured self-heal diagnostic: '+$zip)
  return $zip
}
function Restore-YardmasterRollback {
  if(-not(Test-Path (Join-Path $RollbackRoot 'package.json'))){return $false}
  try{
    $failedVersion='unknown';$rollbackVersion='unknown'
    try{$failedVersion=[string](Get-Content (Join-Path $AppRoot 'package.json') -Raw|ConvertFrom-Json).version}catch{}
    try{$rollbackVersion=[string](Get-Content (Join-Path $RollbackRoot 'package.json') -Raw|ConvertFrom-Json).version}catch{}
    $update=$null;try{if(Test-Path $UpdateMarker){$update=Get-Content $UpdateMarker -Raw|ConvertFrom-Json}}catch{}
    @{failedVersion=$failedVersion;rollbackVersion=$rollbackVersion;at=(Get-Date).ToString('o');update=$update}|ConvertTo-Json -Depth 20|Set-Content $FailedUpdate -Encoding UTF8
    Remove-Item $UpdateMarker -Force -ErrorAction SilentlyContinue
    robocopy $RollbackRoot $AppRoot /MIR /XF *.log | Out-Null
    if($LASTEXITCODE -ge 8){throw "rollback copy failed with code $LASTEXITCODE"}
    $supervisorSource=Join-Path $AppRoot 'scripts\Yardmaster-Supervisor.ps1'
    if(Test-Path $supervisorSource){Copy-Item -LiteralPath $supervisorSource -Destination (Join-Path $Root 'Yardmaster-Supervisor.ps1') -Force}
    Write-YmLog ('Rolled Yardmaster back from '+$failedVersion+' to '+$rollbackVersion+' after repeated post-update failures. The saved self-heal request remains queued.')
    return $true
  }catch{
    Write-YmLog ('Rollback failed: '+$_.Exception.Message)
    return $false
  }
}
function Start-YardmasterElectron {
  $electron=Join-Path $AppRoot 'node_modules\electron\dist\electron.exe'
  $entry=Join-Path $AppRoot 'desktop.cjs'
  if(-not(Test-Path $electron)){throw 'Electron runtime is missing.'}
  if(-not(Test-Path $entry)){throw 'Yardmaster desktop entry is missing.'}
  $env:YARDMASTER_SUPERVISED='1'
  return Start-Process -FilePath $electron -ArgumentList ('"'+$entry+'"') -WorkingDirectory $AppRoot -PassThru
}
Write-YmLog ('Supervisor started for '+$AppRoot)
$crashes=@()
try{
  while($true){
    Remove-Item $StopMarker -Force -ErrorAction SilentlyContinue
    $child=Start-YardmasterElectron
    Write-YmLog ('Started Yardmaster Electron PID '+$child.Id)
    $unhealthySince=$null
    while(Process-Alive $child.Id){
      if(Is-PlannedStop){Write-YmLog 'Planned stop/update detected; supervisor exiting.';exit 0}
      if(Status-Healthy){$unhealthySince=$null}
      elseif($null -eq $unhealthySince){$unhealthySince=Get-Date}
      elseif(((Get-Date)-$unhealthySince).TotalMinutes -ge 3){
        Write-YmLog 'Operator remained unhealthy for three minutes; capturing diagnostic and restarting.'
        Capture-Diagnostic 'operator-unhealthy-timeout' $child.Id|Out-Null
        try{& taskkill.exe /PID $child.Id /T /F|Out-Null}catch{}
        break
      }
      Start-Sleep -Seconds 5
    }
    if(Is-PlannedStop){Write-YmLog 'Planned stop/update detected after process exit; supervisor exiting.';exit 0}
    $crashes=@($crashes|Where-Object{((Get-Date)-$_).TotalMinutes -lt 10})+@(Get-Date)
    Capture-Diagnostic 'unexpected-yardmaster-exit' $child.Id|Out-Null
    if($crashes.Count -ge 3 -and (Test-Path $UpdateMarker) -and (Restore-YardmasterRollback)){
      $crashes=@()
      Write-YmLog 'Post-update crash loop recovered by rollback. Restarting the known-good Yardmaster so it can continue the saved self-heal request.'
      Start-Sleep -Seconds 5
      continue
    }
    if($crashes.Count -ge 3){
      @{enabled=$true;reason='automatic startup crash-loop recovery';updatedAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()}|ConvertTo-Json|Set-Content $SafeMode -Encoding UTF8
      Write-YmLog 'Three rapid Yardmaster startup crashes detected. Safe Mode is enabled for the next restart; automatic handoff, self-heal, update, push, and deployment watching will start disabled.'
    }
    $delay=if($crashes.Count -ge 3){15}else{8}
    Write-YmLog ('Unexpected exit detected; restart in '+$delay+' seconds.')
    Start-Sleep -Seconds $delay
  }
}finally{
  try{if((Get-Content $Lock -Raw|ConvertFrom-Json).pid -eq $PID){Remove-Item $Lock -Force}}catch{}
}
