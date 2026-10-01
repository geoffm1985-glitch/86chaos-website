# Yardmaster 0.1.88 Testing Candidate

Repairs exactly the two failures in the supplied 0.1.87 Windows diagnostic:

- Restore the explicit test:playwright:full reference required by the existing coverage policy test. The delivered Play Store command still discovers all Node and Playwright tests.
- Wait for observed heartbeat readiness before testing Windows process suspension; wait for observed heartbeat growth after resuming. Replace fixed startup/resume sleeps without weakening the freeze assertion. Wait for child exit before removing fixture files.

Node and Playwright regressions exercise delayed heartbeat startup and a missing-heartbeat timeout. The existing Windows native process suspension test remains required on Windows.

Testing only. Full local certification is user-run; no production release is authorized.
