param(
  [Parameter(Mandatory=$true)][int]$RootPid,
  [Parameter(Mandatory=$true)][ValidateSet('Suspend','Resume')][string]$Action
)
$ErrorActionPreference='Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class YardmasterNativeProcess {
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern IntPtr OpenProcess(uint access, bool inheritHandle, int processId);
  [DllImport("kernel32.dll", SetLastError=true)]
  public static extern bool CloseHandle(IntPtr handle);
  [DllImport("ntdll.dll")]
  public static extern int NtSuspendProcess(IntPtr processHandle);
  [DllImport("ntdll.dll")]
  public static extern int NtResumeProcess(IntPtr processHandle);
}
"@
function Get-Descendants([int]$Pid) {
  $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$Pid" -ErrorAction SilentlyContinue)
  $ids = @()
  foreach($child in $children) {
    $ids += [int]$child.ProcessId
    $ids += Get-Descendants -Pid ([int]$child.ProcessId)
  }
  return $ids
}
function Set-State([int]$Pid,[string]$Mode) {
  $PROCESS_SUSPEND_RESUME = 0x0800
  $h=[YardmasterNativeProcess]::OpenProcess($PROCESS_SUSPEND_RESUME,$false,$Pid)
  if($h -eq [IntPtr]::Zero){ return }
  try {
    if($Mode -eq 'Suspend'){ [void][YardmasterNativeProcess]::NtSuspendProcess($h) }
    else { [void][YardmasterNativeProcess]::NtResumeProcess($h) }
  } finally { [void][YardmasterNativeProcess]::CloseHandle($h) }
}
$ids = @(Get-Descendants -Pid $RootPid)
if($Action -eq 'Suspend') {
  [array]::Reverse($ids)
  foreach($id in $ids){ Set-State -Pid $id -Mode Suspend }
  Set-State -Pid $RootPid -Mode Suspend
} else {
  Set-State -Pid $RootPid -Mode Resume
  foreach($id in $ids){ Set-State -Pid $id -Mode Resume }
}
