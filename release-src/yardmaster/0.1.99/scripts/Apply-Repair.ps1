param(
  [Parameter(Mandatory=$true)][string]$RepoPath,
  [Parameter(Mandatory=$true)][string]$ZipPath
)
$ErrorActionPreference='Stop'
if(-not(Test-Path (Join-Path $RepoPath '.git'))){throw 'Target repository .git folder is missing.'}
if(-not(Test-Path $ZipPath)){throw "Repair ZIP not found: $ZipPath"}
$temp=Join-Path $env:TEMP ('Yardmaster-Repair-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $temp|Out-Null
try{
  Expand-Archive -LiteralPath $ZipPath -DestinationPath $temp -Force
  $candidates=Get-ChildItem -LiteralPath $temp -Recurse -File -Filter package.json|ForEach-Object{$_.Directory.FullName}
  $source=$candidates|Where-Object{(Test-Path (Join-Path $_ 'src')) -or (Test-Path (Join-Path $_ 'api'))}|Select-Object -First 1
  if(-not $source){$source=$candidates|Select-Object -First 1}
  if(-not $source){throw 'No application package.json was found in the repaired ZIP.'}
  $currentPackage=Get-Content -LiteralPath (Join-Path $RepoPath 'package.json') -Raw|ConvertFrom-Json
  $repairPackage=Get-Content -LiteralPath (Join-Path $source 'package.json') -Raw|ConvertFrom-Json
  try{$currentVersion=[version]$currentPackage.version;$repairVersion=[version]$repairPackage.version}catch{throw 'Could not validate application version numbers in the repair package.'}
  if($repairVersion -le $currentVersion){throw "Repair package version $repairVersion must be newer than local version $currentVersion. Yardmaster will not install a non-incremented build."}
  $sourceFiles=(Get-ChildItem -LiteralPath $source -Recurse -File -ErrorAction Stop|Measure-Object).Count
  if($sourceFiles -lt 50){throw "Repair ZIP looks incomplete ($sourceFiles files). Yardmaster requires a complete application package."}
  $excludeDirs=@('.git','node_modules','build','dist','test-results','playwright-report','coverage','.vercel','.firebase','release-evidence')
  $excludeFiles=@('.env','.env.*','.npmrc','*.pem','*.pfx','*.p12','*.key','*adminsdk*.json','*service-account*.json','*credentials*.json','*private-key*.json')
  $args=@($source,$RepoPath,'/E','/COPY:DAT','/R:1','/W:1','/NFL','/NDL','/NJH','/NJS','/NP','/XD')+$excludeDirs+@('/XF')+$excludeFiles
  robocopy @args|Out-Null
  if($LASTEXITCODE -ge 8){throw "Repair overlay failed with robocopy code $LASTEXITCODE"}
  Write-Output $source
}finally{Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue}
