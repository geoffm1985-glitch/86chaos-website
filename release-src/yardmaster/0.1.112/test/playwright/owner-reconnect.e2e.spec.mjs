import {test,expect} from '@playwright/test';
import crypto from 'node:crypto';
import {startMobileFixture,prepareMobile,REMOTE} from '../helpers/mobile-pwa-fixture.mjs';
import {signedConnection,DISCOVERY_URL} from '../../automation/owner-connection.mjs';
const pair=crypto.generateKeyPairSync('rsa',{modulusLength:2048}),identity={id:'owner-fixture',privateKey:pair.privateKey.export({format:'pem',type:'pkcs8'}),publicKey:pair.publicKey.export({format:'jwk'})};
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};let site;test.use({viewport:{width:390,height:844}});
test.beforeAll(async()=>{site=await startMobileFixture()});test.afterAll(async()=>{await site.close()});
async function ready(page){
 const fixture=await prepareMobile(page);fixture.state.connection={id:identity.id,publicKey:identity.publicKey,discoveryUrl:DISCOVERY_URL};
 const control={url:REMOTE,offline:false,revoked:false,passkeys:0};
 await page.addInitScript(()=>{window.passkeyRequests=0;Object.defineProperty(navigator,'credentials',{configurable:true,value:{get:async()=>{window.passkeyRequests++;throw Error('Unexpected re-pairing')},create:async()=>{window.passkeyRequests++;throw Error('Unexpected registration')}}})});
 await page.route(DISCOVERY_URL+'*',route=>route.fulfill({headers,json:signedConnection(identity,control.url)}));
 await page.route('https://*.trycloudflare.com/api/remote/health',route=>route.fulfill({headers,json:{ok:true,connectionId:identity.id}}));
 await page.route('https://replacement-owner.trycloudflare.com/**',route=>{
  const pathname=new URL(route.request().url()).pathname;
  return route.fulfill({headers,json:pathname==='/api/remote/health'?{ok:true,connectionId:identity.id}:pathname==='/api/status'?fixture.state:pathname==='/api/intelligence'?fixture.intelligence:{ok:true}})
 });
 await page.route(REMOTE+'/api/status',route=>control.offline?route.abort('internetdisconnected'):control.revoked?route.fulfill({headers,status:401,body:'Revoked'}):route.fulfill({headers,json:fixture.state}));
 await page.goto(site.base+'/yardmaster');await expect(page.locator('body')).toHaveClass(/ym-authenticated/);
 // Remove scheduled polling so each regression controls consecutive failures precisely.
 await page.evaluate(()=>{for(let id=1;id<100;id++)clearInterval(id)});
 return {fixture,control};
}
async function refresh(page){await page.evaluate(()=>refresh())}
test('persistent trusted phone survives reload and empty tab session',async({page})=>{
 await ready(page);await page.evaluate(()=>sessionStorage.clear());await page.reload();await expect(page.locator('body')).toHaveClass(/ym-authenticated/);
 expect(await page.evaluate(()=>localStorage.getItem('yardmaster:ownerCredential'))).toBe('fixture-session');expect(await page.evaluate(()=>window.passkeyRequests)).toBe(0);
});
test('temporary network loss requires several failures then recovers without pairing',async({page})=>{
 const {control}=await ready(page);control.offline=true;await refresh(page);await expect(page.locator('#overlay')).not.toHaveClass(/show/);await refresh(page);await expect(page.locator('#overlay')).not.toHaveClass(/show/);await refresh(page);await expect(page.locator('#phoneReconnect')).toBeVisible();
 control.offline=false;await refresh(page);await expect(page.locator('body')).toHaveClass(/ym-authenticated/);expect(await page.evaluate(()=>window.passkeyRequests)).toBe(0);
});
test('tunnel/service restart discovers new endpoint and retains owner sign-in',async({page})=>{
 const {control}=await ready(page);control.offline=true;control.url='https://replacement-owner.trycloudflare.com';await refresh(page);await expect(page.locator('body')).toHaveClass(/ym-authenticated/);expect(await page.evaluate(()=>localStorage.getItem('yardmaster:url'))).toBe(control.url);expect(await page.evaluate(()=>window.passkeyRequests)).toBe(0);
});
test('background/resume and network return refresh the endpoint automatically',async({page})=>{
 const {control}=await ready(page);control.url='https://replacement-owner.trycloudflare.com';
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('online'))});
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('yardmaster:url'))).toBe(control.url);await expect(page.locator('body')).toHaveClass(/ym-authenticated/);expect(await page.evaluate(()=>window.passkeyRequests)).toBe(0);
});
test('explicit authentication rejection prompts unlock while preserving registered phone',async({page})=>{
 const {control}=await ready(page);control.revoked=true;await refresh(page);await expect(page.locator('#phonePairForm')).toBeVisible();expect(await page.evaluate(()=>localStorage.getItem('yardmaster:ownerCredential'))).toBe(null);expect(await page.evaluate(()=>localStorage.getItem('yardmaster:deviceId'))).toBe('phone-fixture');
});
