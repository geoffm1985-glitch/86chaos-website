# Yardmaster 0.1.107 testing candidate

Repair of blocking snapshot/ZIP installation, overlapping emulator health checks, and crash cleanup that previously relied only on IPC disconnect. Retains the five failed Windows cases and adds two focused lifecycle regressions.

Scoped Linux validation: 7 Node and 10 desktop/Android Playwright cases passed, with no failures or skips. Syntax/feature coverage passed (90 features). Previous-code defects were reproduced with owner-death and snapshot responsiveness probes.

Run scripts/Test-Local-Yardmaster.ps1 -FirebaseWindowsFailedOnly with the pinned testing commit for native Windows confirmation. Windows process-tree cleanup and PowerShell copying remain unverified by the Linux results.

No full gate or website deployment was performed. Yardmaster iPhone/WebKit tests remain removed.
