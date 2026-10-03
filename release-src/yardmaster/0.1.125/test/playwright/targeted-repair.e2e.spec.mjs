import {test,expect} from '@playwright/test';
import {EventEmitter} from 'node:events';
import {stopFixture} from '../helpers/fixture-cleanup.mjs';
import {findControlSection} from '../helpers/mobile-control.mjs';

test('@repair190 fixture close precedes file removal and transient Windows locks receive bounded retries',async()=>{
  const child=new EventEmitter(),order=[];child.kill=()=>{setTimeout(()=>{order.push('close');child.emit('close')},10)};
  await stopFixture({child,temp:'fixture-only',graceMs:5,killMs:100,shutdown:async()=>{},remove:(dir,options)=>{order.push('remove');expect(options.maxRetries).toBe(10);expect(options.retryDelay).toBe(100)}});expect(order).toEqual(['close','remove']);expect(child.listenerCount('close')).toBe(0);
});
test('@repair190 detached phone control resolves Settings before a visible action is attempted',async()=>{
  let lookups=0;const section=await findControlSection({evaluate:async()=>++lookups===1?undefined:'settings'},{timeoutMs:100,pollMs:5});expect(section).toBe('settings');expect(lookups).toBe(2);
});
