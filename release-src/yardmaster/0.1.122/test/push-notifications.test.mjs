import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('phone service worker displays Yardmaster push payload and opens its target URL',async()=>{
  const source=fs.readFileSync(path.join(root,'public','sw.js'),'utf8');
  const handlers={};let shown=null,opened=null;
  const context={
    URL,Promise,
    fetch:()=>Promise.resolve({}),
    caches:{open:()=>Promise.resolve({addAll:()=>Promise.resolve()}),keys:()=>Promise.resolve([]),delete:()=>Promise.resolve(true),match:()=>Promise.resolve(null)},
    self:{
      skipWaiting:()=>{},
      addEventListener:(name,handler)=>{handlers[name]=handler},
      registration:{showNotification:(title,options)=>{shown={title,options};return Promise.resolve()}},
      clients:{claim:()=>Promise.resolve(),matchAll:()=>Promise.resolve([]),openWindow:url=>{opened=url;return Promise.resolve({url})}}
    }
  };
  vm.runInNewContext(source,context,{filename:'public/sw.js'});
  assert.equal(typeof handlers.push,'function');
  assert.equal(typeof handlers.notificationclick,'function');
  let pushDone;
  handlers.push({data:{json:()=>({title:'Yardmaster test',body:'Push works',url:'https://fixture.example/yardmaster',tag:'yardmaster-test'})},waitUntil:p=>{pushDone=p}});
  await pushDone;
  assert.equal(shown.title,'Yardmaster test');
  assert.equal(shown.options.body,'Push works');
  assert.equal(shown.options.data.url,'https://fixture.example/yardmaster');
  let clickDone;
  handlers.notificationclick({notification:{data:{url:'https://fixture.example/yardmaster'},close:()=>{}},waitUntil:p=>{clickDone=p}});
  await clickDone;
  assert.equal(opened,'https://fixture.example/yardmaster');
});
