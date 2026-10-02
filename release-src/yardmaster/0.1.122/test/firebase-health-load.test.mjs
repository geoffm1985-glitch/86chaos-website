import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readinessJson} from '../automation/firebase-target.mjs';
test('Play Store: emulator health tolerates slow local responses and still rejects timeouts and bad readiness',async()=>{
 const timers=new Set(),server=http.createServer((req,res)=>{if(req.url==='/hung')return;if(req.url==='/bad'){res.writeHead(503);res.end('{}');return}const timer=setTimeout(()=>{timers.delete(timer);res.setHeader('Content-Type','application/json');res.end('{"ok":true}')},1700);timers.add(timer)});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{assert.deepEqual(await readinessJson(base+'/slow'),{ok:true});await assert.rejects(readinessJson(base+'/bad'),/Readiness HTTP 503/);await assert.rejects(readinessJson(base+'/hung',{timeoutMs:40}),/Readiness timed out after 40ms/)}finally{for(const t of timers)clearTimeout(t);server.closeAllConnections();await new Promise(r=>server.close(r))}
});
