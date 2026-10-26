import {defineConfig,devices} from '@playwright/test';
const runRoot = `test-results/${process.env.WEBSITE_TEST_RUN || 'manual'}`;
export default defineConfig({
  testDir:'./tests/browser', timeout:45000, expect:{timeout:8000}, fullyParallel:false, workers:1,
  outputDir:`${runRoot}/browser-artifacts`, reporter:[['line'],['json',{outputFile:`${runRoot}/browser-results.json`}]],
  use:{baseURL:'http://127.0.0.1:4329',headless:true,trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:{command:'node tests/fixture-server.mjs',url:'http://127.0.0.1:4329',reuseExistingServer:false,timeout:30000},
  projects:[{name:'desktop',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:1000}}},{name:'tablet',use:{...devices['iPad (gen 7)'],browserName:'chromium'}},{name:'mobile',use:{...devices['Pixel 7']}},{name:'iphone',use:{...devices['iPhone 13']}},{name:'small-phone',use:{...devices['Galaxy S9+']}}]
});
