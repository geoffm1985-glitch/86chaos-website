# Yardmaster 0.1.126 source handoff repair

The saved release-gate slim ZIP contained reports and no application source. ChatGPT consequently requested source packaging and then a browser attachment helper. Packaging eventually succeeded, but the helper lost JavaScript template quotes in rendered Markdown and attempted browser ports that the docked desktop uses no public attachment transport for.

Repair handoffs now use the existing credential-excluding New-Handoff builder to include current application source, the exact saved failure ZIP and the repair prompt in one archive. Saved reports-only handoffs upgrade on resume without discarding the original report or restarting tests. Existing source archive artifacts are excluded from the application folder to prevent nesting old handoffs. The same complete archive follows ChatGPT continuation turns.

Assistant extraction prefers a complete protocol in a pre/code block, retaining literal PowerShell environment variables and JavaScript template quotes and excluding copy-button labels. The repair prompt requires one fenced protocol and explains that source is already attached, avoiding browser attachment helper commands.

Validation: 3 new focused Node regressions and 1 affected assistant-extraction regression passed. 2 new Playwright regressions passed, including real Windows packaging and actual browser code-block extraction. No 86 Chaos source was changed or its full/Play Store tests run independently. Real handset behavior was not exercised.
