# Yardmaster 0.1.90 — three non-iPhone failure repairs

Evidence: the supplied 0.1.89 Windows handoff passed all 9 targeted Node tests. Playwright reported 26 passes and 19 failures. Sixteen failures were iPhone browser launch errors and were excluded at the user's request. Only the three remaining failures are repaired in this candidate.

1. Operations intelligence UI: all UI assertions passed, but Windows fixture deletion raised EPERM. Cleanup now waits for the child process close event after graceful shutdown or forced termination, then uses bounded filesystem lock retries. If close never arrives, fixture files are retained and an explicit error is reported.
2. Reproduction capsule, snapshot and manifest: the Windows trace spent roughly 28 seconds on startup and another 22 seconds on archive operations, exceeding its 45-second budget. This one test now allows 120 seconds; all export and isolation assertions remain.
3. Android structured payloads: the trusted-device row was replaced during section discovery, so Revoke remained hidden in Settings. The helper retries discovery until the row has an attached mobile section, selects that tab, and clicks the visible control within that section.

Targeted local command: `scripts/Test-Local-Yardmaster.ps1 -ExpectedCommit <delivered SHA> -ExpectedVersion 0.1.90 -FixedFailuresOnly`. It installs dependencies, checks syntax/coverage, installs Chromium, and runs only 6 Node regressions plus 5 Playwright tests: the three repaired failures and two helper regressions. No iPhone project or full certification gate is selected. Existing full/mobile commands remain available separately.

Validation: syntax/feature-coverage preflight passed; 26 Node checks passed (6 exact repair regressions plus static/coverage validation); all 5 selected Playwright tests passed using available Linux headless Chromium. The Android test exercises the hosted PWA markup and real UI with controlled remote APIs. Windows file-lock handling is covered by deterministic Node/Playwright regressions; the actual Windows/Edge rerun remains local. Physical Android devices, real push delivery, iPhone and production are not certified by this result.

Version 0.1.90 is a testing-only candidate. Hosted UI behavior is unchanged; release labels/cache metadata are updated. No production branch is modified.
