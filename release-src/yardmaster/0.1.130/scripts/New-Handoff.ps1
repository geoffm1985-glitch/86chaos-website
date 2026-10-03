param(
  [Parameter(Mandatory=$true)][string]$RepoPath,
  [Parameter(Mandatory=$true)][string]$OutputPath,
  [string]$FailureSummary='',
  [string]$EvidenceDir='',
  [string]$FailureArchive='',
  [ValidateSet('repair','implementation')][string]$WorkType='repair',
  [string]$TaskPrompt=''
)
$ErrorActionPreference='Stop'
if(-not(Test-Path (Join-Path $RepoPath 'package.json'))){throw "package.json not found in $RepoPath"}
$temp=Join-Path $env:TEMP ('Yardmaster-Handoff-'+[guid]::NewGuid().ToString('N'))
$app=Join-Path $temp 'app'
$evidence=Join-Path $temp 'evidence'
New-Item -ItemType Directory -Force -Path $app,$evidence|Out-Null
try{
  $excludeDirs=@('.git','node_modules','build','dist','test-results','playwright-report','coverage','.vercel','.firebase','release-evidence')
  $excludeFiles=@('.env','.env.*','.npmrc','*.pem','*.pfx','*.p12','*.key','*adminsdk*.json','*service-account*.json','*credentials*.json','*private-key*.json','*SLIM-UPLOAD-ME*.zip','*EXACT-FAILED-SOURCE.zip','Yardmaster-Handoff*.zip')
  $args=@($RepoPath,$app,'/E','/COPY:DAT','/R:1','/W:1','/NFL','/NDL','/NJH','/NJS','/NP','/XD')+$excludeDirs+@('/XF')+$excludeFiles
  robocopy @args|Out-Null
  if($LASTEXITCODE -ge 8){throw "Source copy failed with robocopy code $LASTEXITCODE"}
  $slim=if($FailureArchive){Get-Item -LiteralPath $FailureArchive -ErrorAction Stop}else{Get-ChildItem -LiteralPath $RepoPath -Recurse -File -Filter '*SLIM-UPLOAD-ME*.zip' -ErrorAction SilentlyContinue|Sort-Object LastWriteTime -Descending|Select-Object -First 1}
  if($slim){Copy-Item $slim.FullName (Join-Path $evidence $slim.Name)}
  if($EvidenceDir -and (Test-Path $EvidenceDir)){Get-ChildItem -LiteralPath $EvidenceDir -File -ErrorAction SilentlyContinue|ForEach-Object{Copy-Item -LiteralPath $_.FullName -Destination $evidence -Force}}

  if($WorkType -eq 'implementation'){
    $prompt=@"
YARDMASTER IMPLEMENTATION HANDOFF

Implement the requested 86 Chaos change in the attached current application.

Requested work:
$TaskPrompt

Rules:
- Treat the application as production software.
- Inspect the existing implementation before changing anything.
- Make surgical, evidence-backed changes and preserve correct existing behavior.
- Do not expose, request, or add local credentials.
- Every implementation change must include corresponding Play Store/release-gate test coverage AND Playwright regression coverage for the exact feature or fix.
- Increment the application version for every new build.
- Test only the affected/targeted scope until it passes unless the request explicitly calls for the full release gate.
- Preserve .git and local environment/config files; avoid destructive Git operations.
- Never push production/main automatically.
- Maintain Android and iPhone/iOS compatibility where applicable.
- Minimize ongoing Firebase, Vercel, and other infrastructure costs without weakening reliability or security.
- Return ONE COMPLETE APPLICATION ZIP when finished so Yardmaster can apply and test it locally.
"@
  } else {
    $prompt=@"
YARDMASTER REPAIR HANDOFF

Analyze the attached current application and test evidence. Make only evidence-backed repairs.

Rules:
- Treat the application as production software.
- Do not expose, request, or add local credentials.
- Preserve existing behavior unless the failure proves a repair is required.
- Every implementation change must have corresponding targeted, Play Store/release-gate, and Playwright regression coverage.
- Every new application build must increment the version.
- Preserve .git and local environment/config files; avoid destructive Git operations.
- Never push production/main automatically.
- Maintain Android and iPhone/iOS compatibility where applicable.
- Minimize ongoing Firebase, Vercel, and other infrastructure costs without weakening reliability or security.
- Return one complete application ZIP when finished.

Latest local failure summary:
$FailureSummary
"@
  }
  Set-Content -LiteralPath (Join-Path $temp 'YARDMASTER_PROMPT.txt') -Value $prompt -Encoding UTF8
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $OutputPath)|Out-Null
  Compress-Archive -Path (Join-Path $temp '*') -DestinationPath $OutputPath -Force -CompressionLevel Optimal
  Write-Output $OutputPath
}finally{Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue}
