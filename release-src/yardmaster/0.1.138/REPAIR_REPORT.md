# Yardmaster 0.1.107 precision repair

Baseline: yardmaster-testing 181dbd763ba36c13022e5baf3d07ee90d13f05a6 (0.1.106).
Evidence: Yardmaster-Test-Handoff-20261001-210452.zip, Windows Node v24.18.0. All five selected Node cases failed; Playwright was not reached. The prior overlay-copy/process-ownership patch did not resolve the Windows failures.

## Changes

- Run the mandatory pre-repair repository snapshot in a worker thread, preserving its existing archive format and checks. Await Windows Apply-Repair.ps1 asynchronously. The operator can service health checks and Stop while Git/PowerShell/archive operations execute. Check cancellation before the overlay and before starting verification.
- Serialize periodic emulator health checks so they cannot overlap. Reset their failure count after recovery; block after three consecutive failures. Session reuse also revalidates with up to three bounded attempts after transient errors. Child-process exits still block immediately; no live fallback is introduced.
- Launch the watchdog independently and pass it the operator PID. In addition to IPC disconnect, poll owner existence every 250 ms. A dead operator triggers tree cleanup even while the IPC channel remains open. Normal shutdown disarms the fallback.
- Preserve terminal Firebase/workflow state, recent activity and child output in failing fixture diagnostics, including crash errors that repository cleanup previously masked with EBUSY. Reduce Windows fixture poll frequency to avoid excessive synchronous Git status work.
- Retain all five failed cases and add two focused lifecycle regressions with Node and desktop/Android Playwright coverage. Yardmaster still has no iPhone/WebKit test project.
- Bump the candidate once to 0.1.107; future-release fixtures move to 0.1.108.

## Reproduction and validation

- The previous watchdog failed a controlled owner-death test with a still-open IPC channel (owned process survived). The previous synchronous snapshot failed the event-loop responsiveness probe. Both defects were reproduced locally before final validation.
- Syntax and feature coverage: PASS (90 features).
- Scoped Node: 7 passed, 0 failed, 0 skipped on Linux Node 24.19.0.
- Scoped desktop/Android Playwright: 10 passed, 0 failed, 0 skipped on Linux.
- Native Windows robocopy, PowerShell and taskkill execution cannot be certified in this Linux environment. The handoff contains no intermediate operator state for the original timeouts; connecting those Windows failures to the reproduced defects remains an inference until the supplied native rerun.

No full gate, production push, website deployment or paid Firebase connection was performed. Process fixtures and simulated live verification are local only.

Scoped command: npm run test:firebase:windows:repair
