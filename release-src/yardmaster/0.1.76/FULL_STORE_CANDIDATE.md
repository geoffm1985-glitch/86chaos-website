# Yardmaster 0.1.76 Production Candidate

This release promotes the newer 0.1.74 testing line plus the Windows recovery repairs and the final full-dashboard Playwright correction.

## Exact repaired failures

- Full dashboard Playwright no longer expects repository, queue, and ChatGPT controls to remain visible while the Settings panel is active. Each control is asserted in its actual panel.
- Transient Windows clipboard ownership no longer immediately aborts the ChatGPT-originated PowerShell round trip.
- True Pause/Resume no longer reuses PowerShell's read-only automatic $PID variable.
- ChatGPT handoff prompt entry uses verified chunked trusted input with retries and a character fallback.
- Docked ChatGPT coverage checks the real `purpose:'docked-'+purpose` implementation.
- The Windows adopted-run fixture waits for the disposable child process to actually stop before asserting the next Yardmaster state.

## Coverage

- Play Store / Node regression: `test/static-contracts.test.mjs`, `test/resumable-pause-docked-chatgpt.test.mjs`, `test/operator.integration.test.mjs`
- Playwright regression: `test/playwright/full-app.e2e.spec.mjs`, `test/playwright/resumable-pause-docked-chatgpt.e2e.spec.mjs`

The user-observed full Playwright run before this repair was 26 passed / 1 failed. The one failure was the stale panel-scoping assertion repaired here. The complete full suite was not automatically rerun after the repair.
