# 86 Chaos Marketing Website

Static multi-page marketing site for **86 Chaos**, a Kitchen Management OS for independent restaurants, bars, and kitchens.

## Structure

- Plain HTML, CSS, and JavaScript
- No frontend framework or build step
- Vercel API route for the Founder Beta application form
- Current brand assets in `assets/`

## Public pages

- `index.html` — home page
- `about.html` — founder story
- `features.html` — feature map and tier comparison
- `86voice.html` — voice/text workflow page
- `ai-tools.html` — AI + ordering intelligence
- `how-it-works.html` — rollout explanation
- `product-tour.html` — app screen tour
- `pricing.html` — pricing, app comparison, cost comparison, and tier comparison
- `faq.html` — public questions and objections
- `beta.html` — Founder Beta application
- `legal.html` — concise beta terms and privacy essentials
- `all-features.html` — redirect to `features.html`
- `ai-ordering.html` — redirect to `ai-tools.html`

## Founder Beta offer shown on the site

- 90 days free
- No credit card required
- No purchase required
- Free setup during beta
- Beta restaurants help shape the product
- First access to new features where the selected plan allows
- 50% off the first location for the first paid year

## Pricing alignment

All plans include unlimited staff users for normal restaurant use.

- Shift: $49/month per location. Founder year one: $24.50/month. Includes Schedule Builder, but not Time Clock.
- Operations: $99/month per location. Founder year one: $49.50/month. Includes Time Clock, request off/availability, labor/tips, Daily Close, sales breakdown, and basic reports.
- Smart Kitchen: $179/month per location. Founder year one: $89.50/month. Main AI/food-cost/ordering intelligence plan.
- Owner Pro: $299/month for the first location. Founder year one: $149.50/month for the first location. Additional Owner Pro locations are $129/month each and are not discounted.

QuickBooks language must stay review-first during Founder Beta. The site should not imply automatic live posting to QuickBooks.

## Beta application email

The form posts to `/api/beta-application` and uses these Vercel environment variables:

```txt
RESEND_API_KEY=your_resend_api_key
BETA_TO_EMAIL=your_destination_email
BETA_FROM_EMAIL=86 Chaos Founder Beta <onboarding@your-verified-domain.com>
```

Do not commit real keys. `BETA_FROM_EMAIL` must use a domain verified with the email provider.

## Deploy checklist

1. Commit the full folder to the website repository.
2. Confirm the Vercel project points to that repository.
3. Add the beta form environment variables.
4. Redeploy.
5. Test navigation, mobile layout, redirects, pricing cards, comparison charts, and the beta form.

## v89 update

- Cleaned stale version/cache references and updated CSS/JS cache busting to `v=89`.
- Added canonical links, Open Graph URLs, `robots.txt`, and `sitemap.xml`.
- Replaced the beta form's public configuration error with a customer-friendly temporary-unavailable message.
- Removed inactive legacy comparison-table JavaScript while keeping the active poster-matrix comparison behavior.
- Added a clearer home page beta reality section showing what has been used in real workflows versus what is in controlled Founder Beta testing.
- Improved Owner Pro pricing-card readability and clarified that additional locations are $129/month each and not discounted.
- Removed confirmed unused old assets.
