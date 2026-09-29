const {app,BrowserWindow} = require('electron');
const {spawn} = require('child_process');
const http = require('http');
const path = require('path');

let mainWindow = null;
let ownedServer = null;
let quitting = false;
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
  await mainWindow.loadURL(url);
  mainWindow.maximize();
  mainWindow.show();
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
app.on('window-all-closed',()=>{app.quit()});
app.on('before-quit',event=>{
  if(quitting)return;
  event.preventDefault();
  quitting=true;
  shutdownOwnedServer().finally(()=>app.exit(0));
});
