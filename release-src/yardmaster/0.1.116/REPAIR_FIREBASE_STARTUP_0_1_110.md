# Yardmaster 0.1.110: Windows emulator readiness

86 Chaos 17.0.57 supplies the required emulator bridge. Yardmaster 0.1.109 still generates an absolute Windows Functions source in its external session configuration. The official Firebase CLI joins that source to the configuration directory, producing an invalid double-drive path and preventing Functions definitions from loading. Separately, local React compilation can exceed the previous two-minute startup deadline.

The repair writes Functions sources relative to the session configuration directory while preserving rules, indexes, runtime and codebase settings. Repositories on another Windows drive use a session-local directory junction. No repository configuration is rewritten. The startup deadline becomes five minutes; explicit caller deadlines, cancellation, process cleanup, readiness verification and the prohibition on automatic live fallback remain intact.

## Focused coverage

- Four Node regressions cover Windows paths with spaces, cross-drive codebases, the bounded startup deadline and generated configuration from a managed process session.
- The desktop and Android Playwright regression starts an emulator-only delta fixture through the operator UI, checks the generated Functions path and verifies completion without a live fallback or tracked repository changes.
- `npm run test:firebase:startup:repair` runs only these regressions. They are also registered in the existing Play Store/feature coverage inventory.

## Real startup validation

The patched Yardmaster session launched the official Firebase CLI against 86 Chaos testing commit `e7ca52088e582ba1343eba58e8613c6307f645ce` (17.0.57). Functions definitions loaded from the correct directory. Auth, Firestore, Functions, Database and Storage were acknowledged by the local app on `demo-86chaos`, with `blockLiveFirebase: true`, after 120,582 milliseconds. Owned services were stopped after the check.

This validation started services and checked SDK readiness only. It did not run the full Play Store/release gate or contact live Firebase. No production deployment was performed.
