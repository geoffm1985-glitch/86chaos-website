# Yardmaster 0.1.87 repair and coverage audit

- Source: supplied 0.1.86 app and Windows diagnostic; testing branch baseline 1f715d61bbdad9ec0cc8ab060aceb2776ef4bc9e.
- Actual failure: Playwright discovered zero tests because the control-parity spec had an invalid escaped regular expression.
- Repair: load the real dashboard HTML/CSS/JS at a fixture origin; match multiline continuous routes; use visible navigation selectors and locator actionability retries on periodically rebuilt cards.
- Notification failure: /yardmaster/sw.js was registered with scope /yardmaster, outside the default maximum /yardmaster/. The website now returns Service-Worker-Allowed: /yardmaster, preserving the canonical slashless page and allowing serviceWorker.ready to resolve.
- Coverage: 54 feature entries have both Node/Play Store and Playwright file references. The coverage lock matches every current API action (37), route (19), dashboard action (19), and accepted configuration key (24), including the two continuous-loop keys. All 9 Playwright specs parse and 58 tests are discoverable.
- Testing website packaging now uses its pinned testing marker, packages the 0.1.87 source, preserves candidate verification status, and points both download routes at the same testing ZIP.
- Added locally runnable worker registration regressions for /yardmaster and /yardmaster/ at Android and iPhone viewport/user-agent settings. Device push subscription APIs remain exercised by the isolated operator fixtures.

Validation: npm run check passed. 37 targeted Node tests passed, 0 failed, 0 skipped. Playwright --list passed. Astro compiled the modified mobile page. Browser launch was blocked by the container (Unix socket Operation not permitted); no browser-runtime pass is claimed. The full Play Store/Windows Edge suite was not run automatically. Run the delivered PowerShell command locally for complete certification. iPhone profiles here emulate Safari layout; they do not certify a physical iPhone or APNs delivery.

Coverage mappings verify registered test coverage, not a guarantee of absence of defects. Windows installer, Edge, dock and OS integrations require the local Windows suite.
