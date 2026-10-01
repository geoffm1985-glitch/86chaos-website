# Yardmaster 0.1.87 Testing Candidate

Repairs the invalid regular expression that stopped Playwright discovery before any tests ran. The control-parity fixture now serves the real HTML, stylesheet, and JavaScript from a stable origin, and multiline loop routes are matched correctly. Desktop layout fixtures select the visible navigation controls.

The website service worker response explicitly allows the canonical /yardmaster scope with Service-Worker-Allowed: /yardmaster. Exact website worker, registration script, and response-header fixtures are included for local Node and Playwright regression tests at both /yardmaster and /yardmaster/, including Android and iPhone layouts.

The dual-suite inventory now includes continuous-loop configuration, parses every Playwright spec before certification, and records core operational features alongside the existing feature catalog. Both full Playwright commands discover the entire suite.

Full Windows Play Store/Playwright certification remains a local user-run check. Targeted checks and discovery are recorded in REPAIR_REPORT.md. No production deployment is authorized for this candidate.
