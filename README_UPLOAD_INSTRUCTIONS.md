# 86 Chaos Marketing Site v3

Changes:
- Smaller hero/header text.
- Shorter page.
- Added cited fact cards.
- Added price-context comparison section.
- Keeps your actual logo, app icon, and Wisconsin/map brand image.
- Keeps the Vercel/Resend beta form that sends to geoffrey@86chaos.com.

## Files to upload

Upload everything in this ZIP to your website repo root:

- `index.html`
- `styles.css`
- `script.js`
- `package.json`
- `api/apply.js`
- `assets/`

## Form email setup

Add these environment variables in Vercel:

```text
RESEND_API_KEY=your_resend_api_key_here
BETA_TO_EMAIL=geoffrey@86chaos.com
BETA_FROM_EMAIL=86 Chaos <beta@86chaos.com>
```

`BETA_FROM_EMAIL` requires that your sending domain/address is verified in Resend.

## Source notes included on page

- National Restaurant Association: restaurant margin / food and labor cost shares.
- National Restaurant Association: recruitment and retention challenge.
- 7shifts: average BOH replacement cost and pricing.
- MarginEdge: public monthly/location pricing.
- Restaurant365: published cost comparison.

Review these links before public launch and update the claims if any vendor changes pricing.
