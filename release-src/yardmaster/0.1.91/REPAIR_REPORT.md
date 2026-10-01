# Yardmaster 0.1.91 testing candidate

This update addresses the reported phone refresh delay, target app version display and accidental Stop presses on PC and Android.

Phone: successful authenticated status now opens the dashboard before background intelligence requests finish. Reconnecting is shown while the saved session is checked. Status and intelligence polling each allow one outstanding request; API requests have a 12-second timeout. Network failures retain the session and trusted device. A rejected/expired session still requires the existing passkey. Pairing and server session expiry are unchanged. A delayed intelligence response reproduced the original pairing-screen failure before this repair.

Version: each run captures its repository package name and version after branch selection. PC and phone display this independently of historical test names and the Yardmaster operator version. Captured identity survives settings changes, run history and pause/resume checkpoints. Missing version data is labeled unavailable.

Stop: PC and phone ask "Stop the current test and Yardmaster workflow?" Cancel sends no Stop request and leaves the run active; Confirm sends one request.

Local command: scripts/Test-Local-Yardmaster.ps1 -ExpectedCommit <delivered SHA> -ExpectedVersion 0.1.91 -PhoneRepairOnly. It runs 13 focused Node regressions and 9 Playwright tests on desktop Chromium/Windows Edge and Android Chromium. iPhone is excluded at user request. No full Play Store or production certification was run. Linux headless Chromium validation does not establish physical Android, Windows Edge or real notification delivery results; those require the local run/device check.
