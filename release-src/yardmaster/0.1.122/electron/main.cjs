const {app,BrowserWindow,shell}=require('electron');
const path=require('node:path');
const http=require('node:http');
app.setAppUserModelId('com.yardmaster.desktop');
let win;
function waitForServer(timeout=20000){
  const started=Date.now();
  return new Promise((resolve,reject)=>{
    const tick=()=>{
      const req=http.get('http://127.0.0.1:8787/api/status',res=>{res.resume();if(res.statusCode===200)return resolve();setTimeout(tick,250)});
      req.on('error',()=>{if(Date.now()-started>timeout)reject(new Error('Yardmaster local service did not start.'));else setTimeout(tick,250)});
      req.setTimeout(1500,()=>req.destroy());
    };tick();
  });
}
async function createWindow(){
  await waitForServer();
  win=new BrowserWindow({
    title:'Yardmaster',
    icon:path.join(__dirname,'..','assets','yardmaster.png'),
    width:1500,height:920,minWidth:1100,minHeight:680,
    backgroundColor:'#061321',
    autoHideMenuBar:true,
    show:false,
    webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}
  });
  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({url})=>{shell.openExternal(url);return{action:'deny'}});
  await win.loadURL('http://127.0.0.1:8787');
  win.maximize();
  win.show();
}
app.whenReady().then(createWindow).catch(err=>{console.error(err);app.quit()});
app.on('window-all-closed',()=>app.quit());
