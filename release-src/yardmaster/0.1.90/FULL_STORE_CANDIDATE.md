# Yardmaster 0.1.90 testing candidate

Repairs only the three supplied non-iPhone 0.1.89 failures. Read REPAIR_REPORT.md for evidence, validation and limits.

User-selected verification: `scripts/Test-Local-Yardmaster.ps1 -ExpectedCommit <delivered SHA> -ExpectedVersion 0.1.90 -FixedFailuresOnly`.

Runs 6 Node regressions and 5 Playwright tests (three original failures plus two helper regressions). iPhone is excluded. No full Play Store gate was run automatically. This build is not certified for production.
