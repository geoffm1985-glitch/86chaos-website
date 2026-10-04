// Keep artifact popups in the signed-in dock's session instead of handing
// blob URLs to Windows or replacing the saved repair conversation.
function artifactURL(value){
  try{const u=new URL(value);if(u.protocol==='blob:')return new URL(u.pathname).origin==='https://chatgpt.com';return u.protocol==='https:'&&((['chatgpt.com','www.chatgpt.com'].includes(u.hostname)&&(/^\/backend-api\/files\//.test(u.pathname)||/\.zip$/i.test(u.pathname)))||u.hostname.endsWith('.oaiusercontent.com'))}catch{return false}
}
function safeURL(value){try{const u=new URL(value);return u.protocol==='blob:'?'blob:'+new URL(u.pathname).origin:u.origin+u.pathname}catch{return 'invalid'}}
function installDockDownloads(wc,{openExternal,onEvent=()=>{}}){
 wc.setWindowOpenHandler(({url})=>{
  if(artifactURL(url)){onEvent({event:'artifact-popup',url:safeURL(url)});try{wc.downloadURL(url)}catch(e){onEvent({event:'artifact-popup-error',error:String(e.message||e)})}return {action:'deny'}}
  try{const u=new URL(url);if(/^https?:$/.test(u.protocol)){setTimeout(()=>wc.loadURL(url).catch(()=>{}),0);return {action:'deny'}}if(!['blob:','sandbox:','javascript:','data:'].includes(u.protocol))openExternal?.(url)}catch{}
  return {action:'deny'};
 });
}
module.exports={artifactURL,safeURL,installDockDownloads};
