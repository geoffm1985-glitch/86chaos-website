& {
    $ErrorActionPreference = 'Stop'
    $PSNativeCommandUseErrorActionPreference = $false
    $timer = [Diagnostics.Stopwatch]::StartNew()
    $repo = 'C:\Users\geoff\Documents\Yardmaster-Repo'
    $zip = Join-Path $env:USERPROFILE 'Downloads\Yardmaster-0.1.83-DESKTOP-VISIBILITY-COMPLETE-APPLICATION.zip'
    $stage = Join-Path $env:TEMP ('Yardmaster-0.1.83-' + [guid]::NewGuid().ToString('N'))
    function Run-Checked([string]$command) {
        Write-Host "[RUNNING] $command" -ForegroundColor Cyan
        cmd.exe /d /s /c $command
        if ($LASTEXITCODE -ne 0) { throw "$command failed: exit $LASTEXITCODE" }
    }
    try {
        if (-not (Test-Path -LiteralPath $zip)) { throw "Download the complete ZIP first: $zip" }
        Expand-Archive -LiteralPath $zip -DestinationPath $stage -Force
        Set-Location -LiteralPath $repo
        $dirty = @(git status --porcelain)
        if ($LASTEXITCODE -ne 0) { throw 'Cannot read repository status.' }
        if ($dirty.Count) {
            $stash = 'yardmaster-before-0.1.83-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
            Run-Checked "git stash push -u -m $stash"
            Write-Host "Local changes preserved in stash: $stash"
        }
        & (Join-Path $stage 'scripts\Apply-Repair.ps1') -RepoPath $repo -ZipPath $zip
        $version = (Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json).version
        if ($version -ne '0.1.83') { throw "Expected 0.1.83, found $version" }
        Run-Checked 'npm ci --no-audit --no-fund'
        Run-Checked 'npm run check'
        Run-Checked 'node --test --test-concurrency=1 test/desktop-layout.test.mjs test/static-contracts.test.mjs test/resumable-pause-docked-chatgpt.test.mjs test/operations-intelligence.test.mjs test/test-reporting.test.mjs'
        Run-Checked 'npx playwright test test/playwright/desktop-layout.e2e.spec.mjs test/playwright/operations-intelligence.e2e.spec.mjs test/playwright/resumable-pause-docked-chatgpt.e2e.spec.mjs'
        Write-Host 'TARGETED TESTS PASS. To update the installed dashboard, run .\Install-Yardmaster.cmd.' -ForegroundColor Green
        $global:LASTEXITCODE = 0
    } catch {
        Write-Host "TARGETED TESTS FAIL: $($_.Exception.Message)" -ForegroundColor Red
        $global:LASTEXITCODE = 1
    } finally {
        Remove-Item -LiteralPath $stage -Recurse -Force -ErrorAction SilentlyContinue
        $timer.Stop()
        Write-Host "Total elapsed: $($timer.Elapsed.ToString())"
    }
}
