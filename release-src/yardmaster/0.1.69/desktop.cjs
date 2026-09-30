const {app,BrowserWindow} = require('electron');
const {spawn} = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

let mainWindow = null;
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

app.setName('Yardmaster');
app.setAppUserModelId('com.chiltonappworks.yardmaster');

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
    cwd:root,windowsHide:true,stdio:'ignore'
  });
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
    webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false}
  });
  mainWindow.removeMenu();
  mainWindow.on('unresponsive',()=>recordDesktopFault('renderer-unresponsive'));
  mainWindow.webContents.on('render-process-gone',(_event,details)=>recordDesktopFault('renderer-process-gone',{reason:details?.reason||null,exitCode:details?.exitCode??null}));
  mainWindow.webContents.on('did-fail-load',(_event,errorCode,errorDescription,validatedURL,isMainFrame)=>{if(isMainFrame)recordDesktopFault('main-frame-load-failed',{errorCode,errorDescription,validatedURL})});
  await mainWindow.loadURL(url);
  mainWindow.maximize();
  mainWindow.show();
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
  if(userInitiatedQuit)markPlannedStop('user-close');
  if(quitting)return;
  event.preventDefault();
  quitting=true;
  shutdownOwnedServer().finally(()=>app.exit(0));
});
