@echo off
setlocal EnableExtensions
title Yardmaster Installer

fltmc >nul 2>&1
if "%errorlevel%"=="0" goto :elevated

echo Requesting administrator permission for Yardmaster installation...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$script=[IO.Path]::GetFullPath('%~dp0scripts\Install-Yardmaster.ps1');" ^
  "$args=@('-NoProfile','-ExecutionPolicy','Bypass','-File',('"'+$script+'"'));" ^
  "try{$p=Start-Process -FilePath 'powershell.exe' -Verb RunAs -ArgumentList $args -PassThru -Wait;exit $p.ExitCode}catch{exit 1223}"
set "rc=%errorlevel%"
if "%rc%"=="1223" (
  echo Administrator permission was declined.
  pause
)
exit /b %rc%

:elevated
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Install-Yardmaster.ps1"
set "rc=%errorlevel%"
if not "%rc%"=="0" (
  echo.
  echo Yardmaster installation did not complete.
  pause
)
exit /b %rc%
