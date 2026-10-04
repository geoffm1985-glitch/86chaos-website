function Get-YardmasterApplicationHash {
  param([string]$Path)
  $stream=[IO.File]::OpenRead($Path)
  $sha=[Security.Cryptography.SHA256]::Create()
  try{return [BitConverter]::ToString($sha.ComputeHash($stream))}finally{$stream.Dispose();$sha.Dispose()}
}
function Assert-YardmasterApplicationCopy {
  param([string]$Source,[string]$Destination)
  $sourceRoot=[IO.Path]::GetFullPath($Source).TrimEnd('\')+'\'
  foreach($file in Get-ChildItem -LiteralPath $sourceRoot -Recurse -File){
    $relative=$file.FullName.Substring($sourceRoot.Length)
    if($relative -match '(^|\\)(\.git|node_modules|bin)(\\|$)' -or $file.Extension -eq '.log'){continue}
    $target=Join-Path $Destination $relative
    if(-not(Test-Path -LiteralPath $target -PathType Leaf) -or
       (Get-YardmasterApplicationHash $file.FullName) -ne (Get-YardmasterApplicationHash $target)){
      throw ('Yardmaster installed file verification failed: '+$relative+'. The operator will not restart.')
    }
  }
}
function Copy-YardmasterApplication {
  param([string]$Source,[string]$Destination)
  if([IO.Path]::GetFullPath($Source).TrimEnd('\') -eq [IO.Path]::GetFullPath($Destination).TrimEnd('\')){throw 'Yardmaster source and installation must be different directories.'}
  # Release ZIP timestamps are fixed. Same size/time does not imply identical bytes.
  robocopy $Source $Destination /MIR /IS /IT /XD .git node_modules bin /XF *.log | Out-Null
  if($LASTEXITCODE -ge 8){throw "Yardmaster application copy failed with code $LASTEXITCODE"}
  $sourceRoot=[IO.Path]::GetFullPath($Source).TrimEnd('\')+'\'
  foreach($file in Get-ChildItem -LiteralPath $sourceRoot -Recurse -File){
    $relative=$file.FullName.Substring($sourceRoot.Length)
    if($relative -match '(^|\\)(\.git|node_modules|bin)(\\|$)' -or $file.Extension -eq '.log'){continue}
    $target=Join-Path $Destination $relative
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    Copy-Item -LiteralPath $file.FullName -Destination $target -Force
  }
  Assert-YardmasterApplicationCopy -Source $Source -Destination $Destination
}
