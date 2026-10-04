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
function resolvedRepairURL(value,{conversationURL,resolutionURL,filename}){
 try{
  const conversation=new URL(conversationURL),resolution=new URL(resolutionURL),download=new URL(value.download_url);
  const match=conversation.pathname.match(/^\/c\/([a-zA-Z0-9-]+)$/);
  if(conversation.origin!=='https://chatgpt.com'||!match||resolution.origin!==conversation.origin||resolution.pathname!==`/backend-api/conversation/${match[1]}/interpreter/download`)return null;
  if(!filename||value.file_name!==filename||!/^application\/(?:zip|x-zip-compressed)$/i.test(value.mime_type||''))return null;
  if(download.origin!==conversation.origin||download.pathname!=='/backend-api/estuary/content')return null;
  return download.href;
 }catch{return null}
}
module.exports={artifactURL,safeURL,installDockDownloads,resolvedRepairURL};
