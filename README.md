# 86 Chaos Marketing Website

Astro-based marketing website for 86chaos.com.

## Current build

v94 visitor analytics.

## What changed in v93

- Kept the Astro structure from v90.
- Scaled back the v91 polish so the page feels cleaner and less oversized.
- Reduced hero type, hero preview frame, nav, buttons, cards, pricing cards, section spacing, and mobile visual weight.
- Kept the polished dark/copper 86 Chaos brand without the bloated sizing.
- Preserved the current poster-style comparison matrices and tier/pricing content.

## Local commands

Use `npm.cmd` in PowerShell if regular `npm` is blocked by execution policy:

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run build
```

## Do not upload

Do not upload these folders to GitHub:

- `node_modules/`
- `dist/`
- `.astro/`
- `.vercel/`



## v93 beta reality copy cleanup
- Updated the home page Current beta reality section so it reflects broader real-world testing without overstating Founder Beta tools.
- Kept advanced owner/back-office tools described as controlled Founder Beta testing.
- Updated cache-busting query strings to v93.

## v94 visitor analytics

- Added Vercel Web Analytics support through `@vercel/analytics/astro`.
- Page visits can be viewed in the Vercel project dashboard after Web Analytics is enabled.
- Updated the public legal/privacy page with plain-English website analytics wording.
- Updated cache-busting query strings to v94.

### Important analytics note

This code adds the analytics script, but Vercel Web Analytics still has to be enabled for the deployed project in the Vercel dashboard.
