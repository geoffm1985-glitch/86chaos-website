import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {FirebaseSession,readinessJson} from '../automation/firebase-target.mjs';

test('Play Store: only a pinned emulator-only pending SDK gets the runtime grace classification',async()=>{
 const server=http.createServer((req,res)=>{res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({target:req.url==='/live'?'live':'emulator',projectId:'demo-86chaos',blockLiveFirebase:req.url!=='/unguarded',ready:false,error:'SDK reloading'}))});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 try{for(const [route,project,expected] of [['/pending','demo-86chaos',true],['/live','demo-86chaos',false],['/unguarded','demo-86chaos',false],['/pending','wrong-project',false],['/pending',undefined,false]]){
  await assert.rejects(readinessJson(url+route,{pendingProjectId:project}),error=>{assert.equal(error.sdkReadinessPending,expected);assert.match(error.message,/SDK reloading/);return true});
 }}finally{server.closeAllConnections();await new Promise(r=>server.close(r))}
});
function session(){let now=0;const failures=[],s=new FirebaseSession({now:()=>now,onFatal:error=>failures.push(error)});s.status='running';s.stop=async()=>{};const pending=Object.assign(new Error('Readiness HTTP 503: SDK reloading'),{sdkReadinessPending:true});s.ready=async()=>{throw pending};return {s,failures,at:value=>{now=value}}}
test('Play Store: SDK delays beyond three quick failures recover without restarting owned tests',async()=>{
 const {s,failures,at}=session();for(const time of [0,3000,6000,9000,45000]){at(time);await s.checkHealth();assert.equal(s.status,'running')}
 s.ready=async()=>{};await s.checkHealth();assert.equal(s.sdkPendingSince,null);assert.equal(s.healthFailures,0);assert.equal(failures.length,0);
});
test('Play Store: sustained SDK unreadiness still blocks at the bounded sixty-second deadline',async()=>{
 const {s,failures,at}=session();await s.checkHealth();at(30000);await s.checkHealth();at(59999);await s.checkHealth();assert.equal(s.status,'running');at(60000);await s.checkHealth();await s.stopPromise;assert.equal(s.status,'blocked');assert.equal(failures.length,1);
});
test('Play Store: other failures retain the three-failure block and cannot extend SDK grace',async()=>{
 const {s,failures}=session();await s.checkHealth();s.ready=async()=>{throw new Error('Emulator endpoint mismatch')};await s.checkHealth();await s.checkHealth();await s.stopPromise;assert.equal(s.status,'blocked');assert.equal(s.sdkPendingSince,null);assert.equal(failures.length,1);
});
