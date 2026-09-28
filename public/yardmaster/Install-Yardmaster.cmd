@echo off
setlocal
set "YM=%TEMP%\Install-Yardmaster-%RANDOM%.ps1"
echo Downloading the verified Yardmaster installer...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest 'https://www.86chaos.com/yardmaster/Install-Yardmaster.ps1' -OutFile '%YM%' -UseBasicParsing"
if errorlevel 1 (
  echo Yardmaster installer download failed.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%YM%"
set "rc=%errorlevel%"
del /q "%YM%" >nul 2>&1
if not "%rc%"=="0" (
  echo.
  echo Yardmaster installation did not complete.
  pause
)
exit /b %rc%

