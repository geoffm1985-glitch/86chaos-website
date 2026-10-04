import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import bridge from '../automation/chatgpt-dock-bridge.cjs';
const {DockCdp,installDockBridge}=bridge;
test('resolved renderer ZIP recovery accepts only the selected file in the current conversation',async()=>{
 const {resolvedRepairURL}=await import('../automation/dock-downloads.cjs').then(m=>m.default);
 const context={conversationURL:'https://chatgpt.com/c/current-id',resolutionURL:'https://chatgpt.com/backend-api/conversation/current-id/interpreter/download?message=one',filename:'repair.zip'};
 const value={file_name:'repair.zip',mime_type:'application/zip',download_url:'https://chatgpt.com/backend-api/estuary/content?id=selected&token=private'};
 assert.equal(resolvedRepairURL(value,context),value.download_url);
 for(const changed of [{filename:'other.zip'},{conversationURL:'https://chatgpt.com/c/old-id'},{conversationURL:'https://attacker.example/c/current-id'}])assert.equal(resolvedRepairURL(value,{...context,...changed}),null);
 for(const changed of [{file_name:'other.zip'},{mime_type:'text/html'},{download_url:'https://attacker.example/repair.zip'},{download_url:'https://chatgpt.com/backend-api/other'}])assert.equal(resolvedRepairURL({...value,...changed},context),null);
});
test('failed renderer fetch recovers the authenticated selected ZIP once and keeps signed URLs out of logs',async()=>{
 const events=[],f=fixture({onDownloadState:e=>events.push(e)}),cdp=new DockCdp(f.client),url='https://chatgpt.com/backend-api/estuary/content?id=selected&token=private';let downloads=0;
 f.wc.getURL=()=> 'https://chatgpt.com/c/current-id';f.wc.downloadURL=u=>{assert.equal(u,url);downloads++};
 const send=f.debuggerApi.sendCommand;f.debuggerApi.sendCommand=async(m,p)=>m==='Network.getResponseBody'?{body:JSON.stringify({file_name:'repair.zip',mime_type:'application/zip',download_url:url})}:send(m,p);
 const emit=(method,p)=>f.debuggerApi.emit('message',{},'Network.'+method,p);
 try{await cdp.connect();await cdp.prepareDownload('repair.zip');emit('requestWillBeSent',{requestId:'resolve',request:{url:'https://chatgpt.com/backend-api/conversation/current-id/interpreter/download'}});emit('responseReceived',{requestId:'resolve',response:{status:200}});emit('loadingFinished',{requestId:'resolve'});await new Promise(r=>setImmediate(r));
 for(let n=0;n<2;n++){emit('requestWillBeSent',{requestId:'fetch'+n,request:{url}});emit('loadingFailed',{requestId:'fetch'+n,errorText:'net::ERR_FAILED'})}
 assert.equal(downloads,1);assert.equal(events.filter(e=>e.event==='artifact-fetch-fallback').length,1);assert.ok(!JSON.stringify(events).includes('private'));
 }finally{cdp.close();f.cleanup()}
});
function fixture(options={}){
  const client=new EventEmitter(),child=new EventEmitter(),debuggerApi=new EventEmitter(),session=new EventEmitter();let attached=false,attachCount=0,dock,commands=[];
  client.connected=child.connected=true;
  client.send=(m,cb)=>{queueMicrotask(()=>child.emit('message',m));cb?.()};child.send=(m,cb)=>{queueMicrotask(()=>client.emit('message',m));cb?.()};
  debuggerApi.isAttached=()=>attached;debuggerApi.attach=()=>{attached=true;attachCount++};debuggerApi.detach=()=>attached=false;
  debuggerApi.sendCommand=async(method,params)=>{commands.push({method,params});if(method==='Runtime.evaluate'){if(params.expression==='throw')return {exceptionDetails:{text:'script failed'}};return {result:{value:'signed-in dock'}}}if(method==='broken')throw new Error('renderer gone');return {ok:true}};
  const wc={isDestroyed:()=>false,getURL:()=> 'https://chatgpt.com/',debugger:debuggerApi,session};
  dock=wc;const cleanup=installDockBridge(child,{getDock:()=>dock,...options});
  return {client,child,wc,debuggerApi,session,commands,cleanup,get attachCount(){return attachCount},setDock:value=>dock=value};
}
test('private IPC reaches the exact dock without any target discovery or WebSocket',async()=>{const f=fixture(),cdp=new DockCdp(f.client);try{await cdp.connect();assert.equal(await cdp.eval('account'),'signed-in dock');assert.equal(f.attachCount,1);assert.equal(f.commands[0].method,'Runtime.evaluate')}finally{cdp.close();f.cleanup()}assert.equal(f.client.listenerCount('message'),0)});

test('busy Windows desktop may take longer than five seconds to prepare its saved ChatGPT dock',async()=>{
 const f=fixture({prepareDock:()=>new Promise(r=>setTimeout(r,5200))}),cdp=new DockCdp(f.client);
 try{await cdp.connect();assert.equal(await cdp.eval('account'),'signed-in dock')}finally{cdp.close();f.cleanup()}
});
test('Play Store: dock is shown and focused before the private bridge inspects the composer',async()=>{
 let prepared=false;const f=fixture({prepareDock:async()=>{prepared=true}}),cdp=new DockCdp(f.client);
 const attach=f.debuggerApi.attach;f.debuggerApi.attach=()=>{assert.equal(prepared,true);attach()};
 try{await cdp.connect();assert.equal(prepared,true);assert.equal(await cdp.eval('account'),'signed-in dock')}finally{cdp.close();f.cleanup()}
});
test('Play Store: desktop automation opens its ChatGPT view and focuses the usable panel',async()=>{
 const source=fs.readFileSync(new URL('../desktop.cjs',import.meta.url),'utf8'),fn=source.slice(source.indexOf('async function prepareChatGPTAutomation(){'),source.indexOf("app.commandLine.appendSwitch('remote-debugging-port'")),calls=[];
 const context={Date,setTimeout,chatGPTDockVisible:true,chatGPTDock:{getBounds:()=>({width:1280,height:800}),webContents:{focus:()=>calls.push('focus')}},mainWindow:{isDestroyed:()=>false,isMinimized:()=>true,restore:()=>calls.push('restore'),show:()=>calls.push('show'),webContents:{executeJavaScript:async script=>{assert.match(script,/data-nav/);assert.match(script,/scrollIntoView/);calls.push('show chatgpt view')}}}};
 vm.runInNewContext(fn+';this.prepare=prepareChatGPTAutomation;',context);await context.prepare();assert.deepEqual(calls,['restore','show','show chatgpt view','focus']);
});
test('Play Store: collapsed Windows dock is resized before composer inspection',async()=>{
 const f=fixture(),cdp=new DockCdp(f.client),send=f.debuggerApi.sendCommand;
 f.debuggerApi.sendCommand=async(method,params)=>params?.expression==='({width:innerWidth,height:innerHeight})'?{result:{value:{width:1,height:1}}}:send(method,params);
 try{await cdp.connect();assert.deepEqual(f.commands[0],{method:'Emulation.setDeviceMetricsOverride',params:{width:1280,height:800,deviceScaleFactor:1,mobile:false}});assert.equal(await cdp.eval('account'),'signed-in dock')}finally{cdp.close();f.cleanup()}
});
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
  const child={},dock={webContents:{identity:'signed-in'}};const context={stopOrphanServer:async()=>{},healthy:async()=>true,path,root:'/app',process:{env:{KEEP:'yes'}},Date,setTimeout,prepareChatGPTAutomation:async()=>{},recordDownloadEvent:()=>{},chatGPTDock:dock,spawn:(_cmd,_args,opts)=>{options=opts;return child},installDockBridge:(value,opts)=>installed={value,opts}};
  vm.runInNewContext(fn+';this.start=ensureServer;',context);await context.start();assert.deepEqual(Array.from(options.stdio),['ignore','ignore','ignore','ipc']);assert.equal(options.env.YARDMASTER_CHATGPT_DOCK_BRIDGE,'1');assert.equal(options.env.KEEP,'yes');assert.equal(installed.value,child);assert.equal(installed.opts.getDock(),dock.webContents);
});

test('real Node child process serializes the private bridge request and reply',async()=>{
  const {fork}=await import('node:child_process');
  const f=fixture();const child=fork(new URL('fixtures/dock-bridge/transport.mjs',import.meta.url),[],{stdio:['ignore','ignore','pipe','ipc']});let log='';child.stderr.on('data',b=>log+=String(b));
  const cleanup=installDockBridge(child,{getDock:()=>f.wc});
  try{const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('IPC child timed out: '+log)),5000);child.on('message',m=>{if(m.transportResult||m.transportError){clearTimeout(timer);resolve(m)}});child.on('error',e=>{clearTimeout(timer);reject(e)})});assert.equal(result.transportError,undefined);assert.equal(result.transportResult,'signed-in dock')}finally{child.kill();cleanup();f.cleanup()}
});

 test('artifact popup routing keeps same-origin blob ZIPs in the signed-in dock and rejects foreign blobs',async()=>{const {installDockDownloads,artifactURL,safeURL}=await import('../automation/dock-downloads.cjs').then(m=>m.default);let handler,downloaded,external;const wc={setWindowOpenHandler:h=>handler=h,downloadURL:u=>downloaded=u};installDockDownloads(wc,{openExternal:u=>external=u});assert.equal(handler({url:'blob:https://chatgpt.com/owned'}).action,'deny');assert.equal(downloaded,'blob:https://chatgpt.com/owned');assert.equal(external,undefined);assert.equal(artifactURL('blob:https://attacker.example/foreign'),false);assert.equal(artifactURL('https://attacker.example/reply.zip'),false);assert.equal(artifactURL('https://chatgpt.com/backend-api/files/fileid/download?token=secret'),true);assert.equal(safeURL('https://chatgpt.com/backend-api/files/id?token=secret'),'https://chatgpt.com/backend-api/files/id')});
 test('private download target names a nameless blob without accepting other windows or path traversal',async()=>{const f=fixture(),cdp=new DockCdp(f.client);cdp.downloads=path.join(os.tmpdir(),'ym-owned-download');try{await cdp.connect();await assert.rejects(cdp.prepareDownload('../foreign.zip'),/Invalid/);await cdp.prepareDownload('current-complete.zip');let saved;const item={getFilename:()=> 'blob-guid',setSavePath:p=>saved=p};f.session.emit('will-download',{},item,{});assert.equal(saved,undefined);f.session.emit('will-download',{},item,f.wc);assert.equal(saved,path.join(cdp.downloads,'current-complete.zip'))}finally{cdp.close();f.cleanup()}});

 test('Electron transfer events distinguish an active file and an interrupted download from a completed repair',async()=>{const f=fixture(),cdp=new DockCdp(f.client);cdp.downloads=path.join(os.tmpdir(),'ym-owned-transfer');try{await cdp.connect();const item=new EventEmitter();Object.assign(item,{getFilename:()=> 'reply.zip',setSavePath(){},getReceivedBytes:()=>100,getTotalBytes:()=>100});f.session.emit('will-download',{},item,f.wc);await new Promise(r=>setImmediate(r));assert.equal(cdp.downloadPending,true);item.emit('done',{},'interrupted');await new Promise(r=>setImmediate(r));assert.equal(cdp.downloadPending,false);assert.equal(cdp.downloadFailure,'interrupted');const next=new EventEmitter();Object.assign(next,{getFilename:()=> 'reply.zip',setSavePath(){},getReceivedBytes:()=>100,getTotalBytes:()=>100});f.session.emit('will-download',{},next,f.wc);next.emit('done',{},'completed');await new Promise(r=>setImmediate(r));assert.equal(cdp.downloadPending,false);assert.equal(cdp.downloadFailure,null)}finally{cdp.close();f.cleanup()}});

 test('artifact network diagnostics retain the HTTP failure without signed URL tokens or unrelated traffic',async()=>{const events=[],f=fixture({onDownloadState:e=>events.push(e)}),cdp=new DockCdp(f.client);try{await cdp.connect();f.debuggerApi.emit('message',{},'Network.requestWillBeSent',{requestId:'owned',request:{url:'https://chatgpt.com/backend-api/files/id/download?token=secret'}});f.debuggerApi.emit('message',{},'Network.responseReceived',{requestId:'owned',response:{status:403}});assert.equal(events.find(e=>e.event==='artifact-response').status,403);assert.ok(!JSON.stringify(events).includes('secret'));f.debuggerApi.emit('message',{},'Network.requestWillBeSent',{requestId:'other',request:{url:'https://example.com/private'}});f.debuggerApi.emit('message',{},'Network.responseReceived',{requestId:'other',response:{status:400}});assert.equal(events.length,1)}finally{cdp.close();f.cleanup()}});

