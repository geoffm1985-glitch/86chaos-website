const fs=require('node:fs');
const path=require('node:path');
// Capture the owned ChatGPT WebContents, preserving its current visibility and draft.
async function captureChatGPTSnapshot(contents,file){
 if(!contents||contents.isDestroyed())return false;
 const image=await contents.capturePage(undefined,{stayHidden:true,stayAwake:true});
 if(!image||image.isEmpty())return false;
 fs.mkdirSync(path.dirname(file),{recursive:true});
 const pending=file+'.tmp';fs.writeFileSync(pending,image.toPNG());fs.renameSync(pending,file);return true;
}
module.exports={captureChatGPTSnapshot};
