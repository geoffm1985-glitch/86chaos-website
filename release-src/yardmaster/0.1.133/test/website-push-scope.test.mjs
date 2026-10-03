import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readWebsite,workerHeaders,startWebsitePushFixture} from './helpers/website-push-fixture.mjs';

test('website worker response explicitly permits /yardmaster without a trailing slash',async()=>{
  const f=await startWebsitePushFixture();
  try{
    const response=await fetch(f.base+'/yardmaster/sw.js');
    assert.equal(response.headers.get('Service-Worker-Allowed'),'/yardmaster');
    assert.match(await response.text(),/showNotification/);
    assert.equal(workerHeaders()['Cache-Control'],'no-cache');
    const script=readWebsite('mobile.js');new vm.Script(script);
    const scopes=[...script.matchAll(/serviceWorker\.register\('\/yardmaster\/sw\.js',\{scope:'([^']+)'\}\)/g)].map(m=>m[1]);
    assert.deepEqual(scopes,['/yardmaster','/yardmaster']);
    for(const scope of scopes)assert.ok(scope.startsWith(workerHeaders()['Service-Worker-Allowed']));
  }finally{await f.close()}
});
