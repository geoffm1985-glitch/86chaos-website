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
  # Repair files must replace local content even when ZIP size/date metadata match.
  # Walk eligible directories explicitly so protected local state stays excluded.
  function Copy-RepairDirectory([string]$From,[string]$To){
    New-Item -ItemType Directory -Force -Path $To|Out-Null
    foreach($item in Get-ChildItem -LiteralPath $From -Force -ErrorAction Stop){
      $destination=Join-Path $To $item.Name
      if($item.PSIsContainer){
        if($excludeDirs -notcontains $item.Name){Copy-RepairDirectory $item.FullName $destination}
      }else{
        $excluded=$false
        foreach($pattern in $excludeFiles){if($item.Name -like $pattern){$excluded=$true;break}}
        if(-not $excluded){Copy-Item -LiteralPath $item.FullName -Destination $destination -Force -ErrorAction Stop}
      }
    }
  }
  Copy-RepairDirectory $source $RepoPath
  $installedPackage=Get-Content -LiteralPath (Join-Path $RepoPath 'package.json') -Raw|ConvertFrom-Json
  if($installedPackage.version -ne $repairPackage.version){throw "Repair overlay did not install version $($repairPackage.version)."}
  Write-Output $source
}finally{Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue}
