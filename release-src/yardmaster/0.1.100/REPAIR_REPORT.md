# Yardmaster 0.1.100 testing repair

The supplied 0.1.99 handoff contained nine passing Node tests and four failures among nine targeted Playwright executions. Desktop and Android lost a command result at the second exchange because the fixture's rendered assistant text collapsed protocol line breaks. Both iPhone UI cases inherited the Windows Edge channel, which WebKit rejects before launch.

Assistant extraction now preserves raw line boundaries when they contain a complete Yardmaster command block. The exact second command reply executes once before opening a fresh chat, and its result is included with the recent conversation, selected mode/model/effort and handoff artifact. ZIP collection still takes priority over rollover. The original browser assertions for the command result and single execution remain in place.

The Windows Edge channel now belongs only to the desktop Playwright project. Android uses Chromium and iPhone uses WebKit without an inherited Edge channel.

The PC dashboard, local phone dashboard and hosted mobile PWA now use a full model dropdown instead of a datalist filtered by the currently selected model. Work and Chat expose GPT-6.1 Sol, GPT-6 Sol, GPT-6 Astra, GPT-6 Luna, GPT-5.6 Sol, GPT-5.6 Terra and GPT-5.6 Luna. Saved account-specific names remain selectable. Status refresh preserves a focused choice; config changes persist through the existing API. ChatGPT availability is still verified in the signed-in account during a handoff.

The 0.1.99 updater repair is retained: a public testing feed, pinned archive checksum, durable failure evidence, canary checks and rollback. The test update target is 0.1.101 so it remains newer than this candidate.

Validation: source syntax and feature coverage passed; 15 exact Node loop/updater/model regressions passed, 22 static/control-parity contracts passed, 14 ChatGPT selection tests passed, 20 trusted-send/protocol tests passed. Three request-only Playwright process tests passed across desktop, Android and iPhone projects. Twelve targeted browser executions are included but remain pending: browser downloads in this workspace are invalid/truncated archives. Native Windows installation and a live signed-in ChatGPT loop also remain pending. The full Play Store/release gate was not run.

Run scripts/Test-Local-Yardmaster.ps1 -ExpectedCommit <delivered SHA> -ExpectedVersion 0.1.100 -LoopUpdateOnly. It installs the required browsers and runs only the scoped Node and desktop/Android/iPhone Playwright regressions. To activate the build, use Update Yardmaster Now in 0.1.99, or extract the complete application ZIP and run Yardmaster-Installer.cmd. Pulling and testing alone does not replace the installed app.
