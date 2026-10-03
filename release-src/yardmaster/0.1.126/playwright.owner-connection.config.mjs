import {defineConfig,devices} from '@playwright/test';
export default defineConfig({testDir:'./test/playwright',testMatch:'owner-reconnect.e2e.spec.mjs',workers:1,timeout:30000,reporter:'list',use:{headless:true,trace:'retain-on-failure'},projects:[{name:'desktop',use:{channel:'msedge',viewport:{width:390,height:844}}},{name:'android',use:{...devices['Pixel 7'],channel:'msedge'}}]});
