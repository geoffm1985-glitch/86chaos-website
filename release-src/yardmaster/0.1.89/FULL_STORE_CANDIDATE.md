# Yardmaster 0.1.89 testing candidate

This candidate repairs the supplied 0.1.88 Playwright failures and adds hosted PWA tests for Android Chromium and iPhone WebKit. Read REPAIR_REPORT.md for evidence and scope.

User-selected local verification: `scripts/Test-Local-Yardmaster.ps1 -ExpectedCommit <delivered SHA> -ExpectedVersion 0.1.89 -MobileAndFailed`.

Only mobile Node regressions and mobile/previously failed Playwright tests run. Full Play Store certification is available separately and has not been run automatically. This build is not certified for production.
