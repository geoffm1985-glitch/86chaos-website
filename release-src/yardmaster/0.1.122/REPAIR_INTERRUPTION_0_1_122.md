# Yardmaster 0.1.122

ChatGPT's visible connection-interrupted notice overrides its stale Stop button. Yardmaster retries that notice using trusted input, or refreshes the same conversation and asks it to finish. Recovery is bounded to three attempts with a cooldown; exhaustion preserves the report and asks for handoff recovery instead of recursively self-healing Yardmaster.

Automatic repairs show their current stage and explain that the test checks failed. Retests show the real test name. A queued app update no longer obscures active work in Live Status.

Focused verification: three Node release-gate regressions and six desktop/Android Playwright regressions passed. Affected existing status/update regressions are checked separately. Full suites were not rerun.
