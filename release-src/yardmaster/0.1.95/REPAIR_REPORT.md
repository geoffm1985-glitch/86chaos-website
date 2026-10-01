# Yardmaster 0.1.95 desktop ChatGPT dock reconnect repair

Evidence: the supplied Android notification reports composer unavailable in the automation Yardmaster Edge profile. This proves that the handoff selected the separate fallback profile. The code made that selection immediately after a failed initial dock probe, even when an already-running fallback profile existed. The screenshot does not establish why the initial dock connection failed; no actual Windows diagnostic is available for that specific probe.

Repair: desktop.cjs now explicitly tells its operator that the Electron ChatGPT dock is required on localhost 9224. Automatic handoffs wait and reconnect to that dock for up to 25 seconds, retaining its existing persistent session. They do not select or spawn a separate Edge fallback profile. An unrecoverable dock error names the correct dock, retains the original failure ZIP and diagnostic, and instructs Reload then Resume Handoff; the server avoids recursive self-heal through the same unavailable connection. Standalone-server fallback and manual-open behavior remain available.

Discovery now accepts document targets labelled page, other or webview, excludes workers and unrelated origins, and verifies the actual connected page origin. A blocked optional sessionStorage marker cannot make an otherwise usable ChatGPT document look unavailable. These discovery cases are covered as robustness guards; their occurrence on the user's PC is not claimed.

Validation: seven new Node tests pass for delayed dock availability, permanent unavailability without hidden Edge, inherited desktop environment, standalone fallback, alternate document types/storage failure, origin/worker exclusions, and preserved handoff retry. Nine related sign-in/empty-composer Node tests also pass (16 total). Syntax/dual-coverage inventory passed. Two new desktop Playwright tests exercise the real DOM/CDP document adapter and restricted storage. Browser execution remains local because Chromium is absent and downloads were unavailable in this environment. No full release gate, iPhone suite or production promotion is performed.

Targeted local command: scripts/Test-Local-Yardmaster.ps1 -ExpectedCommit <delivered SHA> -ExpectedVersion 0.1.95 -ChatGPTDockOnly. Runs only the seven new Node and two new desktop Playwright tests, with live status, elapsed time, final PASS/FAIL and an exported current failure ZIP on failure.

Important installation step: the running desktop must be updated and restarted to inherit the dock requirement. Pulling and testing the repo alone does not update a separately installed desktop. After installing this build, open its ChatGPT tab and choose Reload if necessary, then Resume Handoff on the existing failed run.

One testing candidate/version and one testing website deployment. Production remains at its previously approved version until this candidate is accepted.
