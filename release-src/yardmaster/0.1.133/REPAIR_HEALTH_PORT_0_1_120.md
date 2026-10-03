Yardmaster 0.1.120 precision repair

The freshly restarted real PC loop passed environment and dependency preflight but was blocked at source inventory by a database availability probe. The database log had no crash before Yardmaster initiated teardown; the socket probe allowed only 300ms on this loaded PC. Align the bounded local socket probe with the existing 10-second HTTP readiness deadline. Connection refusal still fails immediately; a hung connection still times out; three consecutive failed health checks still block tests with no live fallback.

Validation: only the three new socket regressions and the affected desktop/Android slow-health closed-loop regressions. No full Yardmaster or Play Store suite rerun. Live PC preflight and actual test start are verified separately through Yardmaster.
