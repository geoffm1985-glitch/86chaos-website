const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
let state={};
const viewCopy={
  operations:['Operations Center','Big movement, ordered well.'],
  runs:['Run Monitor','Tests, output, and timing.'],
  branches:['Repository Control','Keep every move on the right track.'],
  queue:['Repair Queue','Failures, approvals, and retry policy.'],
  chatgpt:['ChatGPT Control','Hand work off without handing over the controls.'],
  deployments:['Deployment Watch','Wait for the exact build, then verify it.'],
  settings:['Yardmaster Settings','Local first. Your machine, your rules.']
};
async function api(path,opts={}){try{const r=await fetch(path,{...opts,headers:{'Content-Type':'application/json',...(opts.headers||{})}});if(!r.ok)throw new Error((await r.text())||('HTTP '+r.status));const ct=r.headers.get('content-type')||'';return ct.includes('json')?r.json():r.text()}catch(error){if(error instanceof TypeError)throw new Error('The Yardmaster local operator at 127.0.0.1:8787 is not responding. Restart Yardmaster and try again.');throw error}}
const remotePushBrowser=location.protocol==='https:'&&!['127.0.0.1','localhost'].includes(location.hostname);
let pushUi={state:'idle',detail:'',busy:false};
function pushSupported(){return remotePushBrowser&&window.isSecureContext&&'Notification' in window&&'serviceWorker' in navigator&&'PushManager' in window}
function pushKeyBytes(value){const padding='='.repeat((4-value.length%4)%4),base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/'),raw=atob(base64),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out}
function pushKeysMatch(existing,expected){if(!existing)return false;const a=new Uint8Array(existing),b=expected instanceof Uint8Array?expected:new Uint8Array(expected);if(a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;return true}
function setPushUi(stateName,detail=''){pushUi={...pushUi,state:stateName,detail};renderPushControls()}
function renderPushControls(){
  const box=$('#pushNotificationBox'),status=$('#pushNotificationStatus'),enable=$('#enablePushNotifications'),test=$('#testPushNotification');if(!box)return;
  box.hidden=!remotePushBrowser;if(!remotePushBrowser)return;
  const permission=pushSupported()?Notification.permission:'unsupported',current=state.currentDevice||{};
  const labels={enabled:'Enabled',working:'Working',subscribed:'Subscribed',error:'Needs attention','needs-resubscribe':'Needs repair',idle:'Not enabled',unsupported:'Unsupported'};
  const effective=pushUi.state!=='idle'?pushUi.state:(current.pushStatus||(current.hasPush?'enabled':'idle'));
  if(status)status.textContent=pushUi.detail||((labels[effective]||effective)+(permission==='denied'?' • Browser permission blocked':''));
  if(enable){enable.disabled=pushUi.busy||!pushSupported()||permission==='denied';enable.textContent=current.hasPush||permission==='granted'?'Repair / Re-enable Notifications':'Enable Phone Notifications'}
  if(test)test.disabled=pushUi.busy||!current.hasPush;
}
async function registerPush({requestPermission=false,test=false,forceResubscribe=false}={}){
  if(!pushSupported()){setPushUi('unsupported','Push notifications require the secure phone page in a supported browser.');return false}
  pushUi.busy=true;renderPushControls();
  try{
    let permission=Notification.permission;
    if(permission==='default'&&requestPermission)permission=await Notification.requestPermission();
    if(permission!=='granted'){setPushUi(permission==='denied'?'error':'idle',permission==='denied'?'Notifications are blocked for this site. Allow them in your browser site settings, then try again.':'Tap Enable Phone Notifications to allow alerts.');return false}
    setPushUi('working','Registering this phone…');
    const registration=await navigator.serviceWorker.register('/sw.js',{scope:'/'});
    await navigator.serviceWorker.ready;
    const key=await api('/api/push/key'),expectedKey=pushKeyBytes(key.publicKey);
    let subscription=await registration.pushManager.getSubscription();
    if(subscription&&(!pushKeysMatch(subscription.options?.applicationServerKey,expectedKey)||forceResubscribe)){await subscription.unsubscribe().catch(()=>{});subscription=null}
    if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:expectedKey});
    let result=await api('/api/push/subscribe',{method:'POST',body:JSON.stringify({subscription:subscription.toJSON(),test})});
    if(result.needsResubscribe&&!forceResubscribe){
      await subscription.unsubscribe().catch(()=>{});
      subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:pushKeyBytes(key.publicKey)});
      result=await api('/api/push/subscribe',{method:'POST',body:JSON.stringify({subscription:subscription.toJSON(),test})});
    }
    localStorage.setItem('yardmaster:push-enabled','1');
    setPushUi(result.testDelivered===false&&test?'error':'enabled',result.testDelivered===false&&test?(result.error||'Subscription saved, but the test notification did not reach the push service.'):(test?'Enabled. A test notification was sent to this phone.':'Phone notifications are enabled.'));
    await load();return true
  }catch(error){setPushUi('error',error.message||String(error));return false}
  finally{pushUi.busy=false;renderPushControls()}
}
async function sendPushTest(){
  pushUi.busy=true;setPushUi('working','Sending a test notification…');
  try{
    const result=await api('/api/push/test',{method:'POST',body:'{}'});
    setPushUi(result.ok?'enabled':'error',result.ok?'Test notification sent.':(result.error||'Push test failed.'));
    await load()
  }catch(error){
    setPushUi('error',error.message||String(error));
    if(/not enabled|502|resubscribe/i.test(String(error.message||error)))await registerPush({requestPermission:false,test:true,forceResubscribe:true})
  }finally{pushUi.busy=false;renderPushControls()}
}
function fmtElapsed(ms=0){const s=Math.floor(ms/1000),h=String(Math.floor(s/3600)).padStart(2,'0'),m=String(Math.floor((s%3600)/60)).padStart(2,'0'),x=String(s%60).padStart(2,'0');return h+':'+m+':'+x}
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function text(sel,v){const e=$(sel);if(e)e.textContent=v??''}
function setValue(sel,v){const e=$(sel);if(!e||document.activeElement===e)return;const next=String(v??'');if(e.value!==next)e.value=next}
function setView(view){
  if(!viewCopy[view])view='operations';
  $('#desktopApp').dataset.view=view;
  $$('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===view));
  $$('[data-view-panel]').forEach(p=>p.classList.toggle('active',p.dataset.viewPanel===view));
  text('#viewEyebrow',viewCopy[view][0]);text('#viewTitle',viewCopy[view][1]);
  localStorage.setItem('yardmaster:view',view);
}
function populateBranches(branches=[],selected='testing'){
  const e=$('#branch');if(!e||document.activeElement===e)return;
  const list=[...new Set([...(branches||[]),selected].filter(Boolean))];
  const current=Array.from(e.options).map(o=>o.value);
  if(current.length!==list.length||current.some((v,i)=>v!==list[i])){
    e.innerHTML=list.map(b=>'<option value="'+esc(b)+'">'+esc(b)+'</option>').join('');
  }
  if(e.value!==selected)e.value=selected;
}
function populateModels(mode='Work',selected='GPT-5.6 Sol'){
  const e=$('#model'),listElement=$('#modelChoices');if(!e||document.activeElement===e)return;
  const list=mode==='Work'?['GPT-5.6 Sol','GPT-5.6 Terra','GPT-5.6 Luna','GPT-6 Astra']:['GPT-5.6 Sol'];
  if(selected&&!list.includes(selected))list.push(selected);
  if(listElement)listElement.innerHTML=list.map(v=>'<option value="'+esc(v)+'"></option>').join('');
  if(e.value!==selected)e.value=selected;
}
function activityHtml(items=[]){return items.slice(-7).reverse().map(x=>'<div><span>'+new Date(x.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})+'</span><span class="dot" style="background:'+(x.level==='error'?'#ef6666':x.level==='warn'?'#e6a348':'#38d77f')+'"></span><span>'+esc(x.message)+'</span></div>').join('')||'<div><span>--</span><span class="dot"></span><span>No activity yet.</span></div>'}
function approvalHtml(wf={}){
  if(wf.approval?.type==='repair'&&wf.pendingRepair)return '<div class="download-strip"><b>Repair ready</b><br><span class="tiny">Apply the downloaded repair and test it?</span><div class="button-row"><button class="btn primary" data-action="approve-repair">Approve & Test</button><button class="btn stop" data-action="reject-repair">Reject</button></div></div>';
  if(wf.state==='waiting-login')return '<div class="download-strip"><b>ChatGPT sign-in needed</b><br><span class="tiny">Sign in once, then continue.</span><button class="btn" data-action="resume-handoff" style="margin-top:8px">Resume Handoff</button></div>';
  if(wf.state==='repair-limit')return '<div class="download-strip"><b>Repair limit reached</b><br><span class="tiny">Automatic activity stopped.</span></div>';
  if(wf.state==='handoff-error'){const diagnostic=wf.diagnostic?.name?'<a class="btn" href="/api/handoff-diagnostic" download>Download Diagnostics</a>':'';const stage=wf.diagnostic?.stage?'<br><span class="tiny">Last diagnostic stage: '+esc(wf.diagnostic.stage)+'</span>':'';return '<div class="download-strip"><b>ChatGPT handoff failed</b><br><span class="tiny">'+esc(wf.error||'Unknown handoff error')+'</span>'+stage+'<div class="button-row"><button class="btn primary" data-action="resume-handoff">Resume Current Failed Test</button>'+diagnostic+'</div><div class="tiny">Yardmaster will re-upload the existing failed-test ZIP and continue the repair cycle without restarting the Play Store gate.</div></div>'}
  if(wf.state==='failed-manual')return '<div class="download-strip"><b>Failed test is ready to hand off</b><br><span class="tiny">Resume from this failure without rerunning the gate.</span><div class="button-row"><button class="btn primary" data-action="resume-handoff">Upload Failed ZIP & Continue</button></div></div>';
  return '<div class="download-strip"><b>Workflow: '+esc(wf.state||'idle')+'</b><br><span class="tiny">No protected action is waiting.</span></div>';
}
function toggle(sel,on){$(sel)?.classList.toggle('on',!!on)}
function render(s){
  state=s||state;
  const run=s.run||{},cfg=s.config||{},counts=run.counts||{},wf=s.workflow||{},dep=s.deployment||{},pct=Math.max(0,Math.min(100,run.progress||0));
  const remoteStatus=s.remote?.status||(s.remote?.active?(s.remote?.url?'tunnel-ready':'connecting'):(s.remote?.error?'error':'local'));const remoteLabel={local:'Local',connecting:'Connecting','tunnel-ready':'Tunnel Ready • Phone Not Connected',connected:'Phone Connected',error:'Remote Error'}[remoteStatus]||'Local';
  text('#pcName',s.machineName||'Local operator');text('#pcStatus',s.online===false?'PC Offline':'PC Online');text('#localState',remoteLabel);text('#chatState',s.chatgpt?.state||'Ready');text('#deployState',dep.state||'Idle');text('#versionLabel',s.version||'0.1.62');
  text('#runTitle',run.title||'Ready for work');text('#runSub',run.subtitle||'Choose a branch and test type, then start.');text('#elapsed',fmtElapsed(run.elapsedMs||0));text('#currentTest',run.currentTest||'Idle');text('#pct',pct+'%');if($('#progressBar'))$('#progressBar').style.width=pct+'%';
  text('#passCount',counts.pass||0);text('#failCount',counts.fail||0);text('#skipCount',counts.skip||0);text('#timeoutCount',counts.timeout||0);
  populateBranches(s.branches,cfg.branch||'testing');setValue('#testType',cfg.testType||'delta');setValue('#repositoryPath',cfg.repositoryPath||'');setValue('#testingUrl',cfg.testingUrl||'');setValue('#repoUpdate',cfg.repoUpdateMode||'automatic');setValue('#maxRepairAttempts',String(cfg.maxRepairAttempts ?? 25));setValue('#chatMode',cfg.chatMode||'Work');populateModels(cfg.chatMode||'Work',cfg.model||'GPT-5.6 Sol');setValue('#thinkingEffort',cfg.thinkingEffort||'High');
  toggle('#autoHandoff',cfg.autoHandoff!==false);toggle('#autoPush',!!cfg.autoPush);toggle('#waitDeploy',cfg.waitForDeploy!==false);toggle('#runAfterDeploy',cfg.runAfterDeploy!==false);toggle('#autoUpdateOperator',cfg.autoUpdateOperator!==false);
  text('#workflowStatus',wf.state||'idle');text('#repairAttemptStatus',(wf.repairAttempts||0)+' / '+(cfg.maxRepairAttempts===0?'Unlimited':(cfg.maxRepairAttempts ?? 25)));text('#queueWorkflow',wf.state||'idle');text('#branchReadout',cfg.branch||'testing');text('#branchSelected',cfg.branch||'testing');
  const live=s.operatorStatus||{};text('#doingStatus',live.doing||'Yardmaster is ready.');text('#waitingStatus',live.waitingOn||'A command.');text('#nextStatus',live.nextAction||'Start approved work.');
  text('#updateStatus',s.update?.state||'Current');text('#updateDetail',s.update?.waitingOn?('Waiting on '+s.update.waitingOn+'.'):(s.update?.error||'Checks the verified Yardmaster release and safely queues the update if protected work is active.'));
  const ph=s.pushHealth||{};text('#pushHealthSummary',ph.subscribedDevices?((ph.workingDevices||0)+' working / '+ph.subscribedDevices+' subscribed'+(ph.needsAttention?' • '+ph.needsAttention+' need attention':'')):'No paired subscriptions');
  const adopt=s.adoptableRun;text('#adoptRunHint',adopt?('Detected '+adopt.mode+' run '+adopt.runId+' • '+adopt.currentPhase+'. Click Adopt Running Play Store Test to hand the rest of the cycle to Yardmaster.'):'Start a full or delta Play Store gate manually, then Yardmaster can adopt it and own repair → push → deploy → retest until PASS.');if($('#adoptRunButton'))$('#adoptRunButton').disabled=!adopt&&run.state==='running';
  const approval=approvalHtml(wf);if($('#approvals')){$('#approvals').innerHTML=approval;bindActions($('#approvals'))}if($('#queueApproval')){$('#queueApproval').innerHTML=approval;bindActions($('#queueApproval'))}
  const shortLog=(run.log||[]).slice(-18).join('\n')||'Yardmaster ready.';if($('#console'))$('#console').textContent=shortLog;if($('#runsConsole'))$('#runsConsole').textContent=(run.log||[]).slice(-42).join('\n')||'Yardmaster ready.';
  if($('#activity'))$('#activity').innerHTML=activityHtml(s.activity||[]);
  text('#runsSummary',(run.title||'No run yet')+' • '+(run.state||'idle'));if($('#runsMetrics'))$('#runsMetrics').innerHTML='<div class="stat pass">Pass<b>'+Number(counts.pass||0)+'</b></div><div class="stat fail">Fail<b>'+Number(counts.fail||0)+'</b></div><div class="stat skip">Skip<b>'+Number(counts.skip||0)+'</b></div><div class="stat time">Elapsed<b>'+esc(fmtElapsed(run.elapsedMs||0))+'</b></div>';
  text('#chatViewState',s.chatgpt?.state||'Ready');text('#chatViewDetail',s.chatgpt?.detail||('Mode: '+(cfg.chatMode||'Work')+' • Model: '+(cfg.model||'GPT-5.6 Sol')+' • Thinking: '+(cfg.thinkingEffort||'High')));
  const self=s.selfTest||{},selfSteps=self.steps||{};text('#selfTestState',self.state||'idle');text('#selfTestDetail',self.detail||'Ready for a full isolated process test.');if($('#selfTestSteps')){$('#selfTestSteps').innerHTML=(Object.entries(selfSteps).map(([name,status])=>'<div class="self-test-step '+esc(status)+'"><span>'+esc(name.replace(/([A-Z])/g,' $1'))+'</span><b>'+esc(status)+'</b></div>').join('')||'<div class="tiny">No sandbox run yet.</div>')+(self.savedPath?'<div class="tiny self-test-saved">Diagnostic evidence saved automatically to: '+esc(self.savedPath)+'</div>':'')+(self.diagnosticSaveError?'<div class="tiny remote-error">Automatic diagnostic save failed: '+esc(self.diagnosticSaveError)+'</div>':'')+(self.diagnostic?.name?'<div class="button-row"><button class="btn primary" data-action="save-self-test-diagnostic">Save Another Diagnostic Copy</button></div>':'');bindActions($('#selfTestSteps'))}
  text('#deploymentViewState',dep.state||'Idle');text('#deploymentViewDetail',dep.expectedCommit?('Expected '+String(dep.expectedCommit).slice(0,12)+(dep.deployedCommit?' • deployed '+String(dep.deployedCommit).slice(0,12):'')):(dep.url||cfg.testingUrl||'No deployment is being watched.'));
  const td=$('#trustedDevices');if(td){td.innerHTML=(s.trustedDevices||[]).slice(0,4).map(d=>'<div class="device-row"><span><b>'+esc(d.name||'Device')+'</b><br><span class="tiny">'+(d.hasPasskey?'Passkey':'Legacy')+(d.hasPush?' • Push':'')+(d.pushStatus?' • '+esc(d.pushStatus):'')+'</span></span><button class="btn" data-action="revoke-device" data-device-id="'+esc(d.id)+'">Revoke</button></div>').join('')||'<div class="tiny">No paired phones yet.</div>';bindActions(td)}renderPushControls()
  const ri=$('#remoteInfo');if(ri){if(remoteStatus==='connecting'){const html='<div class="remote-connecting">Connecting to Cloudflare…</div><div class="tiny">The local operator remains available at 127.0.0.1:8787.</div><button class="btn" data-action="remote-stop" style="margin-top:7px">Cancel</button>';if(ri.dataset.rendered!==html){ri.innerHTML=html;ri.dataset.rendered=html;bindActions(ri)}}else if(remoteStatus==='tunnel-ready'||remoteStatus==='connected'){const phoneLine=remoteStatus==='connected'?'<div class="remote-connected">✓ Authenticated phone connected</div>':'<div class="remote-connecting">Tunnel ready • waiting for phone authentication</div>';const html=phoneLine+(s.remote.qrDataUrl?'<img src="'+s.remote.qrDataUrl+'" alt="Pairing QR" style="width:116px;height:116px;display:block;margin:6px auto;border-radius:10px">':'')+'<div class="remote-url">'+esc(s.remote.url||'Secure tunnel ready')+'</div><div class="pair-code">'+esc(s.remote.pairCode||'------')+'</div><div class="tiny">Open 86chaos.com/yardmaster on your phone. If a previously trusted phone cannot unlock, choose Pair This Phone Again and use this code.</div><button class="btn" data-action="remote-stop" style="margin-top:7px">Stop Remote Access</button>';if(ri.dataset.rendered!==html){ri.innerHTML=html;ri.dataset.rendered=html;bindActions(ri)}}else{const err=s.remote?.error?'<div class="remote-error">'+esc(s.remote.error)+'</div>':'';const html=err+'<button class="btn primary" data-action="remote-start">Start Remote Access</button>';if(ri.dataset.rendered!==html){ri.innerHTML=html;ri.dataset.rendered=html;bindActions(ri)}}}
}
async function load(){try{render(await api('/api/status'))}catch(e){console.error(e)}}
async function updateConfig(patch){try{await api('/api/config',{method:'POST',body:JSON.stringify(patch)});await load()}catch(e){alert(e.message)}}
async function action(name,payload={}){try{const result=await api('/api/action',{method:'POST',body:JSON.stringify({action:name,...payload})});if(name==='save-self-test-diagnostic'&&result?.path)alert('Self-test diagnostics saved to:\n'+result.path);await load()}catch(e){alert(e.message)}}
function bindActions(root=document){root.querySelectorAll?.('[data-action]').forEach(b=>{if(b.dataset.bound)return;b.dataset.bound='1';b.addEventListener('click',()=>action(b.dataset.action,b.dataset.deviceId?{deviceId:b.dataset.deviceId}:{}))})}
function bindChange(sel,key,convert=v=>v){$(sel)?.addEventListener('change',e=>updateConfig({[key]:convert(e.target.value)}))}
function setup(){
  $$('[data-nav]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.nav)));
  $$('[data-nav-jump]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.navJump)));
  setView(localStorage.getItem('yardmaster:view')||'operations');
  bindActions();
  $('#runCommandBlock')?.addEventListener('click',async()=>{
    const value=$('#commandBlock')?.value||'';
    try{await api('/api/command',{method:'POST',body:JSON.stringify({text:value})});await load()}catch(e){alert(e.message)}
  });
  const workModal=$('#newWorkModal');
  $('#newWorkButton')?.addEventListener('click',()=>{
    if(workModal){workModal.hidden=false;$('#newWorkTask')?.focus()}
    const cfg=state.config||{};
    text('#newWorkExecutionSummary','Uses '+(cfg.chatMode||'Work')+' • '+(cfg.model||'GPT-5.6 Sol')+' • '+(cfg.thinkingEffort||'High')+'. Production/main stays blocked.');
  });
  $('#cancelNewWork')?.addEventListener('click',()=>{if(workModal)workModal.hidden=true});
  workModal?.addEventListener('click',e=>{if(e.target===workModal)workModal.hidden=true});
  $('#submitNewWork')?.addEventListener('click',async()=>{
    const task=String($('#newWorkTask')?.value||'').trim();
    if(!task){alert('Describe what you want implemented first.');return}
    const button=$('#submitNewWork');
    try{
      if(button){button.disabled=true;button.textContent='Handing off…'}
      await api('/api/action',{method:'POST',body:JSON.stringify({action:'new-implementation',taskPrompt:task,pushWhenPassed:!!$('#newWorkPush')?.checked})});
      if(workModal)workModal.hidden=true;
      if($('#newWorkTask'))$('#newWorkTask').value='';
      await load();
    }catch(e){alert(e.message)}
    finally{if(button){button.disabled=false;button.textContent='Hand Off & Walk Away'}}
  });
  bindChange('#branch','branch');bindChange('#testType','testType');bindChange('#repositoryPath','repositoryPath');bindChange('#testingUrl','testingUrl');bindChange('#repoUpdate','repoUpdateMode');bindChange('#chatMode','chatMode');bindChange('#model','model');bindChange('#thinkingEffort','thinkingEffort');bindChange('#maxRepairAttempts','maxRepairAttempts',v=>{const n=Number(v);return Number.isFinite(n)?Math.max(0,Math.min(1000,n)):25});
  $('#autoHandoff')?.addEventListener('click',()=>updateConfig({autoHandoff:state.config?.autoHandoff===false}));
  $('#autoPush')?.addEventListener('click',()=>updateConfig({autoPush:!state.config?.autoPush}));
  $('#waitDeploy')?.addEventListener('click',()=>updateConfig({waitForDeploy:state.config?.waitForDeploy===false}));
  $('#runAfterDeploy')?.addEventListener('click',()=>updateConfig({runAfterDeploy:state.config?.runAfterDeploy===false}));
  $('#autoUpdateOperator')?.addEventListener('click',()=>updateConfig({autoUpdateOperator:state.config?.autoUpdateOperator===false}));
  $('#enablePushNotifications')?.addEventListener('click',()=>registerPush({requestPermission:true,test:true,forceResubscribe:false}));
  $('#testPushNotification')?.addEventListener('click',()=>sendPushTest());
  if(remotePushBrowser&&pushSupported()&&Notification.permission==='granted')setTimeout(()=>registerPush({requestPermission:false,test:false}),500);
  renderPushControls();load();setInterval(load,2000);
}
setup();
