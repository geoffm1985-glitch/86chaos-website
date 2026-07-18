# 86 Chaos Landing Website

This is a compact, multi-page static/Vercel website for 86 Chaos using the user's actual logo files and actual uploaded app screenshots. The generic generated dashboard artwork has been removed.

## Pages

- `index.html` — compact home page
- `features.html` — feature overview
- `how-it-works.html` — workflow explanation
- `screenshots.html` — interactive real app screenshot demo buttons
- `pricing.html` — Founder Beta pricing, annual billing, referral credit, loyalty option
- `faq.html` — quick beta questions
- `beta.html` — beta application form

## Email form

The beta form posts to:

```txt
/api/beta-application
```

The API route sends through Resend. Do **not** hardcode private API keys into public GitHub code. Add these environment variables in Vercel instead:

```txt
RESEND_API_KEY=your_resend_api_key
BETA_TO_EMAIL=your_destination_email
BETA_FROM_EMAIL=86 Chaos Founder Beta <onboarding@your-verified-domain.com>
```

`BETA_FROM_EMAIL` should use a domain verified in Resend. During quick testing, Resend may allow `onboarding@resend.dev`, depending on your account restrictions.

## Deploy through GitHub + Vercel

1. Unzip this folder.
2. Upload/commit the files to your GitHub website repo.
3. In Vercel, import the repo or let your existing Vercel project redeploy.
4. Add the env vars above in Vercel Project Settings → Environment Variables.
5. Redeploy after adding env vars.
6. Test the beta form from the live Vercel URL.

## Notes

- The screenshot selector works with plain JavaScript in `script.js`.
- Screenshots were cropped/cleaned for public marketing so they read like active restaurant workflows and do not show the preview mic badge.
- Pricing and beta language should be reviewed before launch.
