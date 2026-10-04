$ErrorActionPreference = 'Stop'

$repo = 'C:\Users\geoff\Documents\GitHub\86chaos'
Set-Location $repo

$branch = (git branch --show-current).Trim()
$version = (Get-Content '.\package.json' -Raw -Encoding UTF8 | ConvertFrom-Json).version

if ($branch -ne 'testing') {
    throw "Expected testing branch, found '$branch'."
}
if ($version -ne '17.0.78') {
    throw "Expected current candidate 17.0.78, found '$version'."
}

# The prior RUN full was incorrectly planned as delta because Yardmaster
# retained the closed-loop delta test plan from the preceding repair run.
# Use Yardmaster's own local control API to end that stale workflow state.
# This does not execute an npm, Playwright, or release-gate command.

$ports = New-Object System.Collections.Generic.List[int]
$ports.Add(8787)

try {
    $yardmasterProcesses = Get-CimInstance Win32_Process |
        Where-Object {
            $_.CommandLine -match 'Yardmaster|server\.mjs' -or
            $_.Name -match '^Yardmaster(\.exe)?$'
        }

    foreach ($process in $yardmasterProcesses) {
        if (-not $process.ProcessId) { continue }

        Get-NetTCPConnection -State Listen -OwningProcess $process.ProcessId -ErrorAction SilentlyContinue |
            ForEach-Object {
                if ($_.LocalPort -gt 0 -and -not $ports.Contains([int]$_.LocalPort)) {
                    $ports.Add([int]$_.LocalPort)
                }
            }
    }
} catch {
    # Default port 8787 remains available as the deterministic fallback.
}

$operatorBase = $null
$statusBefore = $null

foreach ($port in ($ports | Select-Object -Unique)) {
    try {
        $candidateBase = "http://127.0.0.1:$port"
        $candidateStatus = Invoke-RestMethod `
            -Uri "$candidateBase/api/status" `
            -Method Get `
            -TimeoutSec 2

        if ($candidateStatus -and $candidateStatus.config -and $candidateStatus.version) {
            $operatorBase = $candidateBase
            $statusBefore = $candidateStatus
            break
        }
    } catch {
        continue
    }
}

if (-not $operatorBase) {
    throw 'Could not locate the running Yardmaster local operator API.'
}

$configuredRepo = [string]$statusBefore.config.repositoryPath
if ($configuredRepo -and
    ([System.IO.Path]::GetFullPath($configuredRepo).TrimEnd('\') -ne
     [System.IO.Path]::GetFullPath($repo).TrimEnd('\'))) {
    throw "Yardmaster is pointed at '$configuredRepo', not '$repo'."
}

$beforeClosedLoop = [bool]$statusBefore.workflow.closedLoop
$beforePlan = [string]$statusBefore.workflow.testPlan
$beforeConfigType = [string]$statusBefore.config.testType

$stopResult = Invoke-RestMethod `
    -Uri "$operatorBase/api/action" `
    -Method Post `
    -ContentType 'application/json' `
    -Body '{"action":"stop"}' `
    -TimeoutSec 10

Start-Sleep -Milliseconds 500

$statusAfter = Invoke-RestMethod `
    -Uri "$operatorBase/api/status" `
    -Method Get `
    -TimeoutSec 3

if ([bool]$statusAfter.workflow.closedLoop) {
    throw 'Yardmaster stale closed-loop plan did not clear.'
}

Write-Output 'YARDMASTER_FULL_GATE_PLAN_RESET'
Write-Output "REPO=$repo"
Write-Output "BRANCH=$branch"
Write-Output "VERSION=$version"
Write-Output "OPERATOR=$operatorBase"
Write-Output "PREVIOUS_CONFIG_TEST_TYPE=$beforeConfigType"
Write-Output "PREVIOUS_WORKFLOW_PLAN=$beforePlan"
Write-Output "PREVIOUS_CLOSED_LOOP=$beforeClosedLoop"
Write-Output "CURRENT_CLOSED_LOOP=$([bool]$statusAfter.workflow.closedLoop)"
Write-Output 'No 86 Chaos source files were changed.'
Write-Output 'The next RUN full must now execute the full Play Store release gate rather than inherit the stale delta plan.'
