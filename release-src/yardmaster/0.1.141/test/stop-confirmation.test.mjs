import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {readWebsite} from './helpers/website-push-fixture.mjs';

const desktop=fs.readFileSync(new URL('../public/app.js',import.meta.url),'utf8'),mobile=readWebsite('mobile.js');
test('both interfaces confirm only Stop and honor Cancel and Confirm',()=>{
  for(const source of [desktop,mobile]){
    let accepted=false;const messages=[],c={confirm:message=>{messages.push(message);return accepted}};
    vm.runInNewContext(source.slice(source.indexOf('function confirmStopAction'),source.indexOf('\n',source.indexOf('function confirmStopAction')))+';this.allowed=confirmStopAction;',c);
    for(const action of ['start','pause','resume','remote-stop'])assert.equal(c.allowed(action),true);
    assert.equal(messages.length,0);assert.equal(c.allowed('stop'),false);accepted=true;assert.equal(c.allowed('stop'),true);assert.deepEqual(messages,['Stop the current test and Yardmaster workflow?','Stop the current test and Yardmaster workflow?']);
  }
});
test('desktop Cancel sends no stop request and Confirm sends exactly one',async()=>{
  const calls=[];let accepted=false;const c={confirm:()=>accepted,api:async(url,options)=>{calls.push(JSON.parse(options.body));return {}},load:async()=>{},alert:message=>assert.fail(message)};
  vm.runInNewContext(desktop.slice(desktop.indexOf('function confirmStopAction'),desktop.indexOf('function bindActions'))+';this.stop=action;',c);
  await c.stop('stop');assert.equal(calls.length,0);accepted=true;await c.stop('stop');assert.deepEqual(calls,[{action:'stop'}]);
});
test('mobile Cancel leaves the workflow untouched and Confirm sends exactly one stop',async()=>{
  let accepted=false,handler;const calls=[],c={confirm:()=>accepted,document:{addEventListener:(type,fn)=>handler=fn},api:async(url,options)=>{calls.push(JSON.parse(options.body));return {}},refresh:()=>{},alert:message=>assert.fail(message)};
  const start=mobile.indexOf('function confirmStopAction'),end=mobile.indexOf('for(const [id,key,type]',start);
  vm.runInNewContext(mobile.slice(start,end),c);
  const event={target:{closest:()=>({dataset:{act:'stop'}})}};
  await handler(event);assert.equal(calls.length,0);accepted=true;await handler(event);assert.deepEqual(calls,[{action:'stop'}]);
});
