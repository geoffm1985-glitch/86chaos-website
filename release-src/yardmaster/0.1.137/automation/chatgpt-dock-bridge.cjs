// Private parent/child IPC transport to the exact Electron ChatGPT WebContents.
// No renderer API or localhost debugging port is used by desktop handoffs.
const path=require('node:path');
const {artifactURL,safeURL}=require('./dock-downloads.cjs');
const CHANNEL='yardmaster-chatgpt-dock-v1';
let nextSession=0;
class DockCdp {
  constructor(transport=process){this.transport=transport;this.session=`${process.pid}-${++nextSession}`;this.id=0;this.pending=new Map();this.eventWaiters=new Map();this.open=false;this.downloads=null;this.downloadPending=false;this.downloadFailure=null;this.url='electron:yardmaster-chatgpt-dock'}
  rejectPending(error){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error)}this.pending.clear();for(const list of this.eventWaiters.values())for(const p of list){clearTimeout(p.timer);p.reject(error)}this.eventWaiters.clear()}
  async connect(){
    if(this.open)return;
    if(typeof this.transport.send!=='function'||this.transport.connected===false)throw new Error('Desktop IPC connection is unavailable. Restart Yardmaster.');
    this.onMessage=m=>{if(m?.channel!==CHANNEL||m.session!==this.session)return;if(m.method==='Yardmaster.downloadState'){if(m.params?.event==='download-start'){this.downloadPending=true;this.downloadFailure=null}if(m.params?.event==='download-done'){this.downloadPending=false;this.downloadFailure=m.params.state==='completed'?null:m.params.state}return}if(m.method){const list=this.eventWaiters.get(m.method);if(list?.length){const p=list.shift();clearTimeout(p.timer);p.resolve(m.params||{});if(!list.length)this.eventWaiters.delete(m.method)}return}const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error)):p.resolve(m.result)};
    this.onDisconnect=()=>{this.rejectPending(new Error('Yardmaster desktop disconnected.'));this.close()};
    this.transport.on('message',this.onMessage);this.transport.on('disconnect',this.onDisconnect);this.open=true;
    try{await this.request('connect',{downloads:this.downloads},30000)}catch(error){this.close();throw error}
  }
  request(operation,params={},timeoutMs=12000){
    if(!this.open)return Promise.reject(new Error('Desktop dock connection is not open.'));
    const id=++this.id;
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Desktop dock command timed out: '+operation))},timeoutMs);this.pending.set(id,{resolve,reject,timer});try{this.transport.send({channel:CHANNEL,session:this.session,id,operation,params},error=>{if(error){const p=this.pending.get(id);if(p){clearTimeout(p.timer);this.pending.delete(id);p.reject(error)}}})}catch(error){clearTimeout(timer);this.pending.delete(id);reject(error)}});
  }
  prepareDownload(filename){return this.request('download-target',{filename})}
  send(method,params={},timeoutMs=12000){return this.request('command',{method,params},timeoutMs)}
  async eval(expression,timeoutMs=12000){const r=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true},timeoutMs);if(r.exceptionDetails)throw new Error(r.exceptionDetails.text||'Browser script failed.');return r.result?.value}
  waitEvent(method,timeoutMs=5000){return new Promise((resolve,reject)=>{const waiter={resolve,reject,timer:null};waiter.timer=setTimeout(()=>{const list=this.eventWaiters.get(method)||[];const i=list.indexOf(waiter);if(i>=0)list.splice(i,1);if(!list.length)this.eventWaiters.delete(method);reject(new Error('Desktop dock event timed out: '+method))},timeoutMs);const list=this.eventWaiters.get(method)||[];list.push(waiter);this.eventWaiters.set(method,list)})}
  close(){if(!this.open)return;this.open=false;this.rejectPending(new Error('Desktop dock connection closed.'));this.transport.removeListener('message',this.onMessage);this.transport.removeListener('disconnect',this.onDisconnect);try{this.transport.send({channel:CHANNEL,session:this.session,operation:'close'},()=>{})}catch{}}
}
function installDockBridge(child,{getDock,prepareDock=async()=>{},onViewport=()=>{},onDownloadState=()=>{}}){
  const sessions=new Map(),artifactRequests=new Map();let bound=null;
  const reply=m=>{if(child.connected!==false)try{child.send({channel:CHANNEL,...m},()=>{})}catch{}};
  const onEvent=(_event,method,params)=>{if(method==='Network.requestWillBeSent'&&artifactURL(params.request?.url)){if(artifactRequests.size>=50)artifactRequests.clear();artifactRequests.set(params.requestId,safeURL(params.request.url))}if(method==='Network.responseReceived'&&artifactRequests.has(params.requestId))onDownloadState({event:'artifact-response',url:artifactRequests.get(params.requestId),status:params.response?.status});if(method==='Network.loadingFailed'&&artifactRequests.has(params.requestId)){onDownloadState({event:'artifact-network-error',url:artifactRequests.get(params.requestId),error:params.errorText});artifactRequests.delete(params.requestId)}if(method==='Network.loadingFinished')artifactRequests.delete(params.requestId);for(const session of sessions.keys())reply({session,method,params})};
  const downloadState=detail=>{onDownloadState(detail);for(const session of sessions.keys())reply({session,method:'Yardmaster.downloadState',params:detail})};
  const onDownload=(_event,item,webContents)=>{if(webContents!==bound)return;const downloads=[...sessions.values()].at(-1)?.downloads;if(downloads){item.setSavePath(path.join(downloads,path.basename((/\.zip$/i.test(item.getFilename())&&!String(item.getURL?.()||'').startsWith('blob:'))?item.getFilename():([...sessions.values()].at(-1)?.filename||item.getFilename()))));downloadState({event:'download-start',filename:item.getFilename()});item.on?.('updated',(_e,state)=>downloadState({event:'download-progress',state,received:item.getReceivedBytes(),total:item.getTotalBytes()}));item.once?.('done',(_e,state)=>downloadState({event:'download-done',state,filename:item.getFilename(),received:item.getReceivedBytes(),total:item.getTotalBytes()}))}};
  function bind(wc){if(bound===wc)return;unbind();bound=wc;wc.debugger.on('message',onEvent);wc.session.on('will-download',onDownload)}
  function unbind(){if(!bound)return;try{bound.debugger.removeListener('message',onEvent);bound.session.removeListener('will-download',onDownload);if(bound.debugger.isAttached())bound.debugger.detach()}catch{}bound=null}
  const onMessage=async m=>{
    if(m?.channel!==CHANNEL||typeof m.session!=='string')return;
    if(m.operation==='close'){sessions.delete(m.session);if(!sessions.size)unbind();return}
    try{
      if(m.operation==='connect')await prepareDock();
      const wc=getDock();if(!wc||wc.isDestroyed())throw new Error('The docked ChatGPT window is still starting.');
      if(m.operation==='connect'){
        const u=new URL(wc.getURL());if(u.protocol!=='https:'||!['chatgpt.com','www.chatgpt.com'].includes(u.hostname))throw new Error('The docked ChatGPT window has not loaded ChatGPT yet.');
        bind(wc);if(!wc.debugger.isAttached())wc.debugger.attach('1.3');
        // A disconnected Windows display can collapse even an in-window view.
        // Restore CSS layout before inspecting controls or using trusted input.
        const viewport=await wc.debugger.sendCommand('Runtime.evaluate',{expression:'({width:innerWidth,height:innerHeight})',returnByValue:true});
        if(viewport.result?.value?.width<320||viewport.result?.value?.height<240)await wc.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
        const layout=await wc.debugger.sendCommand('Runtime.evaluate',{returnByValue:true,expression:`(()=>{const e=document.querySelector('#prompt-textarea,textarea,[contenteditable="true"]'),ancestors=[];for(let p=e;p&&ancestors.length<9;p=p.parentElement){const r=p.getBoundingClientRect(),s=getComputedStyle(p);ancestors.push({tag:p.tagName,id:p.id,width:r.width,height:r.height,display:s.display,visibility:s.visibility,cssWidth:s.width})}return {width:innerWidth,height:innerHeight,bodyWidth:document.body?.clientWidth,visibility:document.visibilityState,ancestors}})()`});
        await wc.debugger.sendCommand('Network.enable');
        onViewport({before:viewport.result?.value,after:layout.result?.value});
        sessions.set(m.session,{downloads:typeof m.params?.downloads==='string'?m.params.downloads:null});reply({session:m.session,id:m.id,result:{connected:true}});return;
      }
      if(m.operation==='download-target'&&sessions.has(m.session)&&bound===wc){const filename=m.params?.filename;if(typeof filename!=='string'||!/\.zip$/i.test(filename)||path.basename(filename)!==filename||/[\\/:]/.test(filename))throw new Error('Invalid repair download filename');sessions.get(m.session).filename=filename;reply({session:m.session,id:m.id,result:{ready:true}});return}
      if(m.operation!=='command'||!sessions.has(m.session)||bound!==wc)throw new Error('The docked ChatGPT connection expired.');
      if(!wc.debugger.isAttached())wc.debugger.attach('1.3');
      const result=await wc.debugger.sendCommand(m.params.method,m.params.params||{});
      reply({session:m.session,id:m.id,result});
    }catch(error){reply({session:m.session,id:m.id,error:String(error?.message||error)})}
  };
  const cleanup=()=>{child.removeListener('message',onMessage);child.removeListener('exit',cleanup);child.removeListener('disconnect',cleanup);sessions.clear();unbind()};
  child.on('message',onMessage);child.once('exit',cleanup);child.once('disconnect',cleanup);return cleanup;
}
module.exports={DockCdp,installDockBridge};
