# Yardmaster 0.1.88 diagnostic repair

Source: Yardmaster 0.1.87 at 704519976d722e970af213c9cde75040e860c033 and the supplied NODE-TESTS diagnostic dated 2026-10-01T00:40:45Z.

The user's Windows run completed 137 Node tests: 135 passed, 2 failed, 0 skipped. Playwright execution was not reached.

Failure 1: the feature registry description omitted the literal test:playwright:full name expected by the policy test. Restore that reference while retaining the full inventory runner.

Failure 2: the disposable Windows heartbeat fixture had produced fewer than two bytes after a fixed 500 ms startup wait. The test failed before calling Suspend. Replace fixed startup and post-resume waits with bounded polling for real heartbeat output; keep the existing freeze-growth assertion. Cleanup now waits for child exit and retries file removal on Windows.

Added Node and Playwright regressions for delayed startup and an explicit readiness timeout. The original native Windows pause/resume test remains enabled on Windows. No production pause/resume behavior was changed.

Full Play Store and Windows Edge certification must be run locally with the delivered command. This container cannot certify native Windows process suspension.

Validation: source checks and coverage inventory passed. Targeted Node run: 48 passed, 0 failed, 1 native Windows-only skip. Targeted Playwright regression run: 3 passed, 0 failed. Full discovery: 60 tests across 9 specs. Full certification was not run automatically.
