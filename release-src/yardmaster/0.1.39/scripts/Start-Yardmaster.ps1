$ErrorActionPreference='Stop'
$Root=Split-Path -Parent $PSScriptRoot
$electron=Join-Path $Root 'node_modules\electron\dist\electron.exe'
$desktopEntry=Join-Path $Root 'desktop.cjs'
if(-not(Test-Path $electron)){ throw 'Yardmaster Electron runtime is missing. Run the Yardmaster installer again.' }
if(-not(Test-Path $desktopEntry)){ throw 'Yardmaster desktop shell is missing. Run the Yardmaster installer again.' }
Start-Process -FilePath $electron -ArgumentList ('"' + $desktopEntry + '"') -WorkingDirectory $Root
