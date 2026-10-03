const {contextBridge,ipcRenderer}=require('electron');

function normalizeBounds(bounds={}){
  const n=v=>Math.max(0,Math.round(Number(v)||0));
  return {x:n(bounds.x),y:n(bounds.y),width:n(bounds.width),height:n(bounds.height)};
}
contextBridge.exposeInMainWorld('yardmasterDesktop',{
  setChatGPTDock({visible,bounds}={}){ipcRenderer.send('yardmaster:chatgpt-dock',{visible:!!visible,bounds:normalizeBounds(bounds)});},
  reloadChatGPTDock(){ipcRenderer.send('yardmaster:chatgpt-reload');},
  navigateChatGPTHome(){ipcRenderer.send('yardmaster:chatgpt-home');}
});
