@echo off
setlocal
set "YM=%TEMP%\Install-Yardmaster.ps1"
echo Downloading Yardmaster installer...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest 'https://www.86chaos.com/yardmaster/Install-Yardmaster.ps1' -OutFile '%YM%' -UseBasicParsing"
if errorlevel 1 (
  echo Yardmaster installer download failed.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%YM%"
if errorlevel 1 (
  echo.
  echo Yardmaster installation did not complete.
  pause
  exit /b 1
)
endlocal
