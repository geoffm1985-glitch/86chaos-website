$ErrorActionPreference='Stop'
$ManifestUrl='https://www.86chaos.com/yardmaster/release.json'
$TempRoot=Join-Path $env:TEMP ('Yardmaster-Download-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $TempRoot | Out-Null
try {
  Write-Host 'Downloading the newest verified Yardmaster release...' -ForegroundColor Cyan
  $manifest=Invoke-RestMethod -Uri $ManifestUrl -Method Get -TimeoutSec 30
  if($manifest.verified -ne $true -or -not $manifest.version -or -not $manifest.downloadUrl -or -not $manifest.sha256){throw 'The Yardmaster release manifest is incomplete or not verified.'}
  $archive=Join-Path $TempRoot ('Yardmaster-Windows-'+$manifest.version+'.zip')
  $downloadUri=[Uri]::new([Uri]$ManifestUrl,[string]$manifest.downloadUrl).AbsoluteUri
  Invoke-WebRequest -Uri $downloadUri -OutFile $archive -UseBasicParsing -TimeoutSec 120
  $actual=(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
  if($actual -ne ([string]$manifest.sha256).ToLowerInvariant()){throw 'Yardmaster download checksum verification failed.'}
  $extract=Join-Path $TempRoot 'package'
  Expand-Archive -LiteralPath $archive -DestinationPath $extract -Force
  $installer=Get-ChildItem -LiteralPath $extract -Recurse -File -Filter 'Yardmaster-Installer.cmd' | Select-Object -First 1
  if(-not $installer){throw 'The Yardmaster package does not contain Yardmaster-Installer.cmd.'}
  $process=Start-Process -FilePath $installer.FullName -WorkingDirectory $installer.Directory.FullName -PassThru -Wait
  exit $process.ExitCode
} finally {
  Remove-Item -LiteralPath $TempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

