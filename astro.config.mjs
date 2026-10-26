import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://86chaos.com',
  vite: { build: { assetsInlineLimit: 0 } },
  build: {
    format: 'file'
  }
});
