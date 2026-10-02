const {app,BrowserWindow,WebContentsView,ipcMain,shell} = require('electron');
const {spawn} = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {installDockBridge}=require('./automation/chatgpt-dock-bridge.cjs');

let mainWindow = null;
let chatGPTDock = null;
let chatGPTDockVisible = false;
let ownedServer = null;
let quitting = false;
let userInitiatedQuit = false;
const dataRoot=process.env.LOCALAPPDATA?path.join(process.env.LOCALAPPDATA,'Yardmaster'):path.join(os.homedir(),'.yardmaster');
const supervisorStopPath=path.join(dataRoot,'supervisor-stop.json');
const selfHealDir=path.join(dataRoot,'self-heal');
const desktopHealthPath=path.join(selfHealDir,'desktop-health.json');
const lastWindowSnapshotPath=path.join(selfHealDir,'last-window.png');
let snapshotTimer=null,snapshotBusy=false,faulting=false;
function markPlannedStop(reason){try{fs.mkdirSync(dataRoot,{recursive:true});fs.writeFileSync(supervisorStopPath,JSON.stringify({reason,until:Date.now()+2*60*1000},null,2))}catch{}}
function writeDesktopHealth(state='healthy',detail=null){
  try{fs.mkdirSync(selfHealDir,{recursive:true});fs.writeFileSync(desktopHealthPath,JSON.stringify({state,detail,updatedAt:new Date().toISOString(),updatedAtEpochMs:Date.now(),pid:process.pid},null,2))}catch{}
}
async function snapshotWindow(reason='heartbeat'){
  if(snapshotBusy||!mainWindow||mainWindow.isDestroyed())return false;
  snapshotBusy=true;
  try{
    fs.mkdirSync(selfHealDir,{recursive:true});
    const image=await mainWindow.webContents.capturePage();
    if(image&&!image.isEmpty())fs.writeFileSync(lastWindowSnapshotPath,image.toPNG());
    writeDesktopHealth('healthy',{reason});
    return true;
  }catch(error){
    writeDesktopHealth('snapshot-error',{reason,error:String(error?.message||error)});
    return false;
  }finally{snapshotBusy=false}
}
function recordDesktopFault(reason,detail=null){
  if(faulting||quitting||userInitiatedQuit)return;
  faulting=true;
  writeDesktopHealth('fault',{reason,detail});
  const exit=()=>{try{app.exit(2)}catch{process.exit(2)}};
  const fallback=setTimeout(exit,2500);fallback.unref?.();
  snapshotWindow(reason).finally(()=>{clearTimeout(fallback);exit()});
}
const root = __dirname;
const url = 'http://127.0.0.1:8787';
function safeDockBounds(bounds={}){
  const num=v=>Math.max(0,Math.round(Number(v)||0));
  return {x:num(bounds.x),y:num(bounds.y),width:Math.max(1,num(bounds.width)),height:Math.max(1,num(bounds.height))};
}
function hideChatGPTDock(){
  chatGPTDockVisible=false;
  // Off-window bounds are clipped to a 1px renderer on Windows. Hide the
  // native view while keeping a usable viewport for background handoffs.
  try{chatGPTDock?.setVisible(false);chatGPTDock?.setBounds({x:0,y:0,width:1280,height:800})}catch{}
}
function createChatGPTDock(){
  if(!mainWindow||mainWindow.isDestroyed()||chatGPTDock)return;
  chatGPTDock=new WebContentsView({webPreferences:{partition:'persist:yardmaster-chatgpt-dock',contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  chatGPTDock.webContents.setWindowOpenHandler(({url})=>{try{const u=new URL(url);if(/^https?:$/.test(u.protocol)){setTimeout(()=>chatGPTDock?.webContents.loadURL(url).catch(()=>{}),0);return{action:'deny'}}shell.openExternal(url)}catch{}return{action:'deny'}});
  mainWindow.contentView.addChildView(chatGPTDock);
  hideChatGPTDock();
  chatGPTDock.webContents.loadURL('https://chatgpt.com/').catch(()=>{});
}
function layoutChatGPTDock(payload={}){
  if(!chatGPTDock)createChatGPTDock();
  if(!chatGPTDock)return;
  if(!payload.visible){hideChatGPTDock();return}
  const bounds=safeDockBounds(payload.bounds||{});
  if(bounds.width<40||bounds.height<40){hideChatGPTDock();return}
  chatGPTDockVisible=true;
  chatGPTDock.setBounds(bounds);
  chatGPTDock.setVisible(true);
}
ipcMain.on('yardmaster:chatgpt-dock',(_event,payload)=>layoutChatGPTDock(payload));
ipcMain.on('yardmaster:chatgpt-reload',()=>{try{chatGPTDock?.webContents.reload()}catch{}});
ipcMain.on('yardmaster:chatgpt-home',()=>{try{chatGPTDock?.webContents.loadURL('https://chatgpt.com/')}catch{}});

async function prepareChatGPTAutomation(){
  if(!mainWindow||mainWindow.isDestroyed())throw new Error('Yardmaster desktop is still starting.');
  if(mainWindow.isMinimized())mainWindow.restore();
  mainWindow.show();
  await mainWindow.webContents.executeJavaScript(`(()=>{document.querySelector('[data-nav="chatgpt"]')?.click();document.querySelector('#chatgptDockHost')?.scrollIntoView({block:'start'});})()`,true);
  const deadline=Date.now()+3000;
  while(Date.now()<deadline){
    const bounds=chatGPTDock?.getBounds();
    if(chatGPTDockVisible&&bounds?.width>=320&&bounds?.height>=240){chatGPTDock.webContents.focus();return}
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  throw new Error('Yardmaster could not show its ChatGPT panel for automation.');
}


app.commandLine.appendSwitch('remote-debugging-port','9224');
app.commandLine.appendSwitch('remote-debugging-address','127.0.0.1');
app.setName('Yardmaster');
const YARDMASTER_APP_ID='com.chiltonappworks.yardmaster';
app.setAppUserModelId(YARDMASTER_APP_ID);

const gotLock=app.requestSingleInstanceLock();
if(!gotLock){app.quit();}

function request(method,pathname,body){
  return new Promise(resolve=>{
    const data=body?Buffer.from(JSON.stringify(body)) : null;
    const req=http.request(url+pathname,{
      method,
      headers:data?{'Content-Type':'application/json','Content-Length':data.length}:{}
    },res=>{res.resume();res.on('end',()=>resolve(res.statusCode||0));});
    req.setTimeout(1500,()=>{req.destroy();resolve(0)});
    req.on('error',()=>resolve(0));
    if(data)req.write(data);
    req.end();
  });
}
async function healthy(){
  return (await request('GET','/api/status'))===200;
}
async function stopOrphanServer(){
  if(!(await healthy()))return;
  await request('POST','/api/action',{action:'shutdown-operator'});
  const deadline=Date.now()+7000;
  while(Date.now()<deadline){
    if(!(await healthy()))return;
    await new Promise(r=>setTimeout(r,200));
  }
}
async function ensureServer(){
  await stopOrphanServer();
  ownedServer=spawn('node.exe',[path.join(root,'server.mjs')],{
    cwd:root,windowsHide:true,stdio:['ignore','ignore','ignore','ipc'],
    env:{...process.env,YARDMASTER_CHATGPT_DOCK_REQUIRED:'1',YARDMASTER_CHATGPT_DOCK_PORT:'9224',YARDMASTER_CHATGPT_DOCK_BRIDGE:'1'}
  });
  installDockBridge(ownedServer,{getDock:()=>chatGPTDock?.webContents,prepareDock:prepareChatGPTAutomation,onViewport:layout=>{try{fs.writeFileSync(path.join(selfHealDir,'chatgpt-layout.json'),JSON.stringify({...layout,native:chatGPTDock?.getBounds(),window:mainWindow?.getContentBounds(),updatedAt:new Date().toISOString()}))}catch{}}});
  const deadline=Date.now()+15000;
  while(Date.now()<deadline){
    if(await healthy()) return;
    await new Promise(r=>setTimeout(r,250));
  }
  throw new Error('Yardmaster local operator did not start.');
}
async function createWindow(){
  await ensureServer();
  mainWindow=new BrowserWindow({
    title:'Yardmaster',
    width:1600,
    height:940,
    minWidth:1100,
    minHeight:700,
    show:false,
    autoHideMenuBar:true,
    backgroundColor:'#061321',
    icon:path.join(root,'public','yardmaster-icon.ico'),
    webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false,preload:path.join(root,'preload.cjs')}
  });
  mainWindow.removeMenu();
  mainWindow.on('unresponsive',()=>recordDesktopFault('renderer-unresponsive'));
  mainWindow.webContents.on('render-process-gone',(_event,details)=>recordDesktopFault('renderer-process-gone',{reason:details?.reason||null,exitCode:details?.exitCode??null}));
  mainWindow.webContents.on('did-fail-load',(_event,errorCode,errorDescription,validatedURL,isMainFrame)=>{if(isMainFrame)recordDesktopFault('main-frame-load-failed',{errorCode,errorDescription,validatedURL})});
  await mainWindow.loadURL(url);
  mainWindow.maximize();
  mainWindow.show();
  createChatGPTDock();
  await snapshotWindow('window-ready');
  snapshotTimer=setInterval(()=>snapshotWindow('heartbeat').catch(()=>{}),15000);snapshotTimer.unref?.();
}
async function shutdownOwnedServer(){
  await request('POST','/api/action',{action:'shutdown-operator'}).catch(()=>0);
  const deadline=Date.now()+3500;
  while(Date.now()<deadline){
    if(!(await healthy()))break;
    await new Promise(r=>setTimeout(r,150));
  }
  if(ownedServer && !ownedServer.killed){try{ownedServer.kill()}catch{}}
  ownedServer=null;
}

app.on('second-instance',()=>{
  if(mainWindow){
    if(mainWindow.isMinimized())mainWindow.restore();
    mainWindow.focus();
  }
});
app.whenReady().then(createWindow).catch(err=>{
  const {dialog}=require('electron');
  dialog.showErrorBox('Yardmaster could not start',err.message||String(err));
  app.quit();
});
app.on('window-all-closed',()=>{userInitiatedQuit=true;markPlannedStop('user-close');app.quit()});
app.on('before-quit',event=>{
  if(snapshotTimer){clearInterval(snapshotTimer);snapshotTimer=null}
  try{chatGPTDock?.webContents.close()}catch{}chatGPTDock=null;
  if(userInitiatedQuit)markPlannedStop('user-close');
  if(quitting)return;
  event.preventDefault();
  quitting=true;
  shutdownOwnedServer().finally(()=>app.exit(0));
});
