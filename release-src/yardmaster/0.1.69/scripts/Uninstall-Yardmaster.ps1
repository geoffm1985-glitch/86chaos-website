param([switch]$Quiet)
$ErrorActionPreference='SilentlyContinue'

$Root=Join-Path $env:LOCALAPPDATA 'Yardmaster'
$AppRoot=Join-Path $Root 'app'
$UninstallKey='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Yardmaster'
@{reason='uninstall';until=[DateTimeOffset]::UtcNow.AddMinutes(10).ToUnixTimeMilliseconds()}|ConvertTo-Json|Set-Content (Join-Path $Root 'supervisor-stop.json') -Encoding UTF8 -ErrorAction SilentlyContinue

# Ask the running Yardmaster operator to shut itself down first.
try {
  Invoke-RestMethod 'http://127.0.0.1:8787/api/action' -Method Post -ContentType 'application/json' -Body (@{ action='shutdown-operator' } | ConvertTo-Json) -TimeoutSec 2 | Out-Null
} catch {}
Start-Sleep -Milliseconds 700

# Kill only Yardmaster-owned leftovers.
Get-Process -Name electron -ErrorAction SilentlyContinue | Where-Object {
  try { [string]$_.Path -like "$AppRoot*" } catch { $false }
} | ForEach-Object { try { & taskkill.exe /PID $_.Id /T /F | Out-Null } catch {} }
Get-Process -Name cloudflared -ErrorAction SilentlyContinue | Where-Object {
  try { [string]$_.Path -like "$AppRoot*" } catch { $false }
} | ForEach-Object { try { & taskkill.exe /PID $_.Id /T /F | Out-Null } catch {} }
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  $cmd=String($_.CommandLine)
  $exe=String($_.ExecutablePath)
  ($_.Name -eq 'node.exe' -and $cmd -like "*$Root*" -and $cmd -like '*server.mjs*') -or
  ($_.Name -eq 'electron.exe' -and ($cmd -like "*$Root*" -or $exe -like "$AppRoot*")) -or
  ($_.Name -eq 'msedge.exe' -and $cmd -like '*Yardmaster\edge-profile*') -or
  ($_.Name -eq 'cloudflared.exe' -and ($cmd -like "*$Root*" -or $exe -like "$AppRoot*")) -or
  ($_.Name -eq 'powershell.exe' -and $cmd -like '*Yardmaster-Supervisor.ps1*' -and $cmd -like "*$Root*")
} | ForEach-Object {
  try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {}
}

$Desktop=[Environment]::GetFolderPath('Desktop')
$StartMenu=Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
Remove-Item -LiteralPath (Join-Path $Desktop 'Yardmaster.lnk') -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path $StartMenu 'Yardmaster.lnk') -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $UninstallKey -Recurse -Force -ErrorAction SilentlyContinue

# Finish deletion from a separate process so this script can remove its own app folder.
$escaped=$Root.Replace("'","''")
$cleanup="for(`$i=0;`$i -lt 40 -and (Test-Path -LiteralPath '$escaped');`$i++){ Remove-Item -LiteralPath '$escaped' -Recurse -Force -ErrorAction SilentlyContinue; if(Test-Path -LiteralPath '$escaped'){Start-Sleep -Milliseconds 500} }"
Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-WindowStyle','Hidden','-Command',$cleanup) -WindowStyle Hidden | Out-Null

if(-not $Quiet){Write-Host 'Yardmaster has been uninstalled.' -ForegroundColor Green}
$global:LASTEXITCODE=0
