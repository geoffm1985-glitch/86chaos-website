import {__testHooks} from '../../../automation/chatgpt.mjs';
process.on('message',async m=>{
 if(!['exercise','manual','handoff'].includes(m?.operation))return;
 let cdp;
 try{
  const result=await __testHooks.launch(process.env.YM_FIXTURE_DIR);cdp=result.cdp;
  const ready=m.operation==='manual'?await __testHooks.prepareManualChat(cdp):await __testHooks.waitHandoffComposerReady(cdp,4000);
  const account=await cdp.eval('localStorage.getItem("fixture-account")');let uploaded;
  if(m.operation!=='manual'){
   await cdp.send('DOM.enable');const {root}=await cdp.send('DOM.getDocument');
   const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'#upload'});
   await cdp.send('DOM.setFileInputFiles',{nodeId,files:[m.file]});
   uploaded=await cdp.eval('document.querySelector("#upload").files[0].name');
  }
  let sent=false,selection=false;
  if(m.operation==='handoff'){
   selection=await __testHooks.chooseModeAndModel(cdp,'Chat','GPT-5.6 Sol');
   if(!selection)throw new Error('Chat mode was shadowed');
   if(!await __testHooks.chooseThinkingEffort(cdp,'High'))throw new Error('High effort was not selected');
   await __testHooks.sendPrompt(cdp,'YARDMASTER REAL ELECTRON HANDOFF '+('wrapped instructions '.repeat(30)),null,{requiredAttachmentName:'preserved-handoff.zip',sendTimeoutMs:10000,confirmMs:1500});
   sent=await cdp.eval(`document.querySelectorAll('[data-message-author-role="user"]').length===1&&!window.wrongModeOpened`);
  }
  const draft=await __testHooks.manualComposerText(cdp);
  process.send({fixtureResult:true,id:m.id,ok:true,ready,account,uploaded,draft,sent,selection,docked:result.docked,port:result.port});
 }catch(error){process.send({fixtureResult:true,id:m.id,ok:false,error:String(error.stack||error)})}finally{cdp?.close()}
});
