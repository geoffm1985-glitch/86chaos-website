import {defineConfig,devices} from '@playwright/test';

export function createPlaywrightConfig({platform=process.platform}={}){return defineConfig({
  testDir:'./test/playwright',
  fullyParallel:false,
  workers:1,
  timeout:45000,
  expect:{timeout:6000},
  reporter:[['./scripts/reporters/playwright-status.mjs']],
  projects:[
    {name:'desktop-and-regressions',testIgnore:'**/mobile-pwa.e2e.spec.mjs',use:{channel:platform==='win32'?'msedge':undefined}},
    {name:'mobile-android',testMatch:['**/mobile-pwa.e2e.spec.mjs','**/owner-reconnect.e2e.spec.mjs','**/loop-update.e2e.spec.mjs','**/model-controls.e2e.spec.mjs','**/continuous-loop.e2e.spec.mjs','**/firebase-target.e2e.spec.mjs'],use:{...devices['Pixel 7'],browserName:'chromium',channel:platform==='win32'?'msedge':undefined}},
  ],
  use:{
    headless:true,
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
    video:'off'
  }
})}
export default createPlaywrightConfig();
