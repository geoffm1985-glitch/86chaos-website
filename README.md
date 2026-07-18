# 86 Chaos Landing Site

A GitHub/Vercel-ready landing page for 86 Chaos using the brand assets and real app screenshots you supplied.

## What's included

- `index.html` — landing page with hero, app screenshots, feature sections, Founder Beta pricing, referral offer, FAQ, and application form.
- `styles.css` — responsive dark/copper design.
- `script.js` — mobile menu, screenshot switcher, reveal animations, and built-in beta form submission.
- `api/beta-application.js` — Vercel serverless function that emails Founder Beta applications.
- `assets/` — optimized logo and app screenshot assets.
- `package.json` / `vercel.json` — ready for Vercel deployment from GitHub.

## How the email form works

The form posts to:

```txt
/api/beta-application
```

That API route sends an email using Resend. This keeps the form built into your website instead of using a placeholder Formspree URL.

## Vercel environment variables needed

In Vercel, open the project and go to **Settings → Environment Variables**. Add these:

```txt
RESEND_API_KEY=your_resend_api_key
BETA_TO_EMAIL=where_you_want_beta_requests_sent@example.com
BETA_FROM_EMAIL=86 Chaos <hello@your-verified-domain.com>
```

`BETA_FROM_EMAIL` must be a sender/domain that Resend allows. If you do not set it, the route uses `86 Chaos Beta <onboarding@resend.dev>`, which is only good for quick testing in some Resend accounts.

## How to upload to GitHub and deploy

1. Create or open your website repository on GitHub.
2. Upload all files and folders from this ZIP to the repository root.
3. Connect the repo to Vercel or redeploy your existing Vercel project.
4. Add the environment variables above in Vercel.
5. Submit a test beta request from the live site.

## Founder Beta / pricing content included

- 90 days free
- No credit card required
- 50% off first paid year
- Annual plans available: get 2 months free
- Referral program: both restaurants receive a $100 account credit after a successful paid referral
- Founder loyalty: active beta restaurants with 2 successful paid referrals may qualify for 25% off year two
- Planned tiers:
  - Shift — $49/month per location
  - Operations — $99/month per location
  - Smart Kitchen — $179/month per location
  - Owner Pro — $299/month per location

## Notes

This is a static frontend with one Vercel API route. GitHub Pages alone cannot send email from a form because it does not run backend code. Deploy through Vercel for the built-in email form to work.
