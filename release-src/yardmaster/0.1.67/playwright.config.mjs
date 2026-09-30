import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir:'./test/playwright',
  fullyParallel:false,
  workers:1,
  timeout:45000,
  expect:{timeout:6000},
  reporter:[['list']],
  use:{
    headless:true,
    channel:process.platform==='win32'?'msedge':undefined,
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
    video:'off'
  }
});
