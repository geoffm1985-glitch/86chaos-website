function Invoke-YardmasterNpm {
  param([string[]]$NpmArguments)
  $ymNode=(Get-Command node.exe -ErrorAction Stop).Source
  $ymNpmCli=Join-Path (Split-Path -Parent $ymNode) 'node_modules\npm\bin\npm-cli.js'
  if(-not (Test-Path -LiteralPath $ymNpmCli)){throw 'The Node installation is missing its npm runtime.'}
  # Bypass npm.ps1/npm.cmd shims that redirect to a deleted roaming install.
  & $ymNode $ymNpmCli @NpmArguments
}
