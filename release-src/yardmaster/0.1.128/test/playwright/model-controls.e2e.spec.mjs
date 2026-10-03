import {test,expect} from '@playwright/test';
import {operatorUpdateFixture} from '../helpers/operator-update-fixture.mjs';
import {startMobileFixture,prepareMobile} from '../helpers/mobile-pwa-fixture.mjs';
import {hostedMobileViewport} from '../helpers/loop-update-fixture.mjs';
const models=['GPT-6.1 Sol','GPT-6 Sol','GPT-6 Astra','GPT-6 Luna','GPT-5.6 Sol','GPT-5.6 Terra','GPT-5.6 Luna'];
async function exercise(page,readConfig){
  const mode=page.locator('#chatMode'),model=page.locator('#model');
  await expect(model).toHaveValue('GPT-5.6 Sol');
  expect(await model.evaluate(e=>e.tagName)).toBe('SELECT');
  for(const selectedMode of ['Work','Chat']){
    await mode.selectOption(selectedMode);await expect.poll(async()=>(await readConfig()).chatMode).toBe(selectedMode);
    for(const name of models){
      await expect(model.locator('option')).toHaveText(models);
      await model.selectOption(name);await expect.poll(async()=>(await readConfig()).model).toBe(name);
      await expect(model).toHaveValue(name);
    }
  }
  await page.reload();
}

test('@modelControl100 native PC/phone dashboard saves every model in Work and Chat',async({page})=>{
  const f=await operatorUpdateFixture();
  try{
    await page.goto(f.url);await page.locator('[data-nav="chatgpt"]:visible').click();
    const read=async()=>(await (await page.request.get(f.url+'/api/status')).json()).config;
    await exercise(page,read);
    await page.locator('[data-nav="chatgpt"]:visible').click();
    await expect(page.locator('#model')).toHaveValue(models.at(-1));await expect(page.locator('#chatMode')).toHaveValue('Chat');
  }finally{await f.close()}
});
test('@modelControl100 hosted mobile PWA saves all models through authenticated remote controls',async({page})=>{
  await page.setViewportSize(hostedMobileViewport(page.viewportSize()));
  const server=await startMobileFixture();
  try{
    const f=await prepareMobile(page);await page.goto(server.base+'/yardmaster');await expect(page.locator('#overlay')).toBeHidden();
    await expect(page.locator('.mobile-nav')).toBeVisible();
    await page.locator('[data-mobile-section-target="chatgpt"]').click();
    await exercise(page,async()=>f.state.config);
    await expect(page.locator('#overlay')).toBeHidden();await page.locator('[data-mobile-section-target="chatgpt"]').click();
    await expect(page.locator('#model')).toHaveValue(models.at(-1));await expect(page.locator('#chatMode')).toHaveValue('Chat');
    expect(f.calls.filter(c=>c.path==='/api/config').every(c=>c.authorization==='Bearer fixture-session')).toBe(true);
    f.state.config.model='Account custom model';await page.reload();await expect(page.locator('#overlay')).toBeHidden();await page.locator('[data-mobile-section-target="chatgpt"]').click();
    await expect(page.locator('#model')).toHaveValue('Account custom model');
  }finally{await server.close()}
});
