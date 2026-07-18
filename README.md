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

## Latest 86Voice / How It Works / deadline update

- Added a dedicated `86voice.html` page.
- Added 86Voice to the main navigation and footer.
- Promoted 86Voice on Home, Features, Product Tour, and How It Works.
- Expanded How It Works with a more descriptive rollout, example day, and daily/kitchen/owner value sections.
- Added prominent beta deadline displays, including a sticky deadline strip and deadline cards on Pricing and Apply.

## Latest ROI / time savings update

- Added a Home section explaining how saving 15 minutes a day can make the app nearly pay for itself.
- Added a Pricing page ROI calculator for minutes saved, hourly manager value, and days per month.
- Added inventory savings messaging around invoices, waste, burn logs, stockouts, prep duplication, and recipe consistency.
- Added FAQ and How It Works language explaining the time + inventory value.


## Latest full app / 86Voice coverage update

- Reviewed the uploaded 86 Chaos 15.0.72 app package and added a full `all-features.html` feature map.
- Expanded 86Voice from a small mention into a full sales feature across Home, Features, Product Tour, How It Works, Pricing, FAQ, and the dedicated 86Voice page.
- Added detailed 86Voice capabilities: prep upserts, task completion, recurring task creation, 86 alerts, menu-impact questions, reminders, navigation/search, status summaries, maintenance, burn logs, message posts, safety confirmations, audit behavior, and safe undo.
- Added app-wide feature coverage: Today, scheduling, availability, prep, tasks, inventory, invoices, recipes, Menu Intelligence, financials, maintenance, HR/training, reminders, AI Tools, settings, audit logs, and admin controls.

## Latest beta banner cleanup

- Removed the sticky beta deadline banner from all pages.
- Removed the beta deadline pill from the top navigation.
- Removed large beta deadline callout cards.
- Removed beta-deadline-only chip rows.
- Left the rest of the site intact, including 86Voice, All Features, pricing, ROI, and the beta form.

## Latest AI assisted ordering update

- Added a dedicated `ai-ordering.html` page.
- Added AI Ordering to the top navigation and footer.
- Added AI-assisted ordering sections to Home, Features, 86Voice, How It Works, Product Tour, Pricing, FAQ, and All Features.
- Added copy covering smart order suggestions from stock, par, pending orders, events, prep, Menu Intelligence links, burn/waste logs, and invoice history.
- Added vendor-grouped drafts, copy/save/apply workflow, event supply planning, prep prediction, invoice price warnings, waste/par warning cards, Manager Brief ordering attention, AI Tools launcher, and 86Voice ordering commands.

## Latest AI capabilities update from pasted capability list

- Added a dedicated `ai-tools.html` page.
- Added AI Tools to the main navigation and footer.
- Expanded AI coverage across Home, Features, 86Voice, AI Ordering, How It Works, Product Tour, Pricing, Beta, FAQ, and All Features.
- Main points now covered: 86Voice, AI Order Assistant, event supply planning, prep prediction, invoice intelligence, waste/burn analysis, par recommendations, recipe/menu costing, Menu Intelligence/86 impact, Manager Brief intelligence, Python order/ops intelligence, scheduled automation, recommendation approval queues, critical alerts, diagnostics, Help Center search, and bug report admin alerts.
- Added clearer AI safety language: AI can suggest, explain, draft, alert, analyze, report, and summarize. Humans approve business-changing actions.

## Latest legal packet update

- Added a concise `legal.html` page using only the needed public-facing legal packet items.
- Added footer links to Legal / Terms.
- Added short beta and backup responsibility notes on the Apply and Pricing pages.
- Included key customer-facing legal concepts: business/operator name, beta limitations, independent customer backups, AI/human review, no legal/payroll/tax/HR/food-safety advice, notification/automation delay risk, privacy basics, security basics, and support contact.
- Did not paste the full legal packet into the site.

## Latest app/website feature alignment update

- Added missing current-app feature details from the legal/current-feature packet.
- Added Schedule Copilot, coverage targets, schedule templates, drag board, request-off history, availability management, and conflict warnings.
- Added clearer Staff/HR, Manager Brief, Event Calendar, Message Board, Prep & Tasks, Smart Prep Matching, Brother QL-810W labels, Inventory & Orders, Menu Intelligence, Maintenance Log, bug reporting, System Audit, and restricted admin/support descriptions.
- Clarified Smart Kitchen+ access for AI Order Assistant, Python Forecast, Python Ops Scan, Menu Intelligence, invoice/menu scan intelligence, and AI-assisted ordering/intelligence features.
- Clarified Python Ops Scan lives in Manager Brief and findings route managers to the right app area.
- Clarified 86Voice does not create/edit/publish schedules or perform high-risk admin/payroll/billing/security/financial approvals by voice.

## Latest sales-focused cleanup

- Removed small release-note-style website copy such as navigation move details and bug-report/admin plumbing.
- Reframed app alignment into customer-facing sales language: time savings, smarter ordering, prep accountability, 86Voice, Menu Intelligence, Manager Brief, inventory visibility, and human-approved AI.
- Kept important legal/safety boundaries, but moved away from internal implementation details on the public pages.

## Latest AI-first full website update

- Reworked the pricing page so the AI value is front and center.
- Rebuilt tier cards to clearly position Shift, Operations, Smart Kitchen, and Owner Pro.
- Added an AI-by-tier comparison table.
- Made Smart Kitchen the primary AI/value tier and Owner Pro the advanced intelligence tier.
- Updated pricing comparison, ROI, Home, Features, AI Tools, AI Ordering, 86Voice, How It Works, Product Tour, Beta, FAQ, and All Features to sell AI-assisted ordering, Python Forecast, Menu Intelligence, invoice intelligence, price warnings, waste/par insights, prep prediction, Manager Brief intelligence, and human-approved AI.
