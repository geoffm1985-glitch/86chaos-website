# Yardmaster 0.1.92 precise timing repair

Evidence: the attached Windows 0.1.91 handoff passed all 13 Node tests and eight of nine Playwright tests. Only the desktop working-version test failed: currentTest remained Starting… during its six-second assertion. The trace later recorded the expected 17.0.43+ fixture signal, proving that output startup was delayed. The working version itself was correct.

Repair: this desktop test now waits for the actual fixture test-start signal before opening/asserting the dashboard. The wait has a 45-second deadline and rejects a stopped/failed run. The Playwright regression deliberately delays fixture output by eight seconds, retaining the historical-name and actual-version assertions. Node regressions cover delayed output, terminated runs and missing-signal timeout. Product runtime behavior is unchanged.

Targeted command: scripts/Test-Local-Yardmaster.ps1 -ExpectedCommit <delivered SHA> -ExpectedVersion 0.1.92 -RunReadinessOnly. Seven related Node tests plus the single failed desktop Playwright test; no mobile/iPhone tests or full release gate. Linux headless Chromium validation is available here; the actual Windows/Edge rerun remains local.

Testing-only update, one version bump and one website deployment. No production publication.
