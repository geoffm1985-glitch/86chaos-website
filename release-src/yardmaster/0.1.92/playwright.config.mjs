import {defineConfig,devices} from '@playwright/test';

export default defineConfig({
  testDir:'./test/playwright',
  fullyParallel:false,
  workers:1,
  timeout:45000,
  expect:{timeout:6000},
  reporter:[['./scripts/reporters/playwright-status.mjs']],
  projects:[
    {name:'desktop-and-regressions',testIgnore:'**/mobile-pwa.e2e.spec.mjs'},
    {name:'mobile-android',testMatch:'**/mobile-pwa.e2e.spec.mjs',use:{...devices['Pixel 7'],browserName:'chromium',channel:undefined}},
    {name:'mobile-iphone',testMatch:'**/mobile-pwa.e2e.spec.mjs',use:{...devices['iPhone 13'],browserName:'webkit',channel:undefined}}
  ],
  use:{
    headless:true,
    channel:process.platform==='win32'?'msedge':undefined,
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
    video:'off'
  }
});
