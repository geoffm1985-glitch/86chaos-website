# 86 Chaos Marketing Site

This is a static landing page for 86 Chaos built from the current app screenshots/style direction, but with cleaned-up, realistic sample restaurant data instead of test/demo clutter.

## Files

- `index.html` - the website structure and content
- `styles.css` - all styling
- `script.js` - mobile nav, product mockup tabs, and beta form mailto behavior

## Important before publishing

1. Open `script.js`.
2. Replace:

```js
const OWNER_EMAIL = "founder@86chaos.com";
```

with the real email address where beta requests should go.

Or replace the form with a real provider such as:
- Tally
- Google Forms
- Formspree
- HubSpot
- Mailchimp
- ConvertKit

## How to upload to Vercel

### Option A: Existing Vercel/GitHub website repo

1. Unzip `86chaos_marketing_site.zip`.
2. Open your website repo on your computer.
3. Copy these files into the root of the repo:
   - `index.html`
   - `styles.css`
   - `script.js`
4. Commit the changes:
   ```bash
   git add .
   git commit -m "Add 86 Chaos marketing landing page"
   git push
   ```
5. Vercel should auto-deploy if the repo is connected.

### Option B: Upload directly to Vercel as a static site

1. Go to Vercel.
2. Create a new project.
3. Import or upload this folder.
4. Framework preset: `Other`
5. Build command: leave blank
6. Output directory: leave blank or `.`
7. Deploy.

### Option C: GitHub new repo

1. Create a new GitHub repo, for example `86chaos-website`.
2. Upload `index.html`, `styles.css`, and `script.js`.
3. Import that repo into Vercel.
4. Point `86chaos.com` to the new Vercel project if desired.

## Custom domain checklist

In Vercel:
1. Go to Project Settings.
2. Go to Domains.
3. Add `86chaos.com`.
4. Follow Vercel’s DNS instructions.
5. After DNS updates, test:
   - `https://86chaos.com`
   - mobile view
   - Founder Beta button/form
   - Product preview tabs

## Notes about the mockups

The app previews are not raw screenshots. They are HTML/CSS mockups based on the current app UI, with fictional but realistic restaurant data.

Do not publish real customer, employee, wage, payroll, tip, or sales data on a public marketing page.
