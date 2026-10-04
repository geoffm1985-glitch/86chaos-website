# Yardmaster 0.1.116 precision repair

- Show and focus the persistent ChatGPT dock before trusted input; retain layout recovery for disconnected Windows displays.
- Match Chat/Work controls by word boundaries so generic ChatGPT mode switchers cannot shadow them. Include the last control diagnostic when manual selection fails.
- Keep Firebase CLI temporary Storage blobs in its own runtime directory, isolated from test cleanup. Authentication, pairing credentials, and emulator-only policy are retained.

Focused verification: 9 Node checks passed (4 dock bridge, 1 Storage isolation, 1 new mode regression, 2 affected selector checks, 1 production-feed check); 7 Playwright checks passed (manual draft/reload, ZIP and wrapped prompt submitted once in real Electron, affected hidden dock upload/reload, desktop and Android Storage isolation and production-update guards). Live signed-in manual opening passed on the PC. Syntax and feature coverage checks passed. Full Yardmaster and 86 Chaos suites were not run by Codex.
