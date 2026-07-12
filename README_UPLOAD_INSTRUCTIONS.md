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


## Beta form troubleshooting

If the Founder Beta form does not send:

1. Make sure the site is deployed on Vercel. The form posts to `/api/apply`, which is a Vercel serverless function. A purely static host will return 404.
2. In Vercel → Project → Settings → Environment Variables, confirm:
   - `RESEND_API_KEY`
   - `BETA_TO_EMAIL=geoffrey@86chaos.com`
   - `BETA_FROM_EMAIL=86 Chaos <beta@86chaos.com>`
3. Redeploy after adding environment variables.
4. In Resend, verify the sending domain/email used in `BETA_FROM_EMAIL`.
5. In Vercel, open the latest deployment → Functions → `/api/apply` logs to see the exact error.
6. This v6 package fixes the Resend Node SDK reply-to field by using `replyTo`.


## v7 compact professional pass

- Desktop max-width reduced to 980px.
- Top nav and logo reduced.
- Hero text, section headers, cards, app mockup, and footer reduced.
- Comparison chart made smaller, denser, and more professional.
- Mobile typography and spacing reduced.
- Mobile comparison chart uses a smaller horizontal-scroll table.


## v8 product preview expansion

- Added more product preview buttons:
  - Daily Close
  - Labor
  - Schedule
  - Time Clock
  - Recipes
  - Reminders
  - 86 Alerts
- Added a compact screenshot gallery under the main product preview.
- Kept the compact desktop/mobile layout from v7.


## v9 mobile zoom-out fix

- Fixed horizontal overflow that caused mobile Chrome to zoom the whole page out.
- Replaced the long product-preview button row with a professional feature carousel.
- Added left/right feature arrows.
- Active feature scrolls into view automatically.
- Preserved compact desktop/mobile layout and all previous form fixes.


## v10 tiers added

- Added a compact Plans & Founder Pricing section.
- Added tiers:
  - Shift: $49/month, Founder $24.50/month
  - Operations: $99/month, Founder $49.50/month
  - Smart Kitchen: $179/month, Founder $89.50/month
  - Owner Pro: $299/month, Founder $149.50/month
- Added a Plans nav link.
- Added integrations-coming-soon note.


## v11 86Voice push

- Added 86Voice to the nav.
- Added 86Voice to hero proof badges.
- Added 86Voice product preview button and mockup.
- Added 86Voice screenshot gallery tile.
- Added dedicated 86Voice Intelligent Commands section.
- Added intelligent voice commands row to comparison chart.
- Added voice command mentions in plan cards.


## v12 hero tagline update

- Removed the Tonight’s Pulse metrics box under the Wisconsin image.
- Replaced it with the hero tagline:
  “Built for the rush, the close, and everything that gets missed between.”


## v13 better hero tagline

Updated hero image tagline to:
“The shift doesn’t fall apart because one person forgot.”

Updated supporting line to:
“86 Chaos keeps prep, 86 alerts, inventory, labor, daily close, voice commands, and owner visibility connected before small misses become expensive.”


## v14 short bold hero tagline

Updated hero image tagline to:
“Less chaos. More control.”

Updated supporting line to:
“Prep, alerts, inventory, labor, voice commands, and closeout connected.”


## v15 86Voice tagline refinement

Kept the main tagline:
“Less chaos. More control.”

Updated supporting line to:
“86Voice turns prep, tasks, 86 alerts, and “done” into action.”


## v16 clean hero + 86Voice promotion

- Hero Wisconsin image tagline now only says:
  “Less chaos. More control.”
- Removed the second line under the hero image.
- Strengthened 86Voice promotion elsewhere:
  - Nav
  - Hero proof badge
  - Product preview
  - Screenshot gallery
  - Dedicated 86Voice section
  - Plan card language
  - Comparison chart
