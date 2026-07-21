# 86 Chaos Marketing Website - Astro v90

This build migrates the 86 Chaos public marketing website from hand-maintained static HTML into an Astro project while preserving the current dark/copper brand, page structure, pricing layout, comparison matrices, assets, and beta application API route.

## What changed in v90

- Converted the public pages to Astro pages in `src/pages/`.
- Added reusable `BaseLayout`, `Header`, and `Footer` components.
- Moved public assets, CSS, JavaScript, robots.txt, and sitemap.xml into `public/`.
- Kept the Vercel API route at `api/beta-application.js`.
- Preserved existing links, clean URL behavior, and poster-style comparison charts.
- Updated CSS/JS cache strings to `v=90`.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Deploy

Deploy the project root to Vercel. Vercel should run `npm run build` and publish Astro's `dist/` output. The root `api/` folder is retained for the beta application form.

## Important project rules

- Keep the dark 86 Chaos background/image style.
- Keep comparison charts as poster-style matrices with copper headers, left-side feature labels, columns across the top, and check/X/partial symbols.
- Do not turn charts into accordions, stacked cards, or sideways-scroll tables.
- Shift includes Schedule Builder but not Time Clock.
- QuickBooks wording must stay review-first and owner-controlled during Founder Beta.
- Do not add customer-facing implementation-tool wording or old ROI calculator language.
