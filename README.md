# 86 Chaos Marketing Website

Static multi-page marketing site for **86 Chaos**, an AI-assisted Kitchen Management OS operated by **Chilton App Works LLC**.

## Structure

- Plain HTML, CSS, and JavaScript
- No framework or build step
- Vercel API route for the Founder Beta application form
- Existing app-preview assets preserved in `assets/`

## Public pages

- `index.html` — sales-focused home page
- `features.html` — product capabilities and tier availability
- `86voice.html` — voice/text workflow and AI ordering commands
- `ai-tools.html` — AI-assisted ordering and kitchen intelligence
- `how-it-works.html` — low-friction rollout
- `product-tour.html` — app screen tour
- `pricing.html` — plan comparison and pricing
- `faq.html` — offer, objections, AI guardrails, and product fit
- `beta.html` — Founder Beta application
- `legal.html` — concise terms/privacy/beta essentials
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

## Pricing per location

All plans include unlimited users for normal restaurant use. No per-user charge for adding staff; plan limits still apply to AI scans, storage-heavy uploads, automation, and abusive usage.

- Shift: $49/month, Founder year one $24.50/month. Includes Schedule Builder, but not Time Clock.
- Operations: $99/month, Founder year one $49.50/month
- Smart Kitchen: $179/month, Founder year one $89.50/month
- Owner Pro: $299/month for the first location, then $129/month for each additional location. Founder year one: $149.50/month for the first location. Additional locations stay full price at $129/month each.

## Beta application email

The form posts to `/api/beta-application` and uses these Vercel environment variables:

```txt
RESEND_API_KEY=your_resend_api_key
BETA_TO_EMAIL=your_destination_email
BETA_FROM_EMAIL=86 Chaos Founder Beta <onboarding@your-verified-domain.com>
```

Do not commit real keys. `BETA_FROM_EMAIL` must use a domain verified with the email provider.

## Deploy

1. Commit the full folder to the website repository.
2. Confirm the Vercel project points to that repository.
3. Add the environment variables above.
4. Redeploy.
5. Test navigation, mobile layout, redirects, and the beta form on the live deployment.

## Current update

- Replaced low-contrast green lettering across the site with a near-white mint treatment while preserving green borders, glows, and backgrounds.
- Expanded the Features page into a detailed, skimmable directory covering more than 60 practical capabilities across daily management, prep, tasks, ordering, inventory, invoices, menu intelligence, scheduling, labor, 86Voice, maintenance, communication, events, owner visibility, and kitchen intelligence.
- Kept the compact tier comparison near the top so visitors can still understand plan availability quickly.
- Preserved the existing static HTML/CSS/JavaScript structure, assets, redirects, Founder Beta form, navigation, and overall dark copper/green design direction.

## V25 color update

- Applied the approved Option C comparison colors across the site.
- Positive / Yes labels use warm gray `#D2CEC8`.
- Negative / No labels use dusty rose `#D7A0A8`.
- Preserved the existing copper, navy, and Smart Kitchen highlight styling.

## V26 comparison-chart readability update

- Increased comparison-table body text, row labels, column headings, and supporting text across Pricing, Features, and AI + Ordering.
- Kept the charts compact and preserved mobile horizontal scrolling only where needed.
- Retained the approved Option C warm gray and dusty rose status colors.

## V27 interactive comparison update

- Made every plan and competitor column in the Pricing, Features, and AI + Ordering comparison charts clickable.
- Clicking any cell or heading highlights the full vertical column and softens the remaining columns for faster visual comparison.
- Clicking the selected column again clears the highlight.
- Added keyboard support through the column headings with Enter or Space, plus visible focus styling and screen-reader labels.
- Preserved compact table sizing, Option C status colors, and mobile horizontal scrolling.


## V44 Pricing comparison update
- Added a separate-app stack cost callout under the pricing app comparison.
- The callout shows the approximate public software range a restaurant may pay when combining separate scheduling, inventory/order, invoice/food-cost, and POS tools.
- Kept the main app comparison chart readable and desktop-fit.

## V46 Pricing comparison update

- Updated the separate-app stack cost example so it uses only apps shown in the current comparison chart.
- New example stack: 7shifts + MarketMan + MarginEdge + Restaurant365, shown as approximately $1,078-$1,423+/month before payroll, HotSchedules active-employee billing, implementation, POS hardware, payment processing, vendor integrations, and other add-ons.
- Added a short explanation of why the main chart compares 7shifts, HotSchedules, MarketMan, MarginEdge, and Restaurant365, while leaving POS-only tools out of the main comparison.


## v47 update notes

- Reworded the “Everything in one place” section to sound more professional.
- Clarified that Shift includes Schedule Builder, but Time Clock starts in Operations.

## v49 founder story page update
- Added `about.html` with a no-name founder story based on nearly 25 years of kitchen experience.
- Added About to the main navigation and Founder story to the footer.
- Preserved the existing static site structure and current pricing/comparison updates.
