param([switch]$SkipCloudflare,[switch]$NoLaunch)
$ErrorActionPreference='Stop'

$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$principal=New-Object Security.Principal.WindowsPrincipal($identity)
if(-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){
  $args=@('-NoProfile','-ExecutionPolicy','Bypass','-File',('"' + $PSCommandPath + '"'))
  if($SkipCloudflare){$args += '-SkipCloudflare'}
  if($NoLaunch){$args += '-NoLaunch'}
  try{
    $p=Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $args -PassThru -Wait
    exit $p.ExitCode
  }catch{
    throw 'Administrator permission was declined or the elevated installer could not start.'
  }
}
$Source=Split-Path -Parent $PSScriptRoot
$InstallRoot=Join-Path $env:LOCALAPPDATA 'Yardmaster\app'

function Invoke-YardmasterProcess {
  param(
    [Parameter(Mandatory=$true)][string]$FilePath,
    [string[]]$ArgumentList=@(),
    [int]$TimeoutSeconds=180,
    [string]$Description='process'
  )
  $process=Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -NoNewWindow -PassThru
  if(-not $process.WaitForExit($TimeoutSeconds*1000)){
    try { & taskkill.exe /PID $process.Id /T /F | Out-Null } catch {}
    throw "$Description timed out after $TimeoutSeconds seconds."
  }
  if($process.ExitCode -ne 0){throw "$Description failed with exit code $($process.ExitCode)."}
}
Write-Host 'Installing Yardmaster...' -ForegroundColor Cyan
$node=(Get-Command node.exe -ErrorAction SilentlyContinue)
if(-not $node){throw 'Node.js 22 or newer is required.'}
$major=[int]((& node -p "process.versions.node.split('.')[0]").Trim())
if($major -lt 22){throw "Node $(& node -v) is too old. Node 22+ is required."}
New-Item -ItemType Directory -Force -Path $InstallRoot|Out-Null
Write-Host 'Stopping running Yardmaster operator...' -ForegroundColor Cyan
Get-Process -Name electron -ErrorAction SilentlyContinue | Where-Object {
  try { [string]$_.Path -like "$InstallRoot*" } catch { $false }
} | ForEach-Object { try { & taskkill.exe /PID $_.Id /T /F | Out-Null } catch {} }
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  $cmd=[string]$_.CommandLine
  $exe=[string]$_.ExecutablePath
  (($_.Name -eq 'node.exe') -and $cmd -like "*$InstallRoot*" -and $cmd -like '*server.mjs*') -or
  (($_.Name -eq 'electron.exe') -and ($cmd -like "*$InstallRoot*" -or $exe -like "$InstallRoot*")) -or
  (($_.Name -eq 'msedge.exe') -and $cmd -like '*Yardmaster\edge-profile*')
} | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {} }
Start-Sleep -Milliseconds 500
robocopy $Source $InstallRoot /MIR /XD .git node_modules bin /XF *.log|Out-Null
if($LASTEXITCODE -ge 8){throw "Copy failed with robocopy exit code $LASTEXITCODE"}
$electron=Join-Path $InstallRoot 'node_modules\electron\dist\electron.exe'
$electronInstallJs=Join-Path $InstallRoot 'node_modules\electron\install.js'
$npm=(Get-Command npm.cmd -ErrorAction SilentlyContinue)
if(-not $npm){throw 'npm.cmd was not found even though Node.js is installed.'}
Write-Host 'Installing Yardmaster runtime...' -ForegroundColor Cyan
Push-Location $InstallRoot
try {
  Invoke-YardmasterProcess -FilePath $npm.Source -ArgumentList @('install','--omit=dev','--no-audit','--no-fund') -TimeoutSeconds 300 -Description 'Yardmaster npm runtime install'
  Write-Host 'Checking Electron desktop runtime...' -ForegroundColor Cyan
  if(-not(Test-Path $electron)){
    if(-not(Test-Path $electronInstallJs)){throw 'Electron package is present without its install.js repair helper.'}
    Write-Host 'Repairing Electron desktop runtime...' -ForegroundColor Cyan
    $nodeExe=(Get-Command node.exe -ErrorAction Stop).Source
    Invoke-YardmasterProcess -FilePath $nodeExe -ArgumentList @(('"'+$electronInstallJs+'"')) -TimeoutSeconds 300 -Description 'Electron runtime repair'
  }
} finally {
  Pop-Location
}
if(-not(Test-Path $electron)){throw 'Electron runtime download did not complete.'}
Write-Host 'Yardmaster runtime ready.' -ForegroundColor Green
$bin=Join-Path $InstallRoot 'bin';New-Item -ItemType Directory -Force -Path $bin|Out-Null
if(-not $SkipCloudflare){
  Write-Host 'Checking remote access runtime...' -ForegroundColor Cyan
  $cf=Join-Path $bin 'cloudflared.exe'
  $healthy=$false
  if(Test-Path $cf){try{Invoke-YardmasterProcess -FilePath $cf -ArgumentList @('--version') -TimeoutSeconds 15 -Description 'Cloudflare Tunnel health check';$healthy=$true}catch{$healthy=$false}}
  if(-not $healthy){
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq 'cloudflared.exe' -and [string]$_.ExecutablePath -eq $cf } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force } catch {} }
    Remove-Item -LiteralPath $cf -Force -ErrorAction SilentlyContinue
    $download=$cf+'.download'
    Write-Host 'Downloading Cloudflare Tunnel client...' -ForegroundColor Cyan
    Invoke-WebRequest 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $download -UseBasicParsing -TimeoutSec 120
    Move-Item -LiteralPath $download -Destination $cf -Force
    Invoke-YardmasterProcess -FilePath $cf -ArgumentList @('--version') -TimeoutSeconds 15 -Description 'Cloudflare Tunnel validation'
  }
  Write-Host 'Remote access runtime ready.' -ForegroundColor Green
}
$desktopEntry=Join-Path $InstallRoot 'desktop.cjs'
$icon=Join-Path $InstallRoot 'public\yardmaster-icon.ico'
$desktop=[Environment]::GetFolderPath('Desktop')
$startMenu=Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$shell=New-Object -ComObject WScript.Shell
foreach($dest in @((Join-Path $desktop 'Yardmaster.lnk'),(Join-Path $startMenu 'Yardmaster.lnk'))){
  $sc=$shell.CreateShortcut($dest)
  $sc.TargetPath=$electron
  $sc.Arguments='"'+$desktopEntry+'"'
  $sc.WorkingDirectory=$InstallRoot
  $sc.IconLocation=$icon+',0'
  $sc.Save()
}

# Register Yardmaster with Windows Installed Apps / Add or Remove Programs.
$pkg=Get-Content (Join-Path $InstallRoot 'package.json') -Raw | ConvertFrom-Json
$uninstallScript=Join-Path $InstallRoot 'scripts\Uninstall-Yardmaster.ps1'
$uninstallKey='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Yardmaster'
New-Item -Path $uninstallKey -Force | Out-Null
$uninstallCommand='powershell.exe -NoProfile -ExecutionPolicy Bypass -File "'+$uninstallScript+'"'
$quietUninstallCommand=$uninstallCommand+' -Quiet'
New-ItemProperty -Path $uninstallKey -Name DisplayName -Value 'Yardmaster' -PropertyType String -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name DisplayVersion -Value ([string]$pkg.version) -PropertyType String -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name Publisher -Value 'Chilton App Works LLC' -PropertyType String -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name InstallLocation -Value $InstallRoot -PropertyType String -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name DisplayIcon -Value $icon -PropertyType String -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name UninstallString -Value $uninstallCommand -PropertyType String -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name QuietUninstallString -Value $quietUninstallCommand -PropertyType String -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name NoModify -Value 1 -PropertyType DWord -Force | Out-Null
New-ItemProperty -Path $uninstallKey -Name NoRepair -Value 1 -PropertyType DWord -Force | Out-Null

Write-Host 'Yardmaster installed and registered with Windows Installed Apps.' -ForegroundColor Green
if(-not $NoLaunch){& (Join-Path $InstallRoot 'scripts\Start-Yardmaster.ps1')}
