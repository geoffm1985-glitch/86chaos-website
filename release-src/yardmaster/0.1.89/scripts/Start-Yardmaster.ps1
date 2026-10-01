$ErrorActionPreference='Stop'
$AppRoot=Split-Path -Parent $PSScriptRoot
$Root=Split-Path -Parent $AppRoot
$Supervisor=Join-Path $Root 'Yardmaster-Supervisor.ps1'
$electron=Join-Path $AppRoot 'node_modules\electron\dist\electron.exe'
$desktopEntry=Join-Path $AppRoot 'desktop.cjs'
if(-not(Test-Path $electron)){ throw 'Yardmaster Electron runtime is missing. Run the Yardmaster installer again.' }
if(-not(Test-Path $desktopEntry)){ throw 'Yardmaster desktop shell is missing. Run the Yardmaster installer again.' }
if(Test-Path $Supervisor){
  Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-File',('"'+$Supervisor+'"'),'-AppRoot',('"'+$AppRoot+'"')) -WindowStyle Hidden | Out-Null
  exit 0
}
Start-Process -FilePath $electron -ArgumentList ('"' + $desktopEntry + '"') -WorkingDirectory $AppRoot
