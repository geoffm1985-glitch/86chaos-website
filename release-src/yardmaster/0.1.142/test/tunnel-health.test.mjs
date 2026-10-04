import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {tunnelRegistrationLost} from '../automation/tunnel-health.mjs';

test('expired Quick Tunnel registration is detected despite a living process',()=>{
  assert.equal(tunnelRegistrationLost('INF Registered tunnel connection\nERR Register tunnel error error="Unauthorized: Tunnel not found"'),true);
  assert.equal(tunnelRegistrationLost('ERR Register tunnel error error="Unauthorized: Tunnel not found"\nINF Registered tunnel connection'),false);
  assert.equal(tunnelRegistrationLost('INF Registered tunnel connection\nERR Register tunnel error error="network timeout"'),false);
});

function watchdog(lost){
  const source=fs.readFileSync(new URL('../server.mjs',import.meta.url),'utf8');
  const fn=source.slice(source.indexOf('function refreshRemoteHealth('),source.indexOf('async function startRemote('));
  const calls=[],trusted={credential:'retained'},ctx={state:{remote:{active:true,pid:123,url:'https://expired.trycloudflare.com'}},remoteProcess:{pid:123},remoteWanted:true,remoteStartPromise:null,remoteRetryAt:0,
    pidAlive:()=>true,readTunnelRegistrationLost:()=>lost,remoteLogPath:()=>'/fixture.log',terminateProcessTree:pid=>calls.push(['terminate',pid]),activity:()=>{},saveRemoteState:()=>calls.push(['save']),publishRemoteConnection:status=>calls.push(['publish',status]),beginRemoteStart:()=>calls.push(['restart']),trusted};
  vm.runInNewContext(fn+';refreshRemoteHealth()',ctx);
  return {ctx,calls,trusted};
}
test('actual watchdog replaces an expired living tunnel and preserves trusted phones',()=>{
  const {ctx,calls,trusted}=watchdog(true);
  assert.equal(ctx.state.remote.active,false);
  assert.equal(ctx.state.remote.url,null);
  assert.deepEqual(calls,[['terminate',123],['save'],['publish','tunnel-unavailable'],['restart']]);
  assert.equal(ctx.trusted,trusted);assert.equal(trusted.credential,'retained');
});
test('actual watchdog leaves a registered living tunnel running',()=>{
  const {ctx,calls}=watchdog(false);
  assert.equal(ctx.state.remote.active,true);assert.deepEqual(calls,[]);
});
