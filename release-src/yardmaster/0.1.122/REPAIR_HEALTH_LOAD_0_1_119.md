# Yardmaster 0.1.119 precision health repair

The live release gate passed environment/dependency preflight but its healthy emulator session was killed by three 1.2-second HTTP probe timeouts under Windows load. Allow ten seconds for local readiness responses, include the failing local endpoint in timeout diagnostics, and retain three-consecutive-failure blocking plus immediate owned-child-exit handling. Invalid target/project/no-live acknowledgments still fail closed.

Focused checks only: real slow local HTTP response, bounded timeout/HTTP failure, and desktop/Android closed-loop execution with a slow healthy emulator hub. The earlier 0.1.118 Windows npm preflight repair remains included. No full suites run directly by Codex.
