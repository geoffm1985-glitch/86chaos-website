const {app,BrowserWindow,WebContentsView}=require('electron');
const {spawn}=require('node:child_process');
const path=require('node:path');
const {installDockBridge}=require('../../../automation/chatgpt-dock-bridge.cjs');
const {installDockDownloads}=require('../../../automation/dock-downloads.cjs');
app.setPath('userData',process.env.YM_FIXTURE_DIR);
let dock,child,window;let next=0;
app.whenReady().then(async()=>{
 window=new BrowserWindow({show:true,width:1000,height:800,webPreferences:{nodeIntegration:false,contextIsolation:true}});
 await window.loadURL('data:text/html,<h1>Yardmaster dock fixture</h1>');
 dock=new WebContentsView({webPreferences:{partition:'persist:yardmaster-chatgpt-dock',contextIsolation:true,nodeIntegration:false,sandbox:true}});
 window.contentView.addChildView(dock);dock.setBounds({x:0,y:60,width:1000,height:700});
 dock.webContents.session.protocol.handle('https',()=>new Response(`<!doctype html><title>ChatGPT fixture</title><button>Signed-in account</button><button aria-label="Switch mode, current mode: ChatGPT" onclick="window.wrongModeOpened=true">ChatGPT</button><button>Chat</button><button>Work</button><form><div id="prompt-textarea" contenteditable="true" style="width:280px">preserved draft</div><button type="button">Add files</button><input id="upload" type="file"><button type="button">High</button><button type="submit" data-testid="send-button">Send</button></form><script>localStorage.setItem("fixture-account","saved-account");document.querySelector('form').onsubmit=e=>{e.preventDefault();const input=document.querySelector('#prompt-textarea'),message=document.createElement('div');message.dataset.messageAuthorRole='user';message.textContent=input.textContent;document.body.append(message);input.textContent=''}</script>`,{headers:{'content-type':'text/html'}}));
 installDockDownloads(dock.webContents,{openExternal:()=>{}});
 await dock.webContents.loadURL('https://chatgpt.com/');
 child=spawn(process.execPath,[path.join(__dirname,'operator.mjs')],{stdio:['ignore','ignore','pipe','ipc'],env:{...process.env,ELECTRON_RUN_AS_NODE:'1',YARDMASTER_CHATGPT_DOCK_REQUIRED:'1',YARDMASTER_CHATGPT_DOCK_BRIDGE:'1'}});
 installDockBridge(child,{getDock:()=>dock.webContents,prepareDock:async()=>{dock.setBounds({x:0,y:60,width:1000,height:700});dock.setVisible(true);dock.webContents.focus()}});
 global.exerciseDock=(file,operation='exercise')=>new Promise((resolve,reject)=>{const id=++next,timer=setTimeout(()=>{child.off('message',listener);reject(new Error('Fixture operator did not answer'))},45000);function listener(m){if(m?.fixtureResult&&m.id===id){clearTimeout(timer);child.off('message',listener);resolve(m)}}child.on('message',listener);child.send({operation,id,file})});
 global.reloadDock=()=>new Promise(resolve=>{dock.webContents.once('did-finish-load',resolve);dock.webContents.reload()});
 global.hideProductionDock=()=>{
  const fs=require('node:fs'),vm=require('node:vm');
  const source=fs.readFileSync(path.join(__dirname,'../../../desktop.cjs'),'utf8');
  const fn=source.slice(source.indexOf('function hideChatGPTDock(){'),source.indexOf('function createChatGPTDock(){'));
  vm.runInNewContext(fn+';hideChatGPTDock();',{chatGPTDock:dock});
 };
 global.hiddenDockGeometry=()=>({visible:dock.getVisible(),bounds:dock.getBounds()});
 global.collapseDock=()=>dock.setBounds({x:0,y:0,width:1,height:1});
 global.setupDownload=async mode=>{await dock.webContents.executeJavaScript(`document.body.innerHTML='<main><button id="repair">Download current-complete.zip</button></main><form><textarea id="prompt-textarea"></textarea></form>';if(${JSON.stringify(mode)}==='span'){const span=document.createElement('span');span.id='repair';span.role='button';span.tabIndex=0;span.textContent='Download current-complete.zip';document.querySelector('#repair').replaceWith(span)}window.downloadClicks=0;document.querySelector('#repair').onclick=e=>{window.activationGesture=navigator.userActivation.isActive;window.activationTrusted=e.isTrusted;window.downloadClicks++;const blob=new Blob([Uint8Array.from(atob('UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA=='),c=>c.charCodeAt(0))],{type:'application/zip'});const url=URL.createObjectURL(blob);if(${JSON.stringify(mode)}==='popup')window.open(url);else{const a=document.createElement('a');a.href=url;a.download='current-complete.zip';a.click()}};true`)};
 global.setupFailedFetchDownload=async()=>{
  let transfers=0;
  await dock.webContents.session.protocol.unhandle('https');
  dock.webContents.session.protocol.handle('https',request=>{
   const url=new URL(request.url);
   if(url.pathname.endsWith('/interpreter/download'))return Response.json({file_name:'current-complete.zip',mime_type:'application/zip',download_url:'https://chatgpt.com/backend-api/estuary/content?id=selected'});
   if(url.pathname==='/backend-api/estuary/content'){
    transfers++;
    if(transfers===1)return new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array([80,75]));setTimeout(()=>controller.error(new Error('fixture failed renderer fetch')),100)}}),{headers:{'content-type':'application/zip'}});
    return new Response(Buffer.from('UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==','base64'),{headers:{'content-type':'application/zip','content-disposition':'attachment; filename="current-complete.zip"'}});
   }
   return new Response('<main><button id="repair">Download current-complete.zip</button></main><form><textarea id="prompt-textarea"></textarea></form><script>document.querySelector("#repair").onclick=async()=>{const r=await fetch("/backend-api/conversation/fixture-id/interpreter/download"),j=await r.json();try{await(await fetch(j.download_url)).arrayBuffer()}catch{window.previewFailed=true}}</script>',{headers:{'content-type':'text/html'}});
  });
  await dock.webContents.loadURL('https://chatgpt.com/c/fixture-id');
  global.failedFetchTransferCount=()=>transfers;
 };
 global.downloadActivation=()=>dock.webContents.executeJavaScript('({gesture:window.activationGesture,trusted:window.activationTrusted,clicks:window.downloadClicks})');
 global.downloadConversation=()=>dock.webContents.getURL();
 global.dockReady=true;
 global.captureChatGPTFixture=async file=>{const {captureChatGPTSnapshot}=require('../../../automation/chatgpt-snapshot.cjs');const visible=dock.getVisible(),viewport=await dock.webContents.executeJavaScript('({width:innerWidth,height:innerHeight})');await captureChatGPTSnapshot(dock.webContents,file);const image=require('electron').nativeImage.createFromPath(file);return {size:image.getSize(),viewport,visibleBefore:visible,visibleAfter:dock.getVisible(),bounds:dock.getBounds()}};
});
app.on('before-quit',()=>{try{child?.kill()}catch{}});
