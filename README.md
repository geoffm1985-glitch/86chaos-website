# 86 Chaos Professional Website

Compact, multi-page website for 86 Chaos using the official uploaded logo assets and the cleaned, populated app screen images.

## Pages

- `index.html` — compact home page with stronger positioning and industry facts
- `features.html` — professional feature overview
- `how-it-works.html` — operating workflow
- `product-tour.html` — renamed from Screenshots; interactive app preview buttons
- `pricing.html` — Founder Beta pricing, annual billing, referral credit, loyalty option
- `faq.html` — beta and product questions
- `beta.html` — Founder Beta application form

## App preview images

The app preview images are in `assets/`:

- `schedule.webp`
- `prep.webp`
- `recipes.webp`
- `inventory.webp`
- `financials.webp`
- `maintenance.webp`

They are populated with realistic restaurant-style data and cleaned so they do not show phone status bars, phone navigation bars, or preview microphone badges.

## Email form

The beta form posts to:

```txt
/api/beta-application
```

The form now requires:

- Name
- Restaurant
- Restaurant address
- City and state
- Email
- Phone
- Best time to contact
- Biggest headache

The API route sends through Resend. Do **not** hardcode private API keys into public GitHub code. Add these environment variables in Vercel instead:

```txt
RESEND_API_KEY=your_resend_api_key
BETA_TO_EMAIL=your_destination_email
BETA_FROM_EMAIL=86 Chaos Founder Beta <onboarding@your-verified-domain.com>
```

`BETA_FROM_EMAIL` should use a domain verified in Resend. Redeploy after changing Vercel environment variables.

## Deploy through GitHub + Vercel

1. Unzip this folder.
2. Upload/commit the files to your GitHub website repo.
3. In Vercel, import the repo or let your existing Vercel project redeploy.
4. Add the env vars above in Vercel Project Settings → Environment Variables.
5. Redeploy.
6. Test the beta form from the live Vercel URL.

## Sources used in the website

Public industry facts are linked in-page:
- National Restaurant Association 2026 outlook
- ReFED Foodservice Food Waste by Sector fact sheet
- National Restaurant Association workforce technology research
- 7shifts restaurant turnover cost article

Review public claims before launch if vendor or industry data changes.


## Latest updates

- Top navigation link text was increased slightly while keeping the header thin.
- `pricing.html` now includes a pricing and feature comparison chart for 86 Chaos, 7shifts, MarginEdge, Restaurant365, and Toast POS.
- Home page now includes a week-one beta testing plan.
- Features page now clarifies what 86 Chaos is and is not.
- Beta page now explains what happens after a restaurant applies.

## Latest comparison rebuild

- Rebuilt the pricing comparison so it is no longer a giant ugly table.
- Moved the comparison section above the 86 Chaos pricing tier cards.
- Added compact product price cards plus a cleaner feature matrix.

## Latest pricing/font rebuild

- Replaced the comparison cards/matrix with one clear row-by-row comparison table.
- Price now appears in one obvious column instead of scattered across multiple places.
- Updated the site-wide font to Source Sans 3 with Source Serif 4 headings for a more professional look.

## Latest comparison/font rebuild

- Rebuilt the pricing comparison so prices are in one clear column.
- Repositioned the chart to make 86 Chaos the obvious best fit for daily independent kitchen operations.
- Updated the whole site to use Source Sans 3 with Source Serif 4 headings for a more professional feel.

## Latest comparison fix

- Restored the comparison chart to match the table structure from the uploaded website.
- Moved that restored comparison table above the 86 Chaos tier cards.
- Removed the experimental comparison card/matrix layouts.

## Latest font and beta deadline update

- Replaced the previous Source Sans / Source Serif font setup with Inter across the entire website.
- Removed serif headline styling so the site feels more like professional software.
- Added “Beta sign-up ends 8/31” across the site, including Home, Pricing, FAQ, Product Tour, Features, How It Works, and Apply pages.
