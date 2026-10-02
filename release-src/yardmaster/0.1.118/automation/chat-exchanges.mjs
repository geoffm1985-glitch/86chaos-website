import fs from 'node:fs';
import path from 'node:path';

// Only a completed assistant reply consumes an exchange. Streaming polls do not.
export function createChatExchangeBudget({dataDir,assistantBefore=0,url=''}={}){
  const file=dataDir?path.join(dataDir,'chat-handoff','exchanges.json'):null;
  let saved={};try{saved=JSON.parse(fs.readFileSync(file,'utf8'))}catch{}
  const sameChat=saved.url===url;
  let exchanges=sameChat?Math.max(0,Number(saved.exchanges)||0):0;
  let completedAssistant=Number(assistantBefore)||0;
  const persist=()=>{if(file){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify({url,exchanges,updatedAt:new Date().toISOString()},null,2))}};
  return {
    get due(){return exchanges>=2},
    get exchanges(){return exchanges},
    complete(activity){
      if(activity.generating||Number(activity.assistantMessages)<=completedAssistant)return false;
      completedAssistant=Number(activity.assistantMessages);exchanges++;url=activity.href||url;persist();return true;
    },
    reset(nextUrl=''){exchanges=0;completedAssistant=0;url=nextUrl;persist()}
  };
}

export function continuationPrompt(prompt,turns=[],commandResult=''){
  return ['YARDMASTER TWO-EXCHANGE CONTINUATION',
    'Continue the same loop run. Use the attached current handoff ZIP and the context below. Preserve the requested branch, repair scope, tests and version rules. Commands shown as completed must not be executed again. Return ONE COMPLETE APPLICATION ZIP, or the next required YARDMASTER command block.',
    'Original task:\n'+String(prompt||''),
    'Recent exchanges:\n'+(Array.isArray(turns)?turns:[]).map(t=>String(t.role||'assistant')+': '+String(t.text||'').slice(-12000)).join('\n\n'),
    commandResult?'Completed Windows command result:\n'+commandResult:''].filter(Boolean).join('\n\n');
}
