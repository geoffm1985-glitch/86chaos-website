$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath 'C:\Users\geoff\Documents\86chaos-website-prelaunch'
$env:WEBSITE_TEST_RUN = 'run-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
$websiteRunDir = Join-Path 'test-results' $env:WEBSITE_TEST_RUN
New-Item -ItemType Directory -Force $websiteRunDir | Out-Null
$env:WEBSITE_TEST_RUN | Set-Content test-results\latest-run.txt
Start-Transcript -Path (Join-Path $websiteRunDir 'visible-session.log')
try {
  & node.exe node_modules\@playwright\test\cli.js test --max-failures=2 2>&1 | Tee-Object -FilePath (Join-Path $websiteRunDir 'browser-output.log')
  $browserExit = $LASTEXITCODE
  @{ finishedAt = (Get-Date).ToUniversalTime().ToString('o'); exitCode = $browserExit; visiblePowerShell = $true } | ConvertTo-Json | Set-Content (Join-Path $websiteRunDir 'session-status.json')
} finally { Stop-Transcript }
exit $browserExit
