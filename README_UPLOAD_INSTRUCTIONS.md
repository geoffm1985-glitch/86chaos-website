# 86 Chaos Marketing Site v4

This version is the professional desktop/mobile polish pass.

## Changes
- Smaller, cleaner desktop hero.
- Professional max-width layout so the page no longer feels huge on PC.
- More compact scrolling.
- Feature and price comparison chart instead of oversized comparison cards.
- Updated proof cards with the most dramatic owner-facing facts.
- Added copyright footer: © 2026 Chilton App Works.
- Keeps actual 86 Chaos logo, app icon, and Wisconsin/map brand image.
- Keeps Vercel/Resend beta form to send applications to geoffrey@86chaos.com.

## Upload
Copy everything in this ZIP to your website repo root:

- index.html
- styles.css
- script.js
- package.json
- api/
- assets/

Then commit and push:

```bash
git add .
git commit -m "Polish 86 Chaos marketing site desktop layout and comparison chart"
git push
```

## Vercel environment variables

```text
RESEND_API_KEY=your_resend_api_key_here
BETA_TO_EMAIL=geoffrey@86chaos.com
BETA_FROM_EMAIL=86 Chaos <beta@86chaos.com>
```

## Notes
The comparison table uses public pricing/source links. Review the links before final launch and update if vendors change pricing.
