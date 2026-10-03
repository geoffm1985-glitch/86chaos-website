import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProcessCountCache} from '../automation/process-count-cache.mjs';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
test('dashboard returns immediately while slow process enumeration is pending and shares one request',async()=>{
 let resolve,calls=0;const cache=createProcessCountCache({collect:()=>{calls++;return new Promise(r=>resolve=r)}});
 assert.deepEqual(cache.get(),{value:null,updatedAt:null,pending:true});cache.get();await flush();assert.equal(calls,1);resolve(8);await flush();assert.equal(cache.get().value,8);
});
test('failed enumeration retains the last known count instead of inventing zero',async()=>{
 let now=0,fail=false;const cache=createProcessCountCache({clock:()=>now,collect:async()=>{if(fail)throw Error('tasklist timeout');return 7}});
 cache.get();await flush();now=10001;fail=true;assert.equal(cache.get().value,7);await flush();assert.equal(cache.get().value,7);assert.equal(cache.get().updatedAt,0);
});
test('optional process enumeration refreshes only after its cache deadline',async()=>{
 let now=0,calls=0;const cache=createProcessCountCache({clock:()=>now,collect:async()=>++calls});
 cache.get();await flush();now=9999;cache.get();await flush();assert.equal(calls,1);now=10000;cache.get();await flush();assert.equal(calls,2);
});
