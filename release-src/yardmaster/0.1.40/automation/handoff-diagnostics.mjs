import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function scrubString(value){
  return String(value??'')
    .replace(/C:\\Users\\[^\\\s]+/gi,'C:\\Users\\[USER]')
    .replace(/\/Users\/[^/\s]+/g,'/Users/[USER]')
    .replace(/\/home\/[^/\s]+/g,'/home/[USER]')
    .replace(/(authorization\s*:\s*bearer\s+)[^\s]+/ig,'$1[REDACTED]')
    .replace(/\b(gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{25,}|sk-[A-Za-z0-9_-]{20,})\b/g,'[REDACTED]')
    .slice(0,1000);
}
function scrub(value,key=''){
  if(value===null||value===undefined||typeof value==='boolean'||typeof value==='number')return value;
  if(typeof value==='string'){
    if(/path$/i.test(key)||/file$/i.test(key))return path.basename(value);
    return scrubString(value);
  }
  if(Array.isArray(value))return value.slice(0,40).map(v=>scrub(v,key));
  if(typeof value==='object'){
    const out={};
    for(const [k,v] of Object.entries(value))out[k]=scrub(v,k);
    return out;
  }
  return scrubString(value);
}
function crc32(buffer){
  let crc=0xffffffff;
  for(const byte of buffer){
    crc^=byte;
    for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  return (crc^0xffffffff)>>>0;
}
function dosDateTime(){
  const d=new Date();
  const year=Math.max(1980,d.getFullYear()),month=d.getMonth()+1,day=d.getDate(),hour=d.getHours(),minute=d.getMinutes(),second=d.getSeconds();
  return {time:(hour<<11)|(minute<<5)|(second>>1),date:((year-1980)<<9)|(month<<5)|day};
}
function storedZip(entries){
  const local=[],central=[];let offset=0;
  const {time,date}=dosDateTime();
  for(const entry of entries){
    const name=String(entry.name).replace(/\\/g,'/'),data=Buffer.isBuffer(entry.data)?entry.data:Buffer.from(String(entry.data),'utf8'),nameBuf=Buffer.from(name,'utf8'),crc=crc32(data);
    const l=Buffer.alloc(30);l.writeUInt32LE(0x04034b50,0);l.writeUInt16LE(20,4);l.writeUInt16LE(0x0800,6);l.writeUInt16LE(0,8);l.writeUInt16LE(time,10);l.writeUInt16LE(date,12);l.writeUInt32LE(crc,14);l.writeUInt32LE(data.length,18);l.writeUInt32LE(data.length,22);l.writeUInt16LE(nameBuf.length,26);l.writeUInt16LE(0,28);
    local.push(l,nameBuf,data);
    const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x0800,8);c.writeUInt16LE(0,10);c.writeUInt16LE(time,12);c.writeUInt16LE(date,14);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(nameBuf.length,28);c.writeUInt16LE(0,30);c.writeUInt16LE(0,32);c.writeUInt16LE(0,34);c.writeUInt16LE(0,36);c.writeUInt32LE(0,38);c.writeUInt32LE(offset,42);
    central.push(c,nameBuf);
    offset+=30+nameBuf.length+data.length;
  }
  const centralBuffer=Buffer.concat(central),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(0,4);end.writeUInt16LE(0,6);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(centralBuffer.length,12);end.writeUInt32LE(offset,16);end.writeUInt16LE(0,20);
  return Buffer.concat([...local,centralBuffer,end]);
}
function safeName(value){return String(value||'').replace(/[^A-Za-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)}
function cleanHref(value){try{const u=new URL(String(value));return u.origin+u.pathname}catch{return scrubString(value)}}

export function createHandoffDiagnostics(dataDir,metadata={}){
  const root=path.join(dataDir||process.cwd(),'handoff-diagnostics');fs.mkdirSync(root,{recursive:true});
  const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z'),id=stamp+'-'+crypto.randomBytes(3).toString('hex');
  const base='Yardmaster-Handoff-Diagnostic-'+id,tracePath=path.join(root,base+'.json'),shotPath=path.join(root,base+'-composer.png'),zipPath=path.join(root,base+'.zip');
  const trace=[];let lastStage='created',screenshotSaved=false,closed=false;
  const meta=scrub({
    version:metadata.version||null,
    mode:metadata.mode||null,
    model:metadata.model||null,
    thinkingEffort:metadata.thinkingEffort||null,
    artifactName:metadata.artifactPath?path.basename(metadata.artifactPath):metadata.artifactName||null,
    artifactSize:metadata.artifactPath&&fs.existsSync(metadata.artifactPath)?fs.statSync(metadata.artifactPath).size:metadata.artifactSize||null,
    promptLength:String(metadata.prompt||'').length
  });
  const flush=()=>fs.writeFileSync(tracePath,JSON.stringify({id,createdAt:trace[0]?.at||new Date().toISOString(),metadata:meta,events:trace},null,2)+'\n','utf8');
  const record=(stage,detail={})=>{
    if(closed)return;
    lastStage=String(stage||lastStage);
    trace.push({at:new Date().toISOString(),stage:lastStage,...scrub(detail)});
    flush();
  };
  const snapshot=async(cdp,label='snapshot')=>{
    if(!cdp)return null;
    const state=await cdp.eval(`/*YM_DIAGNOSTIC_SNAPSHOT*/(()=>{const composer=document.querySelector('#prompt-textarea, textarea, [contenteditable="true"][data-testid*="composer"], [contenteditable="true"]');const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};const rect=e=>{const r=e.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)}};const label=e=>(e.getAttribute('aria-label')||e.getAttribute('title')||e.getAttribute('data-testid')||e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,140);if(!composer)return {href:location.origin+location.pathname,readyState:document.readyState,composer:null,userMessages:document.querySelectorAll('[data-message-author-role="user"]').length,assistantMessages:document.querySelectorAll('[data-message-author-role="assistant"]').length};const scope=composer.closest('form')||composer.closest('[data-testid*="composer"]')||composer.parentElement?.parentElement?.parentElement||document;const buttons=[...scope.querySelectorAll('button,[role="button"]')].filter(visible).slice(0,30).map(e=>{const r=e.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,top=document.elementFromPoint(cx,cy);return {label:label(e),testid:e.getAttribute('data-testid')||'',type:e.getAttribute('type')||'',disabled:!!e.disabled,ariaDisabled:e.getAttribute('aria-disabled')||'',rect:rect(e),topTag:top?.tagName||'',topTestid:top?.getAttribute?.('data-testid')||'',topIsSelf:top===e||e.contains(top)}});const attachments=[...scope.querySelectorAll('[data-testid*="attachment"],[data-testid*="file"],[aria-busy="true"],[role="progressbar"]')].filter(visible).slice(0,20).map(e=>({label:label(e),testid:e.getAttribute('data-testid')||'',ariaBusy:e.getAttribute('aria-busy')||'',rect:rect(e)}));const text=(composer instanceof HTMLTextAreaElement||composer instanceof HTMLInputElement?composer.value:(composer.innerText||composer.textContent||''));return {href:location.origin+location.pathname,readyState:document.readyState,composer:{tag:composer.tagName,id:composer.id||'',contenteditable:composer.getAttribute('contenteditable')||'',textLength:text.length,rect:rect(composer)},fileInputCount:scope.querySelectorAll('input[type=file]').length,buttons,attachments,userMessages:document.querySelectorAll('[data-message-author-role="user"]').length,assistantMessages:document.querySelectorAll('[data-message-author-role="assistant"]').length}})()`,7000).catch(error=>({snapshotError:scrubString(error?.message||error)}));
    if(state?.href)state.href=cleanHref(state.href);
    record('browser-snapshot',{label,state});
    if(!screenshotSaved){
      try{
        const clip=await cdp.eval(`/*YM_DIAGNOSTIC_CLIP*/(()=>{const e=document.querySelector('#prompt-textarea, textarea, [contenteditable="true"][data-testid*="composer"], [contenteditable="true"]');if(!e)return null;const scope=e.closest('form')||e.closest('[data-testid*="composer"]')||e.parentElement?.parentElement?.parentElement||e;const r=scope.getBoundingClientRect(),x=Math.max(0,r.left-16),y=Math.max(0,r.top-90),right=Math.min(innerWidth,r.right+16),bottom=Math.min(innerHeight,r.bottom+16);return {x:x+scrollX,y:y+scrollY,width:Math.max(1,right-x),height:Math.max(1,Math.min(650,bottom-y)),scale:1}})()`,5000).catch(()=>null);
        if(clip?.width&&clip?.height){
          const shot=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,clip},8000);
          if(shot?.data){fs.writeFileSync(shotPath,Buffer.from(shot.data,'base64'));screenshotSaved=true;record('composer-screenshot',{saved:true,width:clip.width,height:clip.height})}
        }
      }catch(error){record('composer-screenshot',{saved:false,error:scrubString(error?.message||error)})}
    }
    return state;
  };
  const fail=async(error,cdp)=>{
    const failureStage=lastStage;
    record('failure',{failureStage,errorName:error?.name||'Error',message:error?.message||String(error)});
    await snapshot(cdp,'failure').catch(()=>null);
    flush();
    const entries=[{name:'handoff-trace.json',data:fs.readFileSync(tracePath)}];
    if(screenshotSaved&&fs.existsSync(shotPath))entries.push({name:'composer-failure.png',data:fs.readFileSync(shotPath)});
    fs.writeFileSync(zipPath,storedZip(entries));
    closed=true;
    return {id,name:path.basename(zipPath),path:zipPath,stage:failureStage,error:scrubString(error?.message||error),hasScreenshot:screenshotSaved};
  };
  const success=()=>{
    record('success',{});
    closed=true;
    try{fs.rmSync(tracePath,{force:true})}catch{}
    try{fs.rmSync(shotPath,{force:true})}catch{}
  };
  record('diagnostics-created',{});
  return {id,record,snapshot,fail,success,get lastStage(){return lastStage}};
}
