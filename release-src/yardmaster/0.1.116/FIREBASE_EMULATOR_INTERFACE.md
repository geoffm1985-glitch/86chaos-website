# Yardmaster → 86 Chaos Firebase interface (schema 1)

Yardmaster owns selection, processes, readiness, inheritance, cleanup and phase
ordering. 86 Chaos owns Firebase SDK connections, test seeding, eligible tests,
its local application and the bounded genuine-cloud verification script.
No 86 Chaos source is changed by this Yardmaster build.

New/unset Yardmaster installations select **Emulator**. Preferences persist in
the operator's local config. Each workflow pins `mode` and `livePhase` in its
saved workflow and pause/self-heal checkpoints. Changing preferences affects the
next new run. Retry, repair, command handoff and resume keep the saved target.

## Required 86 Chaos bridge

Place `yardmaster.firebase.json` at the 86 Chaos repository root:

```json
{
  "schema": 1,
  "projectId": "demo-86chaos",
  "firebaseConfig": "firebase.json",
  "products": ["firestore", "auth", "database", "storage", "functions"],
  "localApp": {
    "startScript": "dev:emulator",
    "url": "http://127.0.0.1:5173",
    "readyPath": "/api/firebase-target"
  },
  "scripts": {
    "full": "test:play-store",
    "delta": "test:play-store:delta",
    "playwright": "test:playwright",
    "targeted": "test:current-release-targeted",
    "liveVerification": "test:firebase:live-verification"
  }
}
```

Use the real repository's existing npm scripts. The example names do not create
those scripts. Omit Functions only when it is not used. Include every applicable
Firebase product; missing configured products block startup. Auth and Firestore
are required. The existing firebase.json must contain applicable rules, indexes
and Functions source configuration. Yardmaster keeps these paths and uses a
temporary configuration with absolute paths and loopback endpoints.

`localApp.startScript` must start the app for emulator testing, honor the
environment below and reload repaired source. `localApp.url` must be HTTP on
loopback. The readiness endpoint must return **the actual connected SDK target**,
only after all required connections and the app's browser egress guard are ready:

```json
{
  "target": "emulator",
  "projectId": "demo-86chaos",
  "blockLiveFirebase": true,
  "products": ["firestore", "auth", "database", "storage", "functions"]
}
```

Do not return a constant acknowledgment or expose credentials. The 86 Chaos
bridge must connect the Firebase Web SDK to these endpoints before any SDK use,
enforce the demo project and reject live Firebase destinations in every browser
context, including any browser not launched through Playwright. Yardmaster also
preloads a Node/Playwright loopback network guard in emulator test descendants.
The original full scripts must keep the complete eligible inventory and honor
the supplied target/base URL; do not replace them with reduced dummy scripts.
Security rules and test data seeding remain real Emulator Suite operations.

If this bridge is absent, invalid, unready or loses an emulator, Yardmaster blocks
the phase and displays the reason. It never substitutes chaos-test-d1601.

## Process environment

| Variable | Emulator | Live Cloud |
|---|---|---|
| `YARDMASTER_FIREBASE_MODE` | `emulator` or `both` | `live` or `both` |
| `YARDMASTER_FIREBASE_TARGET` | `emulator` | `live` |
| `CHAOS_FIREBASE_TARGET`, `VITE_FIREBASE_TARGET`, `FIREBASE_TEST_TARGET` | `emulator` | `live` |
| `GCLOUD_PROJECT`, `GOOGLE_CLOUD_PROJECT`, `FIREBASE_PROJECT_ID`, `VITE_FIREBASE_PROJECT_ID`, `CHAOS_FIREBASE_PROJECT_ID`, `YARDMASTER_FIREBASE_PROJECT` | bridge's `demo-*` ID | `chaos-test-d1601` |
| `FIREBASE_CONFIG` | JSON with demo project identity | JSON with test project identity |
| `FIRESTORE_EMULATOR_HOST` | `127.0.0.1:8080` by default | unset |
| `FIREBASE_AUTH_EMULATOR_HOST` | `127.0.0.1:9099` | unset |
| `FIREBASE_DATABASE_EMULATOR_HOST` | `127.0.0.1:9000` | unset |
| `FIREBASE_STORAGE_EMULATOR_HOST`, `CLOUD_STORAGE_EMULATOR_HOST` | `127.0.0.1:9199` | unset |
| `FIREBASE_FUNCTIONS_EMULATOR_HOST` | `127.0.0.1:5001` | unset |
| `FIREBASE_EMULATOR_HUB` | `127.0.0.1:4400` | unset |
| `CHAOS_FIREBASE_EMULATORS_JSON`, `VITE_FIREBASE_EMULATORS_JSON` | JSON of configured `{host,port}` endpoints | unset |
| `CHAOS_BLOCK_LIVE_FIREBASE` | `1` | unset |
| `PLAYWRIGHT_BASE_URL`, `BASE_URL`, `TEST_BASE_URL`, `RELEASE_GATE_BASE_URL`, `CHAOS_TEST_BASE_URL` | bridge's local app URL | Yardmaster's existing testing URL |
| `YARDMASTER_FIREBASE_TELEMETRY_FILE` | local report file | local report file |

Ports come from the target repository's firebase.json, with the defaults above.
The project ID must agree across the CLI, app and all test processes. Yardmaster
removes inherited live credentials/API keys from emulator children and supplies
demo Web SDK identifiers. Live mode uses the existing test configuration; its
bridge/scripts must honor the explicit chaos-test-d1601 identity.

The genuine-cloud verification script may write the following JSON to the
telemetry file after observing its actual requests:

```json
{"liveFirebaseContacted": true}
```

If it does not report this, Yardmaster records live contact as **unknown**. A
launched live process is not evidence of actual Firebase requests or billing.
Local telemetry records phase counts, live-verification attempts, phase elapsed
times, emulator session elapsed time, target and fallback policy. It does not
claim dollar amounts and uses no Cloud Billing API.

## Lifecycle and Both behavior

Install the official Firebase CLI (`npm install --global firebase-tools`) and
the Java JDK required by that CLI's Firestore/Database/Storage emulators once.
Yardmaster detects the CLI in the 86 Chaos repository, its own installation or
PATH and starts `firebase emulators:start --project demo-86chaos --only ...`.
It launches the local app itself, checks every required Hub endpoint/port and
the app acknowledgment, then starts the unchanged full/delta/Playwright command.
CLI debug logs and exported emulator data are kept outside the Git worktree.
Occupied ports block startup rather than adopting an unknown external session.

The same session stays alive across a closed loop's failures, held assistant
replies, repairs and delta checks. Pause retains it. Graceful shutdown exports
data; a resumed session imports that data when available. An IPC watchdog kills
owned process trees if the operator crashes. Abrupt crashes may require test
seeding again; the saved Firebase mode and phase remain available. Resume blocks
if it cannot reestablish the required emulator session.

Both always starts with a complete emulator run. Verification Only calls the
bridge's bounded `liveVerification` script; a missing script blocks that phase.
It never substitutes the full suite. Full Live Suite deliberately calls the
complete live script after local success. A live failure marks local repair as
required; handoff → repair → emulator delta → one selected live recheck follows.
Emulator and Both complete their test/repair workflow after their selected
phases pass, without automatically pushing intermediate repairs or repeatedly
deploying. Live Cloud preserves the existing push/deployment workflow.
Manually adopted external emulator/Both runs are blocked because Yardmaster
cannot prove their target; start those phases through Yardmaster.

## Verification limits

`npm run test:firebase:repair` runs scoped Play Store/Node and desktop/Android
Playwright regressions, including full-command routing and connected assistant
handoff/repair loops. Controlled CLI/Hub/app fixtures require no Java, Firebase
login or paid cloud access. They test Yardmaster orchestration; they do not
certify the separate real 86 Chaos bridge or real Firebase services. The full
existing application release gate is still an explicit `test:play-store` run.
Yardmaster's iPhone/WebKit projects and device-specific cases are removed.
86 Chaos's iPhone/iOS requirements remain in its implementation handoffs.

Official reference: https://firebase.google.com/docs/emulator-suite/install_and_configure
and https://firebase.google.com/docs/emulator-suite/connect_auth
