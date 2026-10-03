import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {mobilePage,startMobileFixture} from './helpers/mobile-pwa-fixture.mjs';
import {readWebsite} from './helpers/website-push-fixture.mjs';

test('standalone phone fixture serves the exact hosted markup, styles and browser logic',async()=>{
  const script=readWebsite('mobile.js');new vm.Script(script);
  assert.equal(readWebsite('yardmaster.astro').split('<script is:inline>')[1].split('</script>')[0],script);
  const f=await startMobileFixture();try{const html=await(await fetch(f.base+'/yardmaster')).text();assert.equal(html,mobilePage());assert.ok(html.includes(script));assert.equal((html.match(/data-mobile-section-target=/g)||[]).length,8);assert.ok(!html.includes('is:inline>')||html.includes(script))}finally{await f.close()}
});
test('phone source has one of each input and every static action/config control has browser coverage',()=>{
  const source=readWebsite('yardmaster.astro'),markup=source.split('<script is:inline>')[0];
  const ids=[...markup.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
  const selectors=[...readWebsite('mobile.js').matchAll(/\$\('#([A-Za-z0-9]+)'\)/g)].map(m=>m[1]);for(const id of selectors)assert.ok(ids.includes(id),'Missing phone element '+id);
  assert.match(markup,/maximum-scale=1,user-scalable=no/);assert.match(source,/gesturestart/);
});
test('scanned phone pairing accepts only secure Cloudflare hosts and six numeric digits',()=>{
  const source=readWebsite('mobile.js'),start=source.indexOf('function pairingHints()'),end=source.indexOf('function applyPairingHints()');
  function hints(url){const c={URL,URLSearchParams,location:{href:url},validHost:v=>/^[a-z0-9-]+\.trycloudflare\.com$/i.test(v),validRemote:v=>/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i.test(v)};vm.runInNewContext(source.slice(start,end)+';this.hints=pairingHints()',c);return JSON.parse(JSON.stringify(c.hints))}
  assert.deepEqual(hints('https://fixture.invalid/yardmaster?host=pc.trycloudflare.com&code=123456'),{remote:'https://pc.trycloudflare.com',code:'123456'});
  assert.deepEqual(hints('https://fixture.invalid/yardmaster?remote=http://evil.invalid&code=abcdef'),{remote:'',code:''});
});
test('push key comparison detects expired registrations and accepts matching keys',()=>{
  const source=readWebsite('mobile.js'),c={Uint8Array};vm.runInNewContext(source.slice(source.indexOf('function pushKeyMatches'),source.indexOf('async function waitForPushWorker'))+';this.matches=pushKeyMatches',c);assert.equal(c.matches(new Uint8Array([1,2]).buffer,new Uint8Array([1,2])),true);assert.equal(c.matches(new Uint8Array([9]).buffer,new Uint8Array([1,2])),false);assert.equal(c.matches(null,new Uint8Array([1])),false);
});
