# Yardmaster 0.1.103 testing candidate

Source: latest geoffm1985-glitch/yardmaster yardmaster-testing, baseline d173a06d7cd3ab1940d6915242c4815921c707d8 (0.1.102). No 86 Chaos source or main/production branch was changed. Version bumped once.

## Implemented

- Repaired the original continuous-loop failures: native controls are selected on the Operations tab; held hosted replies, repair ZIP application and deployment polling have separate realistic phase deadlines. Fixture teardown preserves the original failure evidence.
- Persistent Firebase Test Target: Emulator (default), Live Cloud and Both; Both selects Verification Only (default) or Full Live Suite. Matching Windows/native and hosted Android/PWA controls include current target/phase, timestamped status, product readiness, live project/billable indicator and local operational counters.
- Production launches the official Firebase Emulator Suite, checks every applicable Auth/Firestore/Functions/RTDB/Storage endpoint through the Hub and local app bridge, reuses the session across repairs, and blocks missing tooling, invalid configuration or crashed emulators without live fallback. Demo project identity and Node/Playwright loopback guards protect emulator test descendants.
- Full Play Store and full Playwright commands retain their complete eligible inventories. Both always starts with the full emulator phase. A failed live phase returns to local repair/delta before one selected live recheck; it never silently expands Verification Only into the full live suite.
- Saved target/phase survives settings changes, pause, resume, interruption, assistant RUN and self-heal test/canary subprocesses. Cancellation and IPC crash-watchdog cleanup remove owned emulator process trees; graceful sessions export/import data outside the target worktree.
- Removed Yardmaster iPhone/WebKit projects and iPhone-specific cases/install requests; retained desktop and Android coverage. 86 Chaos iPhone/iOS requirements remain in its handoff prompts.

## Verification

Syntax and feature inventory PASS: 83 features, 37 actions, 19 routes, 19 UI actions, 26 config keys, 20 Playwright specs.
Scoped Play Store/Node regressions: 97 passed, 0 failed, 1 Windows-only process suspension check skipped on Linux (98 total).
Scoped Playwright regressions: 53 passed, 0 failed, desktop Chromium and Android Chromium emulation.
The full application Play Store certification gate was not run automatically. Native Windows Edge/Electron installation and a signed-in live ChatGPT session were not certified here.

The full Emulator command workflow, full Playwright command routing, Live Cloud, Both Verification Only and Both Full Live Suite routing were explicitly tested with controlled CLI/Hub/application fixtures. Connected tests execute real local operator/test processes, held simulated assistant replies, handoff/source ZIPs, repair overlays and local delta/recheck phases. Live requests are simulated: no paid Firebase calls were required. These results certify Yardmaster orchestration, not the separately implemented real 86 Chaos SDK bridge or real cloud services.

## Interface and testing

FIREBASE_EMULATOR_INTERFACE.md contains the exact yardmaster.firebase.json manifest, readiness JSON, script contract, all environment variables, project identities, loopback ports and lifecycle requirements. The separate 86 Chaos bridge must honor them; missing readiness blocks emulator testing.

Run npm run test:firebase:repair (scoped Node plus desktop/Android Playwright). On Windows use scripts/Test-Local-Yardmaster.ps1 -ExpectedCommit <delivered source commit> -ExpectedVersion 0.1.103 -FirebaseOnly. The delivered single PowerShell command finds or creates the Yardmaster repository, preserves local edits, fetches the exact testing commit, installs dependencies and starts these checks.

Publication: one atomic testing website candidate; no production deployment or production ref updates. Final deployment identity/status is reported with delivery. The candidate remains unverified for full-store certification and does not trigger an automatic self-heal installation.
