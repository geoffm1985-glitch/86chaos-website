import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import bridge from '../automation/chatgpt-dock-bridge.cjs';
const {DockCdp,installDockBridge}=bridge;
function fixture(){
  const client=new EventEmitter(),child=new EventEmitter(),debuggerApi=new EventEmitter(),session=new EventEmitter();let attached=false,attachCount=0,dock,commands=[];
  client.connected=child.connected=true;
  client.send=(m,cb)=>{queueMicrotask(()=>child.emit('message',m));cb?.()};child.send=(m,cb)=>{queueMicrotask(()=>client.emit('message',m));cb?.()};
  debuggerApi.isAttached=()=>attached;debuggerApi.attach=()=>{attached=true;attachCount++};debuggerApi.detach=()=>attached=false;
  debuggerApi.sendCommand=async(method,params)=>{commands.push({method,params});if(method==='Runtime.evaluate'){if(params.expression==='throw')return {exceptionDetails:{text:'script failed'}};return {result:{value:'signed-in dock'}}}if(method==='broken')throw new Error('renderer gone');return {ok:true}};
  const wc={isDestroyed:()=>false,getURL:()=> 'https://chatgpt.com/',debugger:debuggerApi,session};
  dock=wc;const cleanup=installDockBridge(child,{getDock:()=>dock});
  return {client,child,wc,debuggerApi,session,commands,cleanup,get attachCount(){return attachCount},setDock:value=>dock=value};
}
test('private IPC reaches the exact dock without any target discovery or WebSocket',async()=>{const f=fixture(),cdp=new DockCdp(f.client);try{await cdp.connect();assert.equal(await cdp.eval('account'),'signed-in dock');assert.equal(f.attachCount,1);assert.equal(f.commands[0].method,'Runtime.evaluate')}finally{cdp.close();f.cleanup()}assert.equal(f.client.listenerCount('message'),0)});
test('dock debugger reattaches after a detached connection while preserving the same session',async()=>{const f=fixture(),cdp=new DockCdp(f.client);try{await cdp.connect();f.debuggerApi.detach();assert.equal(await cdp.eval('account'),'signed-in dock');assert.equal(f.attachCount,2)}finally{cdp.close();f.cleanup()}});
test('file chooser events and download paths stay associated with the dock',async()=>{const f=fixture(),cdp=new DockCdp(f.client);cdp.downloads=path.join(os.tmpdir(),'ym-downloads');try{await cdp.connect();const event=cdp.waitEvent('Page.fileChooserOpened');f.debuggerApi.emit('message',{},'Page.fileChooserOpened',{backendNodeId:42});assert.deepEqual(await event,{backendNodeId:42});let saved;const item={getFilename:()=> 'reply.zip',setSavePath:value=>saved=value};f.session.emit('will-download',{},item,{});assert.equal(saved,undefined);f.session.emit('will-download',{},item,f.wc);assert.equal(saved,path.join(cdp.downloads,'reply.zip'))}finally{cdp.close();f.cleanup()}});
test('command failures and JavaScript exceptions reach the operator instead of being swallowed',async()=>{const f=fixture(),cdp=new DockCdp(f.client);try{await cdp.connect();await assert.rejects(cdp.send('broken'),/renderer gone/);await assert.rejects(cdp.eval('throw'),/script failed/)}finally{cdp.close();f.cleanup()}});
test('startup failure releases listeners and IPC disconnect rejects waiting commands promptly',async()=>{const f=fixture(),cdp=new DockCdp(f.client);f.setDock(null);await assert.rejects(cdp.connect(),/still starting/);assert.equal(f.client.listenerCount('message'),0);f.setDock(f.wc);await cdp.connect();f.debuggerApi.sendCommand=()=>new Promise(()=>{});const waiting=cdp.send('hung');f.client.connected=false;f.client.emit('disconnect');await assert.rejects(waiting,/desktop disconnected/);assert.equal(cdp.pending.size,0);assert.equal(f.client.listenerCount('disconnect'),0);f.cleanup()});
test('actual desktop launch uses IPC and never probes occupied DevTools ports',async()=>{
  const f=fixture(),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ym-bridge-launch-'));let socketOpened=false;
  const context={fs,path,os,URL,Map,process:{env:{YARDMASTER_CHATGPT_DOCK_REQUIRED:'1',YARDMASTER_CHATGPT_DOCK_BRIDGE:'1'}},dockBridge:{DockCdp:class extends DockCdp{constructor(){super(f.client)}}},Date,setTimeout,clearTimeout,WebSocket:class{constructor(){socketOpened=true;throw new Error('occupied port')}},spawn:()=>{throw new Error('must not spawn Edge')},fetch:()=>{throw new Error('must not discover targets')}};
  const source=fs.readFileSync(new URL('../automation/chatgpt.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');vm.runInNewContext(source+';this.launch=launch;',context);
  let result;try{result=await context.launch(temp);assert.equal(result.docked,true);assert.equal(result.port,null);assert.equal(result.profile,'persist:yardmaster-chatgpt-dock');assert.equal(socketOpened,false);assert.equal(await result.cdp.eval('account'),'signed-in dock')}finally{result?.cdp.close();f.cleanup();fs.rmSync(temp,{recursive:true,force:true})}
});
test('actual desktop spawn creates and installs its private IPC channel',async()=>{
  const source=fs.readFileSync(new URL('../desktop.cjs',import.meta.url),'utf8'),fn=source.slice(source.indexOf('async function ensureServer(){'),source.indexOf('\nasync function createWindow(){'));let options,installed;
  const child={},dock={webContents:{identity:'signed-in'}};const context={stopOrphanServer:async()=>{},healthy:async()=>true,path,root:'/app',process:{env:{KEEP:'yes'}},Date,setTimeout,chatGPTDock:dock,spawn:(_cmd,_args,opts)=>{options=opts;return child},installDockBridge:(value,opts)=>installed={value,opts}};
  vm.runInNewContext(fn+';this.start=ensureServer;',context);await context.start();assert.deepEqual(Array.from(options.stdio),['ignore','ignore','ignore','ipc']);assert.equal(options.env.YARDMASTER_CHATGPT_DOCK_BRIDGE,'1');assert.equal(options.env.KEEP,'yes');assert.equal(installed.value,child);assert.equal(installed.opts.getDock(),dock.webContents);
});

test('real Node child process serializes the private bridge request and reply',async()=>{
  const {fork}=await import('node:child_process');
  const f=fixture();const child=fork(new URL('fixtures/dock-bridge/transport.mjs',import.meta.url),[],{stdio:['ignore','ignore','pipe','ipc']});let log='';child.stderr.on('data',b=>log+=String(b));
  const cleanup=installDockBridge(child,{getDock:()=>f.wc});
  try{const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('IPC child timed out: '+log)),5000);child.on('message',m=>{if(m.transportResult||m.transportError){clearTimeout(timer);resolve(m)}});child.on('error',e=>{clearTimeout(timer);reject(e)})});assert.equal(result.transportError,undefined);assert.equal(result.transportResult,'signed-in dock')}finally{child.kill();cleanup();f.cleanup()}
});
