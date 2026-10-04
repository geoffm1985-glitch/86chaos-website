# Yardmaster 0.1.123

For ChatGPT connection interruptions, make up to five automatic recovery attempts before requesting help. When Retry is available, use it on attempts one and three; refresh the same conversation and submit `please finish` on attempts two, four and five. If Retry is unavailable, use refresh-and-finish instead. Pause 30 seconds between attempts. A failed refresh or send is recorded and retried, including when the error page disappears during a failed refresh. Keep the failure report and existing conversation; do not duplicate the original ZIP upload.

Focused checks: four Node release-gate tests passed. Six Playwright checks passed across desktop and Android, including real Chromium reload, confirmed trusted prompt submission, trusted Retry and quoted-error isolation. No full Yardmaster suite was run.

Install through the queued-update mechanism while the ongoing 86 Chaos retest runs.
