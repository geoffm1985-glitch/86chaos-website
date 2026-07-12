# 86 Chaos Marketing Site v2

This version uses your actual uploaded 86 Chaos logo, Wisconsin/map brand image, and app icon.

## Included files

- `index.html`
- `styles.css`
- `script.js`
- `package.json`
- `api/apply.js`
- `assets/86chaos-logo.png`
- `assets/86chaos-map-brand.jpg`
- `assets/app-icon.png`

## Uploaded asset dimensions

```json
{
  "86chaos-logo.png": [
    1376,
    768
  ],
  "86chaos-map-brand.jpg": [
    1896,
    2048
  ],
  "app-icon.png": [
    500,
    500
  ]
}
```

## What changed from v1

- Uses your real logo and app icon.
- Uses the Wisconsin/map brand image in the hero.
- Shorter overall page with fewer large sections.
- Cleaner compact product preview area.
- Beta form no longer opens the visitor's personal email app.
- Beta form posts to `/api/apply`.
- `/api/apply` sends the form to `geoffrey@86chaos.com` using Resend.

## Important: form email setup

Static websites cannot send email by themselves. This package includes a Vercel serverless API route that sends email through Resend.

### Step 1: Create Resend account

1. Go to Resend.
2. Create an account.
3. Add/verify your domain if you want to send from `beta@86chaos.com`.
4. Create an API key.

### Step 2: Add Vercel environment variables

In Vercel → Project → Settings → Environment Variables, add:

```text
RESEND_API_KEY=your_resend_api_key_here
BETA_TO_EMAIL=geoffrey@86chaos.com
BETA_FROM_EMAIL=86 Chaos <beta@86chaos.com>
```

If `beta@86chaos.com` is not verified yet in Resend, use whatever sender address Resend allows until the domain is verified.

### Step 3: Deploy

If using GitHub/Vercel:

```bash
git add .
git commit -m "Update 86 Chaos marketing site"
git push
```

Vercel should install the `resend` package and deploy the `/api/apply` serverless function automatically.

## Upload instructions

### Existing website repo

1. Unzip this package.
2. Copy everything into your website repo root:
   - `index.html`
   - `styles.css`
   - `script.js`
   - `package.json`
   - `api/`
   - `assets/`
3. Commit and push.
4. Add the Vercel environment variables above.
5. Redeploy.

### New Vercel project

1. Create a new project in Vercel.
2. Upload/import this folder.
3. Framework preset: Other.
4. Build command: leave blank unless Vercel asks.
5. Add environment variables.
6. Deploy.

## Test checklist

After deploy:

1. Open `https://86chaos.com`.
2. Check desktop layout.
3. Check mobile layout.
4. Click product preview tabs.
5. Submit a test Founder Beta form.
6. Confirm email arrives at `geoffrey@86chaos.com`.
7. Reply to the received email and confirm it replies to the applicant's email.
8. If the form says email is not configured, verify `RESEND_API_KEY` is set and redeploy.

## Note

The app previews use realistic fictional restaurant data. Do not put real employee names, wage data, payroll data, private sales data, or customer information on the public website.
