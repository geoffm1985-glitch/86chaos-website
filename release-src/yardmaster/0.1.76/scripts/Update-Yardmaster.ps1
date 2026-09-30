param(
  [string]$ManifestUrl='https://www.86chaos.com/yardmaster/release.json',
  [string]$PackagePath='',
  [string]$ExpectedSha256='',
  [switch]$NoLaunch
)
$ErrorActionPreference='Stop'
$Root=Join-Path $env:LOCALAPPDATA 'Yardmaster'
$AppRoot=Join-Path $Root 'app'
$RollbackRoot=Join-Path $Root 'rollback\app'
$RollbackMeta=Join-Path $Root 'rollback\rollback.json'
$TempRoot=Join-Path $env:TEMP ('Yardmaster-Update-'+[guid]::NewGuid().ToString('N'))
$Archive=if($PackagePath){$PackagePath}else{Join-Path $TempRoot 'Yardmaster-Windows.zip'}

function Stop-YardmasterAppProcesses {
  # Do not use /T here. A suspended 86 Chaos release-gate PowerShell process may be an intentional descendant that must survive a Yardmaster update.
  Get-Process -Name electron -ErrorAction SilentlyContinue | Where-Object {
    try { [string]$_.Path -like "$AppRoot*" } catch { $false }
  } | ForEach-Object { try { & taskkill.exe /PID $_.Id /F | Out-Null } catch {} }
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $cmd=[string]$_.CommandLine
    $exe=[string]$_.ExecutablePath
    (($_.Name -eq 'node.exe') -and $cmd -like "*$AppRoot*" -and $cmd -like '*server.mjs*') -or
    (($_.Name -eq 'electron.exe') -and ($cmd -like "*$AppRoot*" -or $exe -like "$AppRoot*")) -or
    (($_.Name -eq 'msedge.exe') -and $cmd -like '*Yardmaster\edge-profile*')
  } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }
}

function Set-YardmasterRegistration {
  param([string]$Version)
  $electron=Join-Path $AppRoot 'node_modules\electron\dist\electron.exe'
  $desktopEntry=Join-Path $AppRoot 'desktop.cjs'
  $icon=Join-Path $AppRoot 'public\yardmaster-icon.ico'
  $uninstallScript=Join-Path $AppRoot 'scripts\Uninstall-Yardmaster.ps1'
  $uninstallKey='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Yardmaster'
  $uninstallCommand='powershell.exe -NoProfile -ExecutionPolicy Bypass -File "'+$uninstallScript+'"'
  New-Item -Path $uninstallKey -Force | Out-Null
  foreach($item in @{
    DisplayName='Yardmaster';DisplayVersion=$Version;Publisher='Chilton App Works LLC';InstallLocation=$AppRoot;
    DisplayIcon=$icon;UninstallString=$uninstallCommand;QuietUninstallString=($uninstallCommand+' -Quiet')
  }.GetEnumerator()){New-ItemProperty -Path $uninstallKey -Name $item.Key -Value ([string]$item.Value) -PropertyType String -Force | Out-Null}
  New-ItemProperty -Path $uninstallKey -Name NoModify -Value 1 -PropertyType DWord -Force | Out-Null
  New-ItemProperty -Path $uninstallKey -Name NoRepair -Value 1 -PropertyType DWord -Force | Out-Null
  $desktop=[Environment]::GetFolderPath('Desktop')
  $startMenu=Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
  $shell=New-Object -ComObject WScript.Shell
  foreach($dest in @((Join-Path $desktop 'Yardmaster.lnk'),(Join-Path $startMenu 'Yardmaster.lnk'))){
    $sc=$shell.CreateShortcut($dest);$sc.TargetPath=$electron;$sc.Arguments='"'+$desktopEntry+'"';$sc.WorkingDirectory=$AppRoot;$sc.IconLocation=$icon+',0';$sc.Save()
  }
}

New-Item -ItemType Directory -Force -Path $TempRoot | Out-Null
try {
  $manifest=$null
  if(-not $PackagePath){
    $manifest=Invoke-RestMethod -Uri $ManifestUrl -Method Get -TimeoutSec 30
    if($manifest.verified -ne $true -or -not $manifest.version -or -not $manifest.downloadUrl -or -not $manifest.sha256){throw 'Yardmaster release manifest is incomplete or not verified.'}
    $downloadUri=[Uri]::new([Uri]$ManifestUrl,[string]$manifest.downloadUrl).AbsoluteUri
    Invoke-WebRequest -Uri $downloadUri -OutFile $Archive -UseBasicParsing -TimeoutSec 120
    $actual=(Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if($actual -ne ([string]$manifest.sha256).ToLowerInvariant()){throw 'Yardmaster update checksum verification failed. No files were changed.'}
  }
  if(-not(Test-Path -LiteralPath $Archive)){throw 'Yardmaster update package was not found.'}
  if($PackagePath -and $ExpectedSha256){
    $actualPackageHash=(Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if($actualPackageHash -ne ([string]$ExpectedSha256).ToLowerInvariant()){throw 'Yardmaster self-heal package checksum changed after certification. No files were changed.'}
  }
  $Extracted=Join-Path $TempRoot 'package';New-Item -ItemType Directory -Force -Path $Extracted | Out-Null
  Expand-Archive -LiteralPath $Archive -DestinationPath $Extracted -Force
  $pkgFile=Get-ChildItem -LiteralPath $Extracted -Recurse -File -Filter package.json | Where-Object { Test-Path (Join-Path $_.Directory.FullName 'scripts\Install-Yardmaster.ps1') } | Select-Object -First 1
  if(-not $pkgFile){throw 'The verified Yardmaster package is incomplete.'}
  $source=$pkgFile.Directory.FullName
  $incoming=Get-Content (Join-Path $source 'package.json') -Raw | ConvertFrom-Json
  if($manifest -and [string]$incoming.version -ne [string]$manifest.version){throw 'The package version does not match the verified release manifest.'}

  # Normal website updates get a disposable canary launch before the working installation is stopped.
  # Self-heal PackagePath updates already passed the stricter Node-side canary/certification flow.
  if(-not $PackagePath){
    Push-Location $source
    try{
      npm install --omit=dev --no-audit --no-fund
      if($LASTEXITCODE -ne 0){throw 'Yardmaster canary dependency install failed. The current installation was not changed.'}
    }finally{Pop-Location}
    $canaryData=Join-Path $TempRoot 'canary-data'
    $canaryRepo=Join-Path $TempRoot 'canary-repo'
    New-Item -ItemType Directory -Force -Path $canaryData,$canaryRepo|Out-Null
    Set-Content -LiteralPath (Join-Path $canaryRepo 'package.json') -Value '{"name":"yardmaster-canary-fixture"}' -Encoding UTF8
    & git -C $canaryRepo init -b testing | Out-Null
    if($LASTEXITCODE -ne 0){throw 'Could not create the isolated canary repository. The current installation was not changed.'}
    $canaryPort=Get-Random -Minimum 43000 -Maximum 52000
    $canaryLauncher=Join-Path $TempRoot 'Run-Yardmaster-Canary.ps1'
    @'
param([string]$Source,[string]$Data,[string]$Repo,[int]$Port)
$env:YARDMASTER_DATA_DIR=$Data
$env:YARDMASTER_REPOSITORY_PATH=$Repo
$env:YARDMASTER_PORT=[string]$Port
$env:YARDMASTER_DISABLE_UPDATE_CHECKS='1'
$env:YARDMASTER_TEST_QUEUE_ONLY='1'
$env:YARDMASTER_TEST_SELF_HEAL_QUEUE_ONLY='1'
Set-Location $Source
& node 'server.mjs'
'@ | Set-Content -LiteralPath $canaryLauncher -Encoding UTF8
    $canary=Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$canaryLauncher+'"'),'-Source',('"'+$source+'"'),'-Data',('"'+$canaryData+'"'),'-Repo',('"'+$canaryRepo+'"'),'-Port',$canaryPort) -WindowStyle Hidden -PassThru
    $healthy=$false
    try{
      $deadline=(Get-Date).AddSeconds(25)
      while((Get-Date) -lt $deadline){
        if($canary.HasExited){break}
        try{
          $status=Invoke-RestMethod -Uri ('http://127.0.0.1:'+$canaryPort+'/api/status') -TimeoutSec 2
          if($status.online -eq $true -and [string]$status.version -eq [string]$incoming.version){$healthy=$true;break}
        }catch{}
        Start-Sleep -Milliseconds 400
      }
    }finally{
      try{& taskkill.exe /PID $canary.Id /T /F|Out-Null}catch{}
    }
    if(-not $healthy){throw 'Yardmaster candidate failed its isolated canary launch. The current installation was not changed.'}
  }

  Stop-YardmasterAppProcesses
  Start-Sleep -Milliseconds 800
  if(Test-Path (Join-Path $AppRoot 'package.json')){
    $oldVersion='unknown'
    try{$oldVersion=[string](Get-Content (Join-Path $AppRoot 'package.json') -Raw|ConvertFrom-Json).version}catch{}
    Remove-Item -LiteralPath (Split-Path -Parent $RollbackRoot) -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $RollbackRoot | Out-Null
    robocopy $AppRoot $RollbackRoot /MIR /XF *.log | Out-Null
    if($LASTEXITCODE -ge 8){throw "Yardmaster rollback snapshot failed with code $LASTEXITCODE"}
    @{version=$oldVersion;createdAt=(Get-Date).ToString('o');incomingVersion=[string]$incoming.version}|ConvertTo-Json|Set-Content $RollbackMeta -Encoding UTF8
  }
  New-Item -ItemType Directory -Force -Path $AppRoot | Out-Null
  robocopy $source $AppRoot /MIR /XD .git node_modules bin /XF *.log | Out-Null
  if($LASTEXITCODE -ge 8){throw "Yardmaster update copy failed with code $LASTEXITCODE"}
  Push-Location $AppRoot
  try {
    npm install --omit=dev --no-audit --no-fund
    if($LASTEXITCODE -ne 0){throw 'Yardmaster dependency update failed.'}
  } finally { Pop-Location }
  $electron=Join-Path $AppRoot 'node_modules\electron\dist\electron.exe'
  if(-not(Test-Path $electron)){throw 'Electron runtime is missing after the update.'}
  Set-YardmasterRegistration -Version ([string]$incoming.version)
  $supervisorSource=Join-Path $AppRoot 'scripts\Yardmaster-Supervisor.ps1'
  if(Test-Path $supervisorSource){Copy-Item -LiteralPath $supervisorSource -Destination (Join-Path $Root 'Yardmaster-Supervisor.ps1') -Force}
  if(-not $NoLaunch){& (Join-Path $AppRoot 'scripts\Start-Yardmaster.ps1')}
} finally {
  Remove-Item -LiteralPath $TempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
