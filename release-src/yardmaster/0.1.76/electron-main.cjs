const {app,BrowserWindow}=require('electron');
const path=require('path');

app.setName('Yardmaster');
app.setAppUserModelId('com.yardmaster.desktop');

let win;
function createWindow(){
  const iconPath=path.join(__dirname,'public','yardmaster.ico');
  win=new BrowserWindow({
    width:1600,
    height:960,
    minWidth:1100,
    minHeight:700,
    backgroundColor:'#061321',
    autoHideMenuBar:true,
    icon:iconPath,
    title:'Yardmaster',
    webPreferences:{
      contextIsolation:true,
      nodeIntegration:false,
      sandbox:true
    }
  });
  win.loadURL('http://127.0.0.1:8787');
  win.maximize();
}
app.whenReady().then(createWindow);
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
