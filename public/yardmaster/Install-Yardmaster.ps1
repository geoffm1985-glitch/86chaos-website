$ErrorActionPreference='Stop'
$SourceRoot=Join-Path $env:LOCALAPPDATA 'Yardmaster\source'
$Repo='https://github.com/geoffm1985-glitch/yardmaster.git'
Write-Host 'Yardmaster Preview Installer' -ForegroundColor Cyan
if(-not(Get-Command git.exe -ErrorAction SilentlyContinue)){throw 'Git is required. Install Git for Windows or GitHub Desktop first.'}
if(-not(Get-Command node.exe -ErrorAction SilentlyContinue)){throw 'Node.js 22 or newer is required for this preview.'}
$major=[int]((& node -p "process.versions.node.split('.')[0]").Trim())
if($major -lt 22){throw "Node $(& node -v) is too old. Node 22+ is required."}
if(Test-Path (Join-Path $SourceRoot '.git')){
  Write-Host 'Updating Yardmaster source...' -ForegroundColor Cyan
  git -C $SourceRoot pull --ff-only
  if($LASTEXITCODE -ne 0){throw 'Could not update the Yardmaster repository.'}
}else{
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $SourceRoot)|Out-Null
  Write-Host 'Downloading Yardmaster from your private GitHub repository...' -ForegroundColor Cyan
  git clone $Repo $SourceRoot
  if($LASTEXITCODE -ne 0){throw 'Could not clone the Yardmaster repository. Make sure GitHub Desktop/Git Credential Manager is signed in to your GitHub account.'}
}
& (Join-Path $SourceRoot 'scripts\Install-Yardmaster.ps1')
