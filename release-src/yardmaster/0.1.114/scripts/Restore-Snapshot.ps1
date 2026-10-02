param(
  [Parameter(Mandatory=$true)][string]$RepoPath,
  [Parameter(Mandatory=$true)][string]$SnapshotPath
)
$ErrorActionPreference='Stop'
if(-not(Test-Path (Join-Path $RepoPath '.git'))){throw 'Target repository .git folder is missing.'}
if(-not(Test-Path -LiteralPath $SnapshotPath)){throw "Snapshot ZIP not found: $SnapshotPath"}
$temp=Join-Path $env:TEMP ('Yardmaster-Snapshot-Restore-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $temp|Out-Null
try{
  Expand-Archive -LiteralPath $SnapshotPath -DestinationPath $temp -Force
  $tracked=Join-Path $temp 'tracked-head.zip'
  if(-not(Test-Path -LiteralPath $tracked)){throw 'Snapshot is missing tracked-head.zip.'}
  $source=Join-Path $temp 'tracked'
  New-Item -ItemType Directory -Force -Path $source|Out-Null
  Expand-Archive -LiteralPath $tracked -DestinationPath $source -Force
  if(-not(Test-Path (Join-Path $source 'package.json'))){throw 'Snapshot tracked archive does not contain package.json.'}
  $excludeDirs=@('.git','node_modules','build','dist','test-results','playwright-report','coverage','.vercel','.firebase','release-evidence')
  $excludeFiles=@('.env','.env.*','.npmrc','*.pem','*.pfx','*.p12','*.key','*adminsdk*.json','*service-account*.json','*credentials*.json','*private-key*.json')
  $args=@($source,$RepoPath,'/MIR','/COPY:DAT','/R:1','/W:1','/NFL','/NDL','/NJH','/NJS','/NP','/XD')+$excludeDirs+@('/XF')+$excludeFiles
  robocopy @args|Out-Null
  if($LASTEXITCODE -ge 8){throw "Snapshot restore failed with robocopy code $LASTEXITCODE"}
  $patch=Join-Path $temp 'working-tree.patch'
  if(Test-Path -LiteralPath $patch){
    $patchText=Get-Content -LiteralPath $patch -Raw -ErrorAction SilentlyContinue
    if($patchText){
      $patchFile=Join-Path $env:TEMP ('Yardmaster-Snapshot-Working-'+[guid]::NewGuid().ToString('N')+'.patch')
      try{
        Set-Content -LiteralPath $patchFile -Value $patchText -Encoding UTF8
        & git -C $RepoPath apply --whitespace=nowarn $patchFile
        if($LASTEXITCODE -ne 0){throw 'Tracked snapshot was restored, but the saved working-tree patch could not be reapplied.'}
      }finally{Remove-Item -LiteralPath $patchFile -Force -ErrorAction SilentlyContinue}
    }
  }
  Write-Output $RepoPath
}finally{
  Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
}
