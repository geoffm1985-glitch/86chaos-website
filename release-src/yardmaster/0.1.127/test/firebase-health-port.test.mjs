import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {portOpen} from '../automation/firebase-target.mjs';

function controlledSocket(delay){
 const socket=new EventEmitter();let deadline,connection;socket.setTimeout=ms=>{socket.deadlineMs=ms;deadline=setTimeout(()=>socket.emit('timeout'),ms);if(delay!==null)connection=setTimeout(()=>socket.emit('connect'),delay)};socket.destroy=()=>{clearTimeout(deadline);clearTimeout(connection);socket.destroyed=true};return socket;
}
test('Play Store: loaded PC socket connection beyond 300ms remains healthy',async()=>{
 const socket=controlledSocket(450);assert.equal(await portOpen({host:'127.0.0.1',port:9000},{connect:()=>socket}),true);assert.equal(socket.deadlineMs,10000);assert.equal(socket.destroyed,true);
});
test('Play Store: unavailable emulator still fails the bounded socket probe',async()=>{
 const socket=controlledSocket(null);assert.equal(await portOpen({host:'127.0.0.1',port:9000},{timeoutMs:40,connect:()=>socket}),false);assert.equal(socket.destroyed,true);
});
test('Play Store: refused emulator connection fails immediately',async()=>{
 const socket=controlledSocket(null);queueMicrotask(()=>socket.emit('error',new Error('ECONNREFUSED')));assert.equal(await portOpen({host:'127.0.0.1',port:9000},{connect:()=>socket}),false);assert.equal(socket.destroyed,true);
});
