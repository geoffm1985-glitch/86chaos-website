param(
    [Parameter(Mandatory=$true)][string]$ExpectedCommit,
    [string]$ExpectedVersion = '0.1.89',
    [string]$PreservedStash = '',
    [switch]$MobileAndFailed
)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$timer = [Diagnostics.Stopwatch]::StartNew()
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$repo = Split-Path -Parent $PSScriptRoot
$expected = $ExpectedCommit
$log = Join-Path $env:TEMP "Yardmaster-Full-Test-$stamp.log"
$stash = $PreservedStash; $failureZip = ''; $version = 'unknown'; $commit = 'unknown'; $code = 1; $phase = 'setup'
function Invoke-Checked([string]$command) {
    Write-Host "[RUNNING] $command" -ForegroundColor Cyan
    cmd.exe /d /s /c "$command 2>&1" | Tee-Object -FilePath $log -Append
    $script:code = $LASTEXITCODE
    if ($script:code -ne 0) { throw "$command failed with exit code $script:code" }
    Write-Host "[PASS] $command" -ForegroundColor Green
}
try {
    Write-Host 'Starting Yardmaster local certification...'
    Set-Location -LiteralPath $repo
    $prior = Join-Path $env:TEMP "Yardmaster-Prior-Test-Artifacts-$stamp"
    foreach ($name in @('test-results','playwright-report')) {
        if (Test-Path -LiteralPath $name) {
            New-Item -ItemType Directory -Force -Path $prior | Out-Null
            Move-Item -LiteralPath $name -Destination (Join-Path $prior $name)
        }
    }
    $commit = (git rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Cannot read repository commit.' }
    $version = (Get-Content -LiteralPath package.json -Raw | ConvertFrom-Json).version
    if ($commit -ne $expected -or $version -ne $ExpectedVersion) { throw "Expected $ExpectedVersion at $expected; found $version at $commit. Tests were not started." }
    Write-Host "Verified Yardmaster $version at $commit"
    $phase = 'dependency installation'
    Invoke-Checked 'npm ci'
    $phase = 'syntax and feature coverage check'
    Invoke-Checked 'npm run check'
    if ($MobileAndFailed) {
        $phase = 'mobile browser installation'
        Invoke-Checked 'npx playwright install chromium webkit'
        $phase = 'mobile and previously failed tests only'
        Write-Host 'Running Android Chromium, iPhone WebKit, and the exact previously failed tests...'
        cmd.exe /d /s /c 'npm run test:mobile:failed 2>&1' | Tee-Object -FilePath $log -Append
    } else {
        $phase = 'full local Play Store and Playwright tests'
        Write-Host 'Running full local tests; live output follows...'
        cmd.exe /d /s /c 'npm run test:play-store 2>&1' | Tee-Object -FilePath $log -Append
    }
    $code = $LASTEXITCODE
} catch {
    $_.Exception.Message | Tee-Object -FilePath $log -Append | Write-Host
    if ($code -eq 0) { $code = 1 }
} finally {
    if ($code -ne 0 -and (Test-Path -LiteralPath (Join-Path $repo 'package.json'))) {
        try {
            Write-Host 'Creating fresh failure handoff ZIP...'
            $stage = Join-Path $env:TEMP ('Yardmaster-Test-Handoff-' + [guid]::NewGuid().ToString('N'))
            $app = Join-Path $stage 'app'; $evidence = Join-Path $stage 'evidence'
            New-Item -ItemType Directory -Force -Path $app,$evidence | Out-Null
            $excluded = @('.git','node_modules','build','dist','coverage','.vercel','.firebase','.local','data','secrets','release-evidence','test-results','playwright-report')
            $secretFiles = @('.env','.env.*','.npmrc','*.pem','*.pfx','*.p12','*.key','*adminsdk*.json','*service-account*.json','*credentials*.json','*private-key*.json','*secret*.json')
            $copyArgs = @($repo,$app,'/E','/XJ','/COPY:DAT','/R:1','/W:1','/NFL','/NDL','/NJH','/NJS','/NP','/XD') + $excluded + @('/XF') + $secretFiles + @('*.zip')
            robocopy @copyArgs | Out-Null
            if ($LASTEXITCODE -ge 8) { throw "Source copy failed: robocopy $LASTEXITCODE" }
            foreach ($name in @('test-results','playwright-report')) {
                $source = Join-Path $repo $name
                if (Test-Path -LiteralPath $source) {
                    $copyArgs = @($source,(Join-Path $evidence $name),'/E','/XJ','/R:1','/W:1','/NFL','/NDL','/NJH','/NJS','/NP','/XD','.git','node_modules','secrets','/XF') + $secretFiles
                    robocopy @copyArgs | Out-Null
                    if ($LASTEXITCODE -ge 8) { throw "Evidence copy failed: robocopy $LASTEXITCODE" }
                }
            }
            Copy-Item -LiteralPath $log -Destination (Join-Path $evidence 'FULL-TEST-OUTPUT.log')
            "Yardmaster CURRENT FAILURE: version=$version commit=$commit phase=$phase exit=$code. Read FULL-TEST-OUTPUT.log first. The app folder contains current local source. Artifacts are from the current test attempt when present. Repair only evidenced failures, retain Node and Playwright coverage, bump the version, return one complete application ZIP and one pull-and-test command. Do not deploy production or run the full suite automatically." | Set-Content -LiteralPath (Join-Path $stage 'YARDMASTER_PROMPT.txt') -Encoding UTF8
            $downloads = Join-Path $env:USERPROFILE 'Downloads'
            New-Item -ItemType Directory -Force -Path $downloads | Out-Null
            $target = Join-Path $downloads "Yardmaster-Test-Handoff-$stamp.zip"
            Add-Type -AssemblyName System.IO.Compression.FileSystem
            [IO.Compression.ZipFile]::CreateFromDirectory($stage,$target,[IO.Compression.CompressionLevel]::Optimal,$false)
            $failureZip = $target
        } catch { Write-Host "Failure ZIP could not be created: $($_.Exception.Message)" }
    }
    $timer.Stop()
    Write-Host "`nYardmaster: $version`nCommit: $commit`nLog: $log"
    if ($stash) { Write-Host "Local changes preserved in stash: $stash" }
    if ($failureZip) { Write-Host "Failure ZIP: $failureZip" }
    if ($code -eq 0) { Write-Host "`n================ OVERALL PASS ================" -ForegroundColor Green }
    else { Write-Host "`n================ OVERALL FAIL ================`nFailed phase: $phase" -ForegroundColor Red }
    Write-Host "Total elapsed: $($timer.Elapsed.ToString())`nFinal exit code: $code"
    $global:LASTEXITCODE = $code
}
