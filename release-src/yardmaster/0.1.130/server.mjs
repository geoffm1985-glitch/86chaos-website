import {interruptedRunAction} from './automation/interrupted-run.mjs';
import {releaseGateProgress} from './automation/release-gate-progress.mjs';
import {readTunnelRegistrationLost} from './automation/tunnel-health.mjs';
import {trustedOwnerSession,ownerConnectionIdentity,createConnectionPublisher,DISCOVERY_URL} from './automation/owner-connection.mjs';
import {firebaseSettings,newFirebaseRun,isFirebaseProject,firebasePhase,finishFirebasePhase,firebaseEnvironment,firebaseCommand,FirebaseSession} from './automation/firebase-target.mjs';
import {TEST_TYPES,plannedTestType,completeFirstFull} from './automation/loop-test-plan.mjs';
import {operatorManifestUrl,validateOperatorRelease,launchUpdaterProcess} from './automation/operator-update.mjs';
import {readRunProject,workingProject} from './automation/run-project.mjs';
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import {spawn,execFile,execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import {promisify} from 'node:util';const execFileAsync=promisify(execFile);import {openChatGPT,submitRepairToChatGPT,startCommandBridge} from './automation/chatgpt.mjs';import {runFullSandboxSelfTest} from './automation/full-self-test.mjs';import {runPowerShellClipboardCommand,adoptRunningReleaseGate,discoverAdoptableReleaseGate} from './automation/windows-operator.mjs';import {SELF_HEAL_MAX_ATTEMPTS,captureWorkflowCheckpoint,selfHealPrompt,inspectSelfHealArchive,fetchAndCertifyPublishedSelfHeal,createSelfHealFailureBundle,readSelfHealRequest,clearSelfHealRequest,writeSelfHealRequest} from './automation/self-heal.mjs';import {failureFingerprint,recordFailureMemory,lookupFailureMemory,recordKnownRepair,workflowTimeline,listEvidence,resolveEvidenceFile,createReproductionCapsule,smartTestSelection,detectChangedFiles,recordTestIntelligence,flakyTestIntelligence,preflightDoctor,preflightDoctorAsync,resourceSnapshot,assessHang,createRepositorySnapshot,createRepositorySnapshotAsync,listWorktrees,createWorktree,removeWorktree,buildManifest,releaseProvenance,selfHealEscalation,compareSelfHealAttempts,mobileActionCards,recordCostEvent,costGuardSnapshot,dryRunPlan,listProfiles,saveProfile,deleteProfile,healthSnapshot,appendAudit,readAudit,changesSinceLastGood,annotateRun,runAnnotations,safeModeStatus,setSafeMode} from './automation/ops-intelligence.mjs';import {readPauseCheckpoint,clearPauseCheckpoint,capturePauseCheckpoint,resumeSavedProcess,resumeStrategy,partialResumeCommand} from './automation/play-store-resume.mjs';import webpush from 'web-push';import QRCode from 'qrcode';import {generateRegistrationOptions,verifyRegistrationResponse,generateAuthenticationOptions,verifyAuthenticationResponse} from '@simplewebauthn/server';
const __dirname=path.dirname(fileURLToPath(import.meta.url));const publicDir=path.join(__dirname,'public');const dataDir=process.env.YARDMASTER_DATA_DIR||(process.env.LOCALAPPDATA?path.join(process.env.LOCALAPPDATA,'Yardmaster'):path.join(os.homedir(),'.yardmaster'));fs.mkdirSync(dataDir,{recursive:true});
const packageInfo=readJson(path.join(__dirname,'package.json'),{version:'0.0.0'});
const configuredPort=Number(process.env.YARDMASTER_PORT||8787);const operatorPort=Number.isInteger(configuredPort)&&configuredPort>0&&configuredPort<65536?configuredPort:8787;
const cfgPath=path.join(dataDir,'config.json'),statePath=path.join(dataDir,'state.json'),devicesPath=path.join(dataDir,'devices.json'),vapidPath=path.join(dataDir,'vapid.json'),sessionsPath=path.join(dataDir,'sessions.json'),remotePath=path.join(dataDir,'remote.json'),updateResumePath=path.join(dataDir,'update-resume.json'),supervisorStopPath=path.join(dataDir,'supervisor-stop.json');
function repositoryCandidates(){
  const home=os.homedir(),oneDrive=process.env.OneDrive||'';
  return [...new Set([
    process.env.YARDMASTER_REPOSITORY_PATH,
    path.join(home,'Documents','GitHub','86chaos'),
    path.join(home,'Desktop','86chaos'),
    path.join(home,'Documents','86chaos'),
    oneDrive&&path.join(oneDrive,'Documents','GitHub','86chaos'),
    oneDrive&&path.join(oneDrive,'Desktop','86chaos')
  ].filter(Boolean))];
}
function validRepositoryPath(p){
  try{return !!p&&fs.existsSync(path.join(p,'package.json'))&&fs.existsSync(path.join(p,'.git'))}catch{return false}
}
function detectRepositoryPath(preferred){
  if(validRepositoryPath(preferred))return preferred;
  return repositoryCandidates().find(validRepositoryPath)||null;
}
const defaultRepositoryPath=detectRepositoryPath(null)||path.join(os.homedir(),'Documents','GitHub','86chaos');
const defaults={firebaseMode:process.env.YARDMASTER_FIREBASE_MODE||'emulator',firebaseLivePhase:'verification',repositoryPath:defaultRepositoryPath,branch:'testing',testType:'delta',chatMode:'Work',model:'GPT-5.6 Sol',thinkingEffort:'High',repoUpdateMode:'automatic',autoPush:false,waitForDeploy:true,testingUrl:'https://testing.86chaos.com',vercelProject:'86chaos',autoUpdateOperator:true,autoHandoff:true,autoSelfHeal:true,maxRepairAttempts:25,maxSelfHealAttempts:SELF_HEAL_MAX_ATTEMPTS,runAfterDeploy:true,dryRunMode:false,mobileLiveScreenshot:false,chatLoopEnabled:false,chatLoopPlan:'Work | GPT-5.6 Sol | High\nChat | GPT-5.6 Sol | High',hangThresholdMs:180000,githubActionsMinuteLimit:1500,vercelBuildLimit:100,automationDefaultsVersion:7};
function readJson(p,f){try{return JSON.parse(fs.readFileSync(p,'utf8'))}catch{return f}}function writeJson(p,v){fs.writeFileSync(p,JSON.stringify(v,null,2))}
const storedConfig=readJson(cfgPath,{});
let config={...defaults,...storedConfig};
if(config.maxRepairAttempts!==0&&Number(config.maxRepairAttempts||0)<10)config.maxRepairAttempts=25;
if(Number(storedConfig.automationDefaultsVersion||0)<2){
  if(!storedConfig.repoUpdateMode||storedConfig.repoUpdateMode==='ask')config.repoUpdateMode='automatic';
  config.automationDefaultsVersion=2;
}
if(Number(storedConfig.automationDefaultsVersion||0)<3){
  config.autoHandoff=false;
  config.automationDefaultsVersion=3;
}
if(Number(storedConfig.automationDefaultsVersion||0)<4){
  config.autoHandoff=true;
  config.automationDefaultsVersion=4;
}
if(Number(storedConfig.automationDefaultsVersion||0)<5){
  if(storedConfig.autoSelfHeal===undefined)config.autoSelfHeal=true;
  if(storedConfig.maxSelfHealAttempts===undefined)config.maxSelfHealAttempts=SELF_HEAL_MAX_ATTEMPTS;
  config.automationDefaultsVersion=5;
}
if(Number(storedConfig.automationDefaultsVersion||0)<6){
  if(storedConfig.dryRunMode===undefined)config.dryRunMode=false;
  if(storedConfig.mobileLiveScreenshot===undefined)config.mobileLiveScreenshot=false;
  if(storedConfig.hangThresholdMs===undefined)config.hangThresholdMs=180000;
  if(storedConfig.githubActionsMinuteLimit===undefined)config.githubActionsMinuteLimit=1500;
  if(storedConfig.vercelBuildLimit===undefined)config.vercelBuildLimit=100;
  config.automationDefaultsVersion=6;
}
if(Number(storedConfig.automationDefaultsVersion||0)<7){
  if(storedConfig.chatLoopEnabled===undefined)config.chatLoopEnabled=false;
  if(storedConfig.chatLoopPlan===undefined)config.chatLoopPlan='Work | GPT-5.6 Sol | High\nChat | GPT-5.6 Sol | High';
  config.automationDefaultsVersion=7;
}
const recoveredRepositoryPath=detectRepositoryPath(config.repositoryPath);
if(recoveredRepositoryPath)config.repositoryPath=recoveredRepositoryPath;
const continuousLoopFixture=process.env.YARDMASTER_TEST_CONTINUOUS_LOOP==='1'?await import('./test/helpers/continuous-loop-boundaries.mjs').then(m=>m.createContinuousLoopBoundaries({dataDir,repoPath:config.repositoryPath,testingUrl:config.testingUrl})):null;
const bootSafeMode=safeModeStatus(dataDir);if(bootSafeMode.enabled){config.autoHandoff=false;config.autoSelfHeal=false;config.autoUpdateOperator=false;config.autoPush=false;config.waitForDeploy=false}writeJson(cfgPath,config);let devices=readJson(devicesPath,{});let vapid=readJson(vapidPath,null);if(!vapid){vapid=webpush.generateVAPIDKeys();writeJson(vapidPath,vapid)}webpush.setVapidDetails('mailto:support@86chaos.com',vapid.publicKey,vapid.privateKey);
function pidAlive(pid){try{if(!Number(pid))return false;process.kill(Number(pid),0);return true}catch{return false}}
const savedRemote=readJson(remotePath,null);
let remoteRetryAt=0;
let remoteWanted=!!(savedRemote?.wanted??savedRemote?.active);
const restoredRemote=savedRemote?.active&&savedRemote?.url&&pidAlive(savedRemote.pid)?{active:true,status:'tunnel-ready',url:savedRemote.url,pid:Number(savedRemote.pid),pairCode:null,pairExpiresAt:null,error:null,lastClientAt:null}:{active:false,status:'local',url:null,pid:null,pairCode:null,pairExpiresAt:null,error:null,lastClientAt:null};
let state={online:true,version:packageInfo.version,machineName:os.hostname(),config,run:{state:'idle',title:'Ready for work',subtitle:'Choose a branch and test type, then start.',progress:0,counts:{pass:0,fail:0,skip:0,timeout:0},currentTest:'Idle',elapsedMs:0,log:[]},activity:[],deployment:{state:'Idle'},chatgpt:{state:'Ready'},selfTest:{state:'idle',stage:'idle',detail:'Ready for a full isolated process test.',steps:{}},selfHeal:{state:'idle',detail:'Self-heal is ready.',attempt:0,maxAttempts:SELF_HEAL_MAX_ATTEMPTS,currentTest:null,diagnostic:null,error:null,log:[],attempts:[]},intelligence:{preflight:null,lastFailureFingerprint:null,lastSnapshot:null,lastReproduction:null},safeMode:bootSafeMode,adoptableRun:null,remote:restoredRemote,update:{state:'Current',version:packageInfo.version},workflow:{state:'idle',repairAttempts:0,pendingRepair:null,repairApplied:false,approval:null,closedLoop:false}};
const old=readJson(statePath,null),pendingUpdateResume=readJson(updateResumePath,null),persistedPlayStorePause=readPauseCheckpoint(dataDir);if(old?.activity)state.activity=old.activity.slice(-80);
const resumableWorkflowStates=new Set(['handoff-error','failed-manual','waiting-action','waiting-login','waiting-approval','repair-limit','download-only','update-queued','testing','paused','firebase-blocked']);
if(old&&(pendingUpdateResume||persistedPlayStorePause||old.selfHeal?.state==='waiting-action'||resumableWorkflowStates.has(String(old.workflow?.state||'')))){
  if(old.workflow)state.workflow=old.workflow;
  if(old.run)state.run={...old.run,log:Array.isArray(old.run.log)?old.run.log.slice(-350):[]};
  if(old.chatgpt)state.chatgpt=old.chatgpt;
  if(old.deployment)state.deployment=old.deployment;
  if(old.selfHeal)state.selfHeal={...state.selfHeal,...old.selfHeal};
}
if(persistedPlayStorePause){
  state.run={...(state.run||{}),state:'paused',title:'Paused Play Store Test',currentTest:persistedPlayStorePause.currentTest||state.run?.currentTest||'Paused checkpoint',project:persistedPlayStorePause.project||state.run?.project||readRunProject(persistedPlayStorePause.repoPath||config.repositoryPath),pauseCheckpoint:persistedPlayStorePause};
  state.workflow={...(state.workflow||{}),state:'paused'};
}
let activeProcess=null,adoptedRunController=null,remoteProcess=null,remoteStartPromise=null,remoteStartNonce=0,runStartedAt=0,pairCode=null,pairExpiresAt=0,workflowBusy=false,currentRunOptions={},cancelRequested=false,pauseRequested=false,pausedCompletion=null,commandBridge=null;const RP_ID='86chaos.com',RP_NAME='Yardmaster',EXPECTED_ORIGINS=['https://www.86chaos.com','https://86chaos.com'];const pendingRegistrations=new Map(),pendingAuthentications=new Map(),pairFailures=new Map();
let firebaseSession=null,firebaseStarting=false,firebaseAbort=null,firebaseRecoveryTimer=null;
state.firebase={mode:config.firebaseMode,livePhase:config.firebaseLivePhase,target:state.workflow?.firebase?.target||'emulator',phase:'idle',emulator:{status:'stopped'},telemetry:state.workflow?.firebase||null};
function syncFirebase(){const f=state.workflow?.firebase;state.firebase={...state.firebase,mode:f?.mode||config.firebaseMode,livePhase:f?.livePhase||config.firebaseLivePhase,target:f?.target||(config.firebaseMode==='live'?'live':'emulator'),phase:f?.phase||'idle',liveProject:((f?.mode||config.firebaseMode)!=='emulator')?'chaos-test-d1601':null,billable:(f?.mode||config.firebaseMode)!=='emulator',telemetry:f||null,updatedAt:Date.now()};persist()}
function firebaseBlocked(error){firebaseStarting=false;state.workflow.state='firebase-blocked';state.workflow.error=error.message;if(state.workflow.firebase)state.workflow.firebase.phase='blocked';state.run.state='failed';state.run.title='Firebase Test Blocked';state.run.currentTest=error.message;state.run.exitCode=1;state.run.finishedAt=Date.now();if(activeProcess)terminateProcessTree(activeProcess.pid);activity(error.message+' No automatic live fallback was attempted.','error');syncFirebase()}
async function recoverFirebaseRun(){
  if(firebaseRecoveryTimer)return;
  const wf=state.workflow;
  await stopFirebaseSession();
  if(cancelRequested||!wf?.closedLoop||wf!==state.workflow)return;
  const attempt=Number(wf.firebaseRecoveryAttempts||0)+1;
  if(attempt>3){activity('Emulator recovery attempts exhausted; the failure and applied repair are preserved.','error');notify('Yardmaster: emulator needs attention',wf.error||'Emulator readiness failed after three automatic restarts.');persist();return}
  wf.firebaseRecoveryAttempts=attempt;wf.state='firebase-recovering';
  activity('Restarting the owned emulator and local app before retrying the saved delta stage ('+attempt+'/3).','warn');persist();
  firebaseRecoveryTimer=setTimeout(()=>{firebaseRecoveryTimer=null;if(cancelRequested||wf!==state.workflow)return;runTest({...currentRunOptions,retry:true})},1000);
}
async function prepareFirebaseSession(repoPath,run,options={}){if(!firebaseSession||firebaseSession.repo!==repoPath){if(firebaseSession)await firebaseSession.stop();firebaseSession=new FirebaseSession({...(process.env.YARDMASTER_TEST_FIREBASE_TOOLS==='1'?{detect:(await import('./test/helpers/firebase-fixture-tooling.mjs')).fixtureFirebaseTools}:{}),repo:repoPath,appRoot:__dirname,dataDir:path.join(dataDir,'firebase'),onStatus:s=>{state.firebase.emulator=s;if(s.message)activity(s.message);syncFirebase()},onFatal:error=>{const starting=firebaseStarting;firebaseBlocked(error);if(!starting)void recoverFirebaseRun()}})}return firebaseSession.start(run,options)}
async function stopFirebaseSession(){firebaseAbort?.abort();if(firebaseSession)await firebaseSession.stop();syncFirebase()}
const savedSessions=readJson(sessionsPath,{});const sessions=new Map(Object.entries(savedSessions).filter(([,s])=>trustedOwnerSession(s,devices)).map(([key,s])=>[key,{...s,persistent:true,expiresAt:null}]));
const connectionIdentity=ownerConnectionIdentity(dataDir);
const connectionDescriptor={id:connectionIdentity.id,publicKey:connectionIdentity.publicKey,discoveryUrl:DISCOVERY_URL};
const publishConnection=createConnectionPublisher({dataDir,identity:connectionIdentity});
function publishRemoteConnection(availability='online'){if(process.env.YARDMASTER_DISABLE_CONNECTION_PUBLISH==='1')return;publishConnection(state.remote?.url||null,availability).then(()=>{state.remote.discoveryPublished=true;state.remote.discoveryError=null;persist()}).catch(error=>{state.remote.discoveryPublished=false;state.remote.discoveryError='Connection discovery could not publish: '+error.message;persist()})}
function persistSessions(){writeJson(sessionsPath,Object.fromEntries(sessions))}
function tokenHash(token){return crypto.createHash('sha256').update(String(token||'')).digest('hex')}
function saveRemoteState(){writeJson(remotePath,{wanted:remoteWanted,active:!!state.remote?.active,status:state.remote?.status||'local',url:state.remote?.url||null,pid:Number(state.remote?.pid)||null,updatedAt:Date.now()})}
function remotePhoneConnected(){return !!state.remote?.lastClientAt&&(Date.now()-Number(state.remote.lastClientAt)<15000)}
function markRemoteClient(session){
  if(!session||!state.remote.active)return;
  state.remote.lastClientAt=Date.now();
  state.remote.status='connected';
}
persistSessions();
function persist(){state.config=config;writeJson(statePath,{...state,remote:{...state.remote,pairCode:null,pairExpiresAt:null,qrDataUrl:null}});saveRemoteState()}function activity(message,level='info'){state.activity.push({at:Date.now(),message,level});state.activity=state.activity.slice(-100);persist()}function audit(action,detail='',source='operator'){try{return appendAudit(dataDir,{type:'operator',action,detail,source,branch:config.branch,commit:validRepositoryPath(config.repositoryPath)?gitRun(['rev-parse','HEAD']):null})}catch{return null}}
function validPushSubscription(subscription){return !!subscription&&typeof subscription.endpoint==='string'&&subscription.endpoint.startsWith('https://')&&typeof subscription.keys?.p256dh==='string'&&typeof subscription.keys?.auth==='string'}
function pushTargetUrl(){return state.remote?.active&&state.remote?.url?state.remote.url:'https://www.86chaos.com/yardmaster'}
function pushPayload(title,body,{tag='yardmaster-status',url=pushTargetUrl()}={}){return JSON.stringify({title:String(title||'Yardmaster'),body:String(body||''),tag,url,icon:'/yardmaster-icon.svg',badge:'/yardmaster-icon.svg'})}
async function sendPushToDevice(device,title,body,options={}){
  if(!device?.subscription||!validPushSubscription(device.subscription))return {ok:false,reason:'not-subscribed'};
  if(process.env.YARDMASTER_TEST_PUSH_STUB==='1'){
    device.pushStatus='working';device.pushLastSentAt=Date.now();device.pushLastError=null;
    return {ok:true,statusCode:201,stubbed:true};
  }
  try{
    const response=await webpush.sendNotification(device.subscription,pushPayload(title,body,options),{TTL:300,urgency:'high'});
    device.pushStatus='working';device.pushLastSentAt=Date.now();device.pushLastError=null;
    return {ok:true,statusCode:Number(response?.statusCode||201)};
  }catch(error){
    const statusCode=Number(error?.statusCode||0);
    device.pushStatus='error';device.pushLastError=String(error?.message||error||'Push delivery failed').slice(0,500);device.pushLastErrorAt=Date.now();
    if([401,403,404,410].includes(statusCode)){delete device.subscription;device.pushStatus='needs-resubscribe'}
    return {ok:false,statusCode,reason:device.pushLastError,needsResubscribe:[401,403,404,410].includes(statusCode)};
  }
}
async function notify(title,body,options={}){
  let sent=0,failed=0;
  for(const device of Object.values(devices)){
    if(!device.subscription)continue;
    const result=await sendPushToDevice(device,title,body,options);
    if(result.ok)sent++;else failed++;
  }
  writeJson(devicesPath,devices);
  return {sent,failed};
}
function pushHealthSnapshot(){
  const all=Object.values(devices),subscribed=all.filter(d=>!!d.subscription),working=subscribed.filter(d=>d.pushStatus==='working');
  const needsAttention=subscribed.filter(d=>['error','needs-resubscribe'].includes(String(d.pushStatus||'')));
  const lastSuccessfulAt=Math.max(0,...all.map(d=>Number(d.pushLastSentAt)||0));
  const lastErrorDevice=[...all].filter(d=>d.pushLastError).sort((a,b)=>(Number(b.pushLastErrorAt)||0)-(Number(a.pushLastErrorAt)||0))[0];
  return {pairedDevices:all.length,subscribedDevices:subscribed.length,workingDevices:working.length,needsAttention:needsAttention.length,lastSuccessfulAt:lastSuccessfulAt||null,lastError:lastErrorDevice?.pushLastError||null};
}
function holdChatGPTForAction(error,selfHeal=false){
  if(error.code!=='CHATGPT_ACTION_REQUIRED')return false;
  const target=selfHeal?state.selfHeal:state.workflow;
  const detail=selfHeal?error.message.replace('Resume Handoff','Resume Self-Heal'):error.message;
  const key=error.requiredAction?.service||'ChatGPT connection';
  const alreadyNotified=target.requiredAction?.service===key&&target.requiredAction?.notifiedAt;
  target.state='waiting-action';target.error=null;
  target.requiredAction={...error.requiredAction,detail,notifiedAt:alreadyNotified||Date.now()};
  if(selfHeal){target.detail=detail;target.currentTest=null;}
  state.chatgpt={state:'Your action is needed',detail,requiredAction:target.requiredAction};
  activity('ChatGPT needs your action: '+detail,'warn');
  if(!alreadyNotified)notify('Yardmaster: your action is needed',detail,{tag:'yardmaster-chatgpt-attention'});
  persist();return true;
}
function operatorStatusSnapshot(){
  const wf=state.workflow||{},run=state.run||{},dep=state.deployment||{},self=state.selfTest||{},heal=state.selfHeal||{},update=state.update||{};
  const out={phase:'idle',doing:'Yardmaster is ready.',waitingOn:'A command from Windows or your phone.',nextAction:'Start a test, new work, or another approved action.',canResume:false,resumeAction:null,updatedAt:Date.now()};
  if(['queued','chatgpt','certifying','testing','preparing-update','soaking'].includes(String(heal.state||'')))return {...out,phase:'self-heal',doing:heal.detail||'Yardmaster is repairing itself.',waitingOn:heal.currentTest||'the self-heal cycle to finish',nextAction:'No action is required. The repaired Yardmaster will install only after its sandbox, Playwright, and full Play Store tests pass.'};
  if(heal.state==='waiting-action')return {...out,phase:'self-heal-needs-attention',doing:'Your action is needed',waitingOn:heal.requiredAction?.detail||state.chatgpt?.detail,nextAction:'Connect or sign in as prompted in ChatGPT, then choose Resume Self-Heal.',canResume:true,resumeAction:'resume-self-heal'};
  if(heal.state==='waiting-login')return {...out,phase:'self-heal-needs-attention',doing:'Yardmaster self-heal is paused because ChatGPT needs a sign-in.',waitingOn:state.chatgpt?.detail||'You to sign in once in the Yardmaster ChatGPT window.',nextAction:'Choose Resume Self-Heal after signing in.',canResume:true,resumeAction:'resume-self-heal'};
  if(heal.state==='failed')return {...out,phase:'self-heal-failed',doing:'Yardmaster self-heal stopped safely: '+(heal.error||'unknown failure'),waitingOn:'A retry or manual repair.',nextAction:'Use Resume Self-Heal to retry from the saved diagnostic.',canResume:true,resumeAction:'resume-self-heal'};
  if(run.state==='paused'&&readPauseCheckpoint(dataDir))return {...out,phase:'paused-play-store',doing:'The Play Store test is truly paused at its saved checkpoint.',waitingOn:'Resume, or a Yardmaster update while the release-gate process remains suspended.',nextAction:'Resume will reattach to the same run ID when possible; if the process was lost, Yardmaster will use the 86 Chaos durable partial-resume checkpoint and will never silently restart the full gate.',canResume:true,resumeAction:'resume'};
  if(update.state==='Updating'||String(update.state||'').startsWith('Updating ('))return {...out,phase:'updating',doing:'Updating Yardmaster from '+(update.from||packageInfo.version)+' to '+(update.to||update.version||'the verified release')+'.',waitingOn:'The Windows updater to finish and restart Yardmaster.',nextAction:'Keep the PC powered on. Remote Access will reconnect after restart.'};
  if(self.state==='running'||self.state==='queued')return {...out,phase:'sandbox-test',doing:self.detail||('Running sandbox stage '+(self.stage||'starting')+'.'),waitingOn:self.stage||'sandbox test',nextAction:'No action needed unless Yardmaster reports a failure.'};
  if(wf.state==='firebase-recovering')return {...out,phase:'emulator-recovery',doing:'Recovering the local emulator test environment.',waitingOn:'The owned emulator and local app to restart.',nextAction:'The saved delta test will retry automatically.'};
  if(wf.state==='firebase-blocked')return {...out,phase:'emulator-blocked',doing:'Tests are blocked by the local emulator: '+(wf.error||'readiness failed'),waitingOn:'A working local emulator test environment.',nextAction:'Resume Test will retry the saved test stage. No live Firebase fallback is allowed.',canResume:true,resumeAction:'resume'};
  if(wf.state==='preparing-handoff')return {...out,phase:'preparing-handoff',doing:'Preparing current source and test-failure evidence for ChatGPT.',waitingOn:'The failure archive to finish.',nextAction:'Yardmaster will send the archive automatically.'};
  if(wf.state==='handoff-error')return {...out,phase:'needs-attention',doing:'The current ChatGPT handoff stopped safely: '+(wf.error||'handoff verification failed'),waitingOn:'Resume Current Failed Test.',nextAction:'Resume will reuse the existing failed-test ZIP and continue without restarting the Play Store gate.',canResume:true,resumeAction:'resume-handoff'};
  if(wf.state==='failed-manual')return {...out,phase:'needs-attention',doing:'The test failed and the failure evidence is ready.',waitingOn:'Upload Failed ZIP & Continue.',nextAction:'Resume the existing failure instead of rerunning the gate.',canResume:true,resumeAction:'resume-handoff'};
  if(wf.state==='waiting-action')return {...out,phase:'needs-attention',doing:'Your action is needed',waitingOn:wf.requiredAction?.detail||state.chatgpt?.detail,nextAction:'Connect or sign in as prompted in ChatGPT, then choose Resume Handoff.',canResume:true,resumeAction:'resume-handoff'};
  if(wf.state==='waiting-login')return {...out,phase:'needs-attention',doing:'ChatGPT sign-in is required.',waitingOn:state.chatgpt?.detail||'You to sign in once in the Yardmaster ChatGPT window.',nextAction:'After signing in, choose Resume Handoff.',canResume:true,resumeAction:'resume-handoff'};
  if(wf.state==='waiting-approval')return {...out,phase:'needs-attention',doing:'A repaired ZIP is downloaded and waiting.',waitingOn:'Repair approval.',nextAction:'Approve the repair or reject it from Approvals.'};
  if(workflowBusy&&String(state.chatgpt?.state||'').startsWith('Running a PowerShell command'))return {...out,phase:'powershell',doing:state.chatgpt.state,waitingOn:'The Windows command to finish.',nextAction:'Yardmaster is collecting command output and will return the result to ChatGPT automatically.'};
  if(workflowBusy)return {...out,phase:'chatgpt',doing:state.chatgpt?.detail||state.chatgpt?.state||'Working with ChatGPT.',waitingOn:'ChatGPT to finish the current handoff step.',nextAction:'Yardmaster will continue automatically when the response is ready.'};
  if(activeProcess||adoptedRunController||run.state==='running')return {...out,phase:'testing',doing:(run.title||'Running tests')+': '+(run.currentTest||'current test'),waitingOn:run.currentTest||'the active test process',nextAction:'Yardmaster is monitoring the test and will continue when it finishes.'};
  if(dep.state==='Waiting')return {...out,phase:'deployment',doing:'Watching the exact testing deployment for '+String(dep.expectedCommit||'the pushed commit').slice(0,12)+'.',waitingOn:'Vercel build identity to match the pushed commit.',nextAction:'Post-deployment testing will start automatically when configured.'};
  if(update.state==='Queued')return {...out,phase:'update-queued',doing:'A Yardmaster update is queued.',waitingOn:update.waitingOn||'The current protected work to reach a safe stopping point.',nextAction:'Yardmaster will update automatically as soon as it is safe.'};
  if(update.state==='Update failed')return {...out,phase:'update-failed',doing:'Yardmaster update failed: '+(update.error||'Unknown error'),waitingOn:'An update retry.',nextAction:'Use Update PC Yardmaster Now after resolving the reported error.'};
  if(update.state==='Available')return {...out,phase:'update-available',doing:'Yardmaster '+(update.version||update.to||'update')+' is available.',waitingOn:'An update command.',nextAction:'Use Update PC Yardmaster from Windows or the paired phone.'};
  if(run.state==='paused')return {...out,phase:'paused',doing:'The current run is paused.',waitingOn:'Resume.',nextAction:'Choose Resume to continue.',canResume:true,resumeAction:'resume'};
  return out;
}
function selfHealStatusSnapshot(){
  const heal=state.selfHeal||{},request=readSelfHealRequest(dataDir)||{},rawState=String(heal.state||'idle'),test=String(heal.currentTest||'');
  const rootReason=String(request.rootReason||request.reason||heal.reason||heal.error||'Yardmaster internal failure');
  const resume=request.checkpoint?.resume||heal.pendingResume||{};const resumeCheckpoint=resume.kind&&resume.kind!=='none'?(resume.kind+(resume.testType?' ('+resume.testType+')':'')+(resume.expectedCommit?' '+String(resume.expectedCommit).slice(0,12):'')):'No saved workflow';
  let phase=rawState.replaceAll('-',' '),waitingOn='Nothing. Yardmaster is continuing automatically.',lastSuccessfulStep='Fault detected',nextAction='Continue the protected self-heal sequence.';
  if(rawState==='idle'){phase='idle';waitingOn='No self-heal is active.';lastSuccessfulStep='Yardmaster healthy';nextAction='No recovery action required.'}
  else if(rawState==='queued'){phase='fault detected';waitingOn='The self-heal worker to start.';lastSuccessfulStep='Diagnostic ZIP and workflow checkpoint saved';nextAction='Send the Yardmaster-only diagnostic to ChatGPT.'}
  else if(rawState==='chatgpt'){phase=/waiting/i.test(heal.detail||'')?'waiting for ChatGPT':'sending to ChatGPT';waitingOn='ChatGPT to return a complete repaired Yardmaster ZIP.';lastSuccessfulStep='Yardmaster-only diagnostic package captured';nextAction='Validate the repair contract and candidate package.'}
  else if(rawState==='waiting-login'){phase='waiting for ChatGPT';waitingOn='You to sign in to ChatGPT on the Windows PC.';lastSuccessfulStep='Diagnostic package prepared';nextAction='Resume self-heal after sign-in.'}
  else if(rawState==='certifying'){phase='validating repair contract';waitingOn='Candidate manifest, regression contract, and SHA-256 verification.';lastSuccessfulStep='Repaired candidate downloaded from ChatGPT';nextAction='Stage the candidate and install isolated dependencies.'}
  else if(rawState==='testing'){
    const lower=test.toLowerCase();phase=lower.includes('test:play-store')?'running Play Store test':lower.includes('test:playwright')?'running Playwright regression tests':lower.includes('test:self-heal')?'running self-heal regression tests':lower.includes('npm-ci')||lower.includes('npm ci')?'installing dependencies':'running candidate certification';waitingOn=test||'Current candidate test';lastSuccessfulStep=lower.includes('test:play-store')?'Playwright regression tests passed':lower.includes('test:playwright')?'Self-heal regression tests passed':'Repair contract and SHA-256 verified';nextAction=lower.includes('test:play-store')?'Install only if the full Play Store test passes.':'Continue the remaining candidate tests.';
  }else if(['preparing-update','update-stubbed'].includes(rawState)){phase='candidate passed';waitingOn=rawState==='update-stubbed'?'Test fixture installation stub.':'The verified updater to install the candidate.';lastSuccessfulStep='Certification, self-heal, Playwright, and Play Store tests passed';nextAction='Install, restart, then hold workflow during the health soak.'}
  else if(rawState==='soaking'){phase='post-update health soak';waitingOn='The post-update health soak to pass.';lastSuccessfulStep='Verified candidate installed and Yardmaster restarted';nextAction='Resume the saved workflow only after the soak passes.'}
  else if(rawState==='complete'){phase='self-heal complete';waitingOn='Nothing.';lastSuccessfulStep='Post-update health soak passed';nextAction='Saved workflow is resuming or has resumed.'}
  else if(rawState==='failed'){phase='self-heal failed safely';waitingOn='A retry or manual repair.';lastSuccessfulStep=heal.lastSuccessfulStep||'Saved checkpoint preserved';nextAction='Retry from the saved diagnostic without losing the checkpoint.'}
  return {...heal,active:rawState!=='idle',reason:rootReason,phase,currentAction:heal.detail||'Self-heal is active.',waitingOn,candidateVersion:heal.candidateVersion||null,testingStage:test||null,lastSuccessfulStep,nextAction,resumeCheckpoint};
}
function redactConsoleLine(line){let s=String(line).replace(/\x1b\[[0-9;]*m/g,'');s=s.replace(/(authorization\s*:\s*bearer\s+)[^\s]+/ig,'$1[REDACTED]');s=s.replace(/\b(gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{25,}|sk-[A-Za-z0-9_-]{20,})\b/g,'[REDACTED]');s=s.replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|secret|credential)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s]+)/ig,'$1[REDACTED]');return s}function log(line){const s=redactConsoleLine(line);if(!s.trim())return;state.run.lastSignalAt=Date.now();state.run.lastLogAt=Date.now();state.run.log.push(s);state.run.log=state.run.log.slice(-350);parseLine(s);persist()}
function parseLine(s){const browser=releaseGateProgress(s);if(browser){Object.assign(state.run,browser);return}let m;if((m=s.match(/(?:ℹ\s*)?tests\s+(\d+)/i)))state.run.total=+m[1];if((m=s.match(/(?:ℹ\s*)?pass\s+(\d+)/i)))state.run.counts.pass=+m[1];if((m=s.match(/(?:ℹ\s*)?fail\s+(\d+)/i)))state.run.counts.fail=+m[1];if((m=s.match(/(?:ℹ\s*)?skipped\s+(\d+)/i)))state.run.counts.skip=+m[1];if((m=s.match(/(?:ℹ\s*)?timeout\s+(\d+)/i)))state.run.counts.timeout=+m[1];if((m=s.match(/^\[(?:RUNNING|PASS|FAIL|SKIP|TIMEOUT)\]\s+(?:NODE|PLAYWRIGHT):\s*(.+)/)))state.run.currentTest=m[1].slice(0,130);if((m=s.match(/^\s*[✔✓]\s+(.+)/)))state.run.currentTest=m[1].slice(0,130);if((m=s.match(/^\s*[✖×]\s+(.+)/)))state.run.currentTest=m[1].slice(0,130);if((m=s.match(/\b(\d+)\s*\/\s*(\d+)\b/))&&+m[2]>0){state.run.progress=Math.round(+m[1]/+m[2]*100)}else if(state.run.total){const done=(state.run.counts.pass||0)+(state.run.counts.fail||0)+(state.run.counts.skip||0);state.run.progress=Math.min(99,Math.round(done/state.run.total*100))}}
function versionParts(value){return String(value||'0').split('.').map(x=>Number.parseInt(x,10)||0)}
function versionGreater(candidate,current){const a=versionParts(candidate),b=versionParts(current);for(let i=0;i<Math.max(a.length,b.length);i++){if((a[i]||0)!==(b[i]||0))return (a[i]||0)>(b[i]||0)}return false}
async function fetchVerifiedOperatorRelease(){
  if(process.env.YARDMASTER_TEST_UPDATE_MANIFEST)return JSON.parse(process.env.YARDMASTER_TEST_UPDATE_MANIFEST);
  const manifestUrl=operatorManifestUrl(packageInfo);
  const response=await fetch(manifestUrl,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('Release service returned HTTP '+response.status+'.');
  return response.json();
}
function verifiedRelease(release){
  return validateOperatorRelease(release,{channel:packageInfo.releaseChannel,allowTestingCandidate:packageInfo.releaseChannel==='testing'});
}
async function launchOperatorUpdater(release,{requestedBy='automatic',resumeAfterUpdate=null}={}){
  verifiedRelease(release);
  const manifestUrl=operatorManifestUrl(packageInfo);
  const marker={from:packageInfo.version,to:release.version,requestedBy,requestedAt:Date.now(),resumeAfterUpdate:resumeAfterUpdate||state.workflow?.resumeAfterUpdate||null};
  fs.rmSync(path.join(dataDir,'operator-update-result.json'),{force:true});
  writeJson(updateResumePath,marker);
  state.update={state:'Updating',from:packageInfo.version,to:release.version,requestedBy,startedAt:Date.now()};
  activity('Yardmaster '+release.version+' is verified and available. Updating the PC operator now.');persist();
  if(process.env.YARDMASTER_TEST_UPDATE_STUB==='1'){state.update={...state.update,state:'Updating (test stub)',stubbed:true};persist();return {started:true,stubbed:true,from:packageInfo.version,to:release.version}}
  if(process.platform!=='win32'){state.update={state:'Available',version:release.version,error:'Automatic installation requires Windows.'};persist();return {started:false,available:true,version:release.version}}
  const updater=path.join(__dirname,'scripts','Update-Yardmaster.ps1');
  const args=['-NoProfile','-ExecutionPolicy','Bypass','-File',updater,'-ManifestUrl',manifestUrl,'-DataDir',dataDir];
  if(packageInfo.releaseChannel==='testing'&&release.verified!==true)args.push('-AllowTestingCandidate');
  try{await launchUpdaterProcess(args)}catch(error){
    fs.rmSync(updateResumePath,{force:true});
    state.update={state:'Update failed',version:packageInfo.version,error:'Could not start Windows updater: '+error.message};
    activity(state.update.error,'error');persist();throw error;
  }
  // The updater keeps the current app alive until checksum and canary checks pass.
  return {started:true,from:packageInfo.version,to:release.version};
}
async function requestOperatorUpdate({automatic=false,requestedBy='automatic'}={}){
  if(automatic&&(process.env.YARDMASTER_DISABLE_UPDATE_CHECKS==='1'||!config.autoUpdateOperator))return {skipped:true,reason:'automatic updates disabled'};
  if(String(state.update?.state||'').startsWith('Updating'))return {started:false,alreadyUpdating:true,to:state.update?.to||null};
  let release;try{release=verifiedRelease(await fetchVerifiedOperatorRelease())}catch(error){state.update={state:'Update failed',version:packageInfo.version,error:error.message};activity('Yardmaster update failed: '+error.message,'error');persist();throw error;}
  if(automatic&&release.verified!==true&&versionGreater(release.version,packageInfo.version)){state.update={state:'Available',version:release.version,candidate:true,detail:'Testing candidate available. Choose Update PC Yardmaster Now to install.'};persist();return {available:true,candidate:true,version:release.version}}
  if(!versionGreater(release.version,packageInfo.version)){state.update={state:'Current',version:packageInfo.version,checkedAt:Date.now()};persist();return {started:false,current:true,version:packageInfo.version}}
  const pausedCheckpoint=readPauseCheckpoint(dataDir);
  if(pausedCheckpoint&&state.run?.state==='paused'){
    activity('Updating Yardmaster while preserving suspended Play Store run '+(pausedCheckpoint.runId||'checkpoint')+'.');
    return launchOperatorUpdater(release,{requestedBy,resumeAfterUpdate:{kind:'paused-play-store',checkpoint:pausedCheckpoint}});
  }
  const protectedWork=workflowBusy?'the current ChatGPT handoff':(activeProcess||adoptedRunController||state.run?.state==='running')?'the current test':state.deployment?.state==='Waiting'?'the deployment watch':null;
  if(protectedWork){
    if(automatic)return {skipped:true,reason:'protected work is active',version:release.version};
    state.update={state:'Queued',from:packageInfo.version,to:release.version,version:release.version,requestedBy,requestedAt:Date.now(),waitingOn:protectedWork,release:{...release}};
    activity('Yardmaster '+release.version+' update queued until '+protectedWork+' reaches a safe stopping point.');persist();return {started:false,queued:true,version:release.version,waitingOn:protectedWork};
  }
  return launchOperatorUpdater(release,{requestedBy});
}
async function maybeStartQueuedOperatorUpdate(){
  if(state.update?.state!=='Queued'||workflowBusy||activeProcess||adoptedRunController||state.run?.state==='running'||state.deployment?.state==='Waiting')return false;
  const release=state.update.release||verifiedRelease(await fetchVerifiedOperatorRelease());
  await launchOperatorUpdater(release,{requestedBy:state.update.requestedBy||'queued mobile update',resumeAfterUpdate:state.workflow?.resumeAfterUpdate||null});
  return true;
}
async function checkForOperatorUpdate(){
  try{await requestOperatorUpdate({automatic:true,requestedBy:'automatic updater'})}
  catch(e){state.update={state:'Update check failed',version:packageInfo.version,error:e.message};activity('Operator update check failed: '+e.message,'warn')}
}
function readOperatorUpdateResult(){
  const file=path.join(dataDir,'operator-update-result.json');let result;try{result=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''))}catch{return;}
  if(!result)return;fs.rmSync(file,{force:true});
  if(result.state==='failed'){state.update={state:'Update failed',version:packageInfo.version,error:result.error};activity('Yardmaster update failed: '+result.error,'error');persist()}
}
function restoreSelfHealCheckpoint(checkpoint){
  if(!checkpoint)return {kind:'none'};
  const allowedConfig=['firebaseMode','firebaseLivePhase','branch','testType','chatMode','model','thinkingEffort','repoUpdateMode','autoPush','waitForDeploy','runAfterDeploy'];
  for(const key of allowedConfig)if(checkpoint.config&&key in checkpoint.config)config[key]=checkpoint.config[key];
  writeJson(cfgPath,config);
  if(checkpoint.workflow)state.workflow=checkpoint.workflow;
  if(checkpoint.run)state.run={...checkpoint.run,log:Array.isArray(checkpoint.run.log)?checkpoint.run.log.slice(-350):[]};
  if(checkpoint.deployment)state.deployment=checkpoint.deployment;
  if(checkpoint.chatgpt)state.chatgpt=checkpoint.chatgpt;
  const resume=checkpoint.resume||{kind:'none'};
  state.selfHeal={...state.selfHeal,state:'soaking',detail:'Self-heal update '+packageInfo.version+' started. Holding the saved workflow until the post-update health soak passes.',attempt:state.selfHeal?.attempt||0,maxAttempts:Number(config.maxSelfHealAttempts)||SELF_HEAL_MAX_ATTEMPTS,currentTest:'Post-update health soak',error:null,pendingResume:resume,log:state.selfHeal?.log||[]};
  activity('Self-heal restored the saved checkpoint. Workflow resume '+resume.kind+' is held until the post-update health soak passes.');
  persist();
  return resume;
}
function resumeSelfHealCheckpoint(checkpoint){
  const resume=checkpoint?.resume||state.selfHeal?.pendingResume||{kind:'none'};
  state.selfHeal={...state.selfHeal,pendingResume:null};
  if(resume.kind==='resume-handoff'){
    setTimeout(()=>{const wf=state.workflow||{};(wf.handsFree&&wf.taskPrompt?resumeImplementationTask():submitCurrentHandoff({resume:true})).catch(error=>{state.selfHeal={...state.selfHeal,state:'failed',error:error.message};activity('Checkpoint handoff resume failed: '+error.message,'error');persist()})},400);
  }else if(resume.kind==='resume-test'){
    setTimeout(async()=>{try{const info=discoverAdoptableReleaseGate(config.repositoryPath);if(info?.active)await adoptManualPlayStoreRun();else runTest({retry:true,closedLoop:!!resume.closedLoop,selfHealResume:true})}catch(error){state.selfHeal={...state.selfHeal,state:'failed',error:error.message};activity('Checkpoint test resume failed: '+error.message,'error');persist()}},400);
  }else if(resume.kind==='watch-deployment'&&resume.expectedCommit){
    setTimeout(()=>watchDeployment(String(resume.expectedCommit)).catch(error=>{state.selfHeal={...state.selfHeal,state:'failed',error:error.message};activity('Checkpoint deployment resume failed: '+error.message,'error');persist()}),400);
  }else if(resume.kind==='restore-only'){
    activity('Self-heal restored the saved approval state. No automatic action was taken.');
  }else{
    activity('Self-heal completed with no saved workflow action to resume.');
  }
}
function confirmSelfHealUpdateAfterSoak(marker,checkpoint){
  const soakMs=Math.max(5000,Number(process.env.YARDMASTER_SELF_HEAL_SOAK_MS||60000));
  state.selfHeal={...state.selfHeal,state:'soaking',detail:'Updated Yardmaster '+packageInfo.version+' is running. Verifying stability for '+Math.round(soakMs/1000)+' seconds before resuming saved work.',currentTest:'Post-update health soak'};persist();
  setTimeout(()=>{
    const current=readJson(updateResumePath,null);
    if(!current||current.requestedBy!=='self-heal'||String(current.to)!==String(packageInfo.version))return;
    try{fs.rmSync(updateResumePath,{force:true})}catch{}
    clearSelfHealRequest(dataDir);
    state.selfHeal={...state.selfHeal,state:'complete',detail:'Self-heal update '+packageInfo.version+' passed its post-update health soak. Resuming saved work.',currentTest:null,error:null,completedAt:Date.now()};
    state.update={state:'Updated',from:marker.from||null,to:packageInfo.version,requestedBy:'self-heal',finishedAt:Date.now()};
    activity('Self-heal update '+packageInfo.version+' passed its post-update health soak. Resuming the saved workflow now.');
    persist();
    resumeSelfHealCheckpoint(checkpoint||current.resumeAfterUpdate?.checkpoint||null);
    notify('Yardmaster self-heal complete','Yardmaster '+packageInfo.version+' is healthy. The saved workflow is resuming.');
  },soakMs);
}
function resumeAfterOperatorUpdate(){
  const marker=readJson(updateResumePath,null);if(!marker)return;
  const resume=marker.resumeAfterUpdate||state.workflow?.resumeAfterUpdate||null;
  if(resume?.kind!=='self-heal'){try{fs.rmSync(updateResumePath,{force:true})}catch{}}
  state.update={state:'Updated',from:marker.from||null,to:packageInfo.version,requestedBy:marker.requestedBy||null,finishedAt:Date.now()};
  activity('Yardmaster restarted on version '+packageInfo.version+' after the PC update.');
  if(resume?.kind==='self-heal'){
    restoreSelfHealCheckpoint(resume.checkpoint||null);
    confirmSelfHealUpdateAfterSoak(marker,resume.checkpoint||null);
  }else if(resume?.kind==='continue-after-run'){
    state.workflow={...(state.workflow||{}),state:'update-resumed',resumeAfterUpdate:null};currentRunOptions=resume.options||{};
    activity('Resuming the workflow from the completed '+(Number(resume.code)===0?'passing':'failed')+' test after the Yardmaster update.');
    setTimeout(()=>continueAfterRun(Number(resume.code)||0,currentRunOptions),450);
  }else if(resume?.kind==='paused-play-store'){
    const checkpoint=readPauseCheckpoint(dataDir)||resume.checkpoint||null;
    state.run={...(state.run||{}),state:'paused',title:'Paused Play Store Test',currentTest:checkpoint?.currentTest||state.run?.currentTest||'Paused checkpoint',pauseCheckpoint:checkpoint};
    state.workflow={...(state.workflow||{}),state:'paused',resumeAfterUpdate:null};
    activity('Yardmaster updated successfully. The Play Store run remains suspended at '+(checkpoint?.runId||'its durable checkpoint')+'. Press Resume when you are ready.');
  }
  notify('Yardmaster updated','The Windows operator restarted on version '+packageInfo.version+'.');persist();
}
function repositoryPathOrThrow(){
  if(validRepositoryPath(config.repositoryPath))return config.repositoryPath;
  const detected=detectRepositoryPath(config.repositoryPath);
  if(detected){
    const previous=config.repositoryPath;
    config.repositoryPath=detected;writeJson(cfgPath,config);
    if(state?.activity)activity('Recovered 86 Chaos repository path: '+detected+(previous&&previous!==detected?' (was '+previous+')':''),'warn');
    return detected;
  }
  throw new Error('Yardmaster cannot find the 86 Chaos repository. Choose the folder that contains both package.json and .git under Branches → Repository Path.');
}
function localBranches(){try{const repoPath=repositoryPathOrThrow();return execFileSync('git',['for-each-ref','--format=%(refname:short)','refs/heads'],{cwd:repoPath,encoding:'utf8',windowsHide:true}).split(/\r?\n/).map(x=>x.trim()).filter(Boolean)}catch{return []}}
function ensureNonProductionBranch(branch,operation='automatic work'){if(/^(main|master|production|prod)$/i.test(String(branch||'')))throw new Error(`Yardmaster will not run ${operation} on the 86 Chaos production/main branch. Select testing or another non-production branch.`)}
function ensureSelectedBranch(){const repoPath=repositoryPathOrThrow();if(!/^[A-Za-z0-9._\/-]+$/.test(config.branch))throw new Error('Invalid branch name.');const run=a=>execFileSync('git',a,{cwd:repoPath,encoding:'utf8',windowsHide:true}).trim();const current=run(['branch','--show-current']);if(current===config.branch)return;const status=run(['status','--porcelain']);if(status)throw new Error('Working tree is not clean. Yardmaster will not switch branches until local changes are committed, stashed, or discarded.');run(['switch',config.branch]);activity('Switched local repository to '+config.branch+'.')}
function psCommand(type){if(type==='playwright')return 'npm run test:playwright';if(type==='full')return 'npm run test:play-store';if(type==='targeted')return 'npm run test:current-release-targeted';return 'npm run test:play-store:delta'}
function latestDownloadedZip(){
  const downloads=path.join(os.homedir(),'Downloads');if(!fs.existsSync(downloads))return null;
  return fs.readdirSync(downloads).filter(n=>/\.zip$/i.test(n)).map(n=>path.join(downloads,n)).filter(p=>fs.statSync(p).isFile()).sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs)[0]||null;
}
async function executeCommandBlock(textBlock){
  const lines=String(textBlock||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(lines[0]!=='YARDMASTER')throw new Error('Command block must begin with YARDMASTER.');
  const results=[];
  for(const line of lines.slice(1)){
    if(/^(IF_PASS|IF_FAIL|END)$/i.test(line)){results.push({command:line,state:'accepted-control-marker'});continue}
    const parts=line.split(/\s+/),verb=String(parts.shift()||'').toUpperCase(),arg=parts.join(' ').trim();
    if(verb==='REPO'){if(arg.toLowerCase()==='86chaos')config.repositoryPath=defaults.repositoryPath;else if(arg)config.repositoryPath=arg;writeJson(cfgPath,config);results.push({command:line,state:'ok'});}
    else if(verb==='BRANCH'){if(!/^[A-Za-z0-9._\/-]+$/.test(arg))throw new Error('Invalid branch name.');ensureNonProductionBranch(arg,'automatic protocol work');config.branch=arg;writeJson(cfgPath,config);results.push({command:line,state:'ok'});}
    else if(verb==='PRESERVE'){if(!/^(.git|\.env\.test\.local|credentials)$/i.test(arg))throw new Error('Unsupported PRESERVE target: '+arg);results.push({command:line,state:'already-protected'});}
    else if(verb==='INSTALL'){if(arg!=='latest_downloaded_zip')throw new Error('Only INSTALL latest_downloaded_zip is supported.');const zip=latestDownloadedZip();if(!zip)throw new Error('No ZIP file was found in Downloads.');state.workflow.pendingRepair={zipPath:zip,receivedAt:Date.now(),attempt:state.workflow.repairAttempts||0};await applyPendingRepair();results.push({command:line,state:'started'});break;}
    else if(verb==='RUN'){const t=arg.toLowerCase();if(!['delta','targeted','full','playwright'].includes(t))throw new Error('RUN supports delta, targeted, full, or playwright.');config.testType=t;writeJson(cfgPath,config);runTest({retry:!!state.workflow?.firebase,source:'chatgpt-command-block'});results.push({command:line,state:'started'});break;}
    else if(verb==='PUSH'){if(arg)config.branch=arg;await gitPush();results.push({command:line,state:'ok'});}
    else if(verb==='WAIT_VERCEL'){const commit=gitRun(['rev-parse','HEAD']);await watchDeployment(commit);results.push({command:line,state:'ok'});}
    else if(verb==='SEND_FAILURE'){await submitCurrentHandoff();results.push({command:line,state:'started'});}
    else if(verb==='STOP'){stopRun();results.push({command:line,state:'ok'});}
    else if(verb==='PAUSE'){pauseRun();results.push({command:line,state:'ok'});}
    else if(verb==='RESUME'){await resumeRun();results.push({command:line,state:'ok'});}
    else throw new Error('Unsupported Yardmaster command: '+verb);
  }
  activity('Executed Yardmaster command block.');persist();return results;
}
function saveRunRecord(exitCode){
  try{
    const dir=path.join(dataDir,'runs');fs.mkdirSync(dir,{recursive:true});
    const id=new Date(runStartedAt||Date.now()).toISOString().replace(/[:.]/g,'-');
    const runDir=path.join(dir,id);fs.mkdirSync(runDir,{recursive:true});
    const repoPath=state.run.cwd||config.repositoryPath,gitCommit=validRepositoryPath(repoPath)?gitRun(['rev-parse','HEAD']):null,configDigest=crypto.createHash('sha256').update(JSON.stringify(config)).digest('hex');
    const record={id,startedAt:state.run.startedAt||runStartedAt||null,finishedAt:state.run.finishedAt||Date.now(),branch:config.branch,testType:state.run.testType||config.testType,exitCode,state:state.run.state,counts:state.run.counts,currentTest:state.run.currentTest,elapsedMs:state.run.elapsedMs,command:state.run.command||psCommand(config.testType),cwd:repoPath,project:workingProject(state.run,repoPath),gitCommit,configHash:configDigest};
    writeJson(path.join(runDir,'metadata.json'),record);
    recordTestIntelligence(dataDir,record);
    if(exitCode!==0){const memory=recordFailureMemory(dataDir,{stage:state.workflow?.state,test:record.currentTest,message:state.workflow?.error||state.run.title,logs:state.run.log||[],version:packageInfo.version,runId:id});state.intelligence.lastFailureFingerprint=memory.fingerprint}
    else if(state.intelligence?.lastFailureFingerprint&&state.workflow?.repairApplied){recordKnownRepair(dataDir,state.intelligence.lastFailureFingerprint,{version:packageInfo.version,summary:'Repair verified by passing '+config.testType+' run.',commit:gitCommit,files:validRepositoryPath(repoPath)?detectChangedFiles(repoPath,{base:'HEAD~1',head:'HEAD'}):[]})}
    fs.writeFileSync(path.join(runDir,'console.log'),(state.run.log||[]).join('\n'),'utf8');
    fs.writeFileSync(path.join(runDir,'stdout.log'),(state.run.stdout||[]).join('\n'),'utf8');
    fs.writeFileSync(path.join(runDir,'stderr.log'),(state.run.stderr||[]).join('\n'),'utf8');
    if(exitCode!==0)fs.writeFileSync(path.join(runDir,'failure.txt'),['YARDMASTER STRUCTURED FAILURE','Command: '+record.command,'Working directory: '+record.cwd,'Branch: '+record.branch,'Exit code: '+exitCode,'Current test: '+(record.currentTest||''),'',...(state.run.log||[]).slice(-140)].join('\n'),'utf8');
    state.lastRunEvidenceDir=runDir;
  }catch(e){activity('Could not save local run history: '+e.message,'warn')}
}
function readRunHistory(limit=20){
  try{
    const dir=path.join(dataDir,'runs');if(!fs.existsSync(dir))return [];
    return fs.readdirSync(dir,{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>{
      try{return readJson(path.join(dir,d.name,'metadata.json'),null)}catch{return null}
    }).filter(Boolean).sort((a,b)=>(b.finishedAt||0)-(a.finishedAt||0)).slice(0,limit);
  }catch{return []}
}
function failureSummary(){
  const lines=(state.run.log||[]).slice(-120);
  return lines.join('\n').slice(-24000);
}
function compactFailureSummary(){
  const run=state.run||{},lines=(run.log||[]).map(line=>redactConsoleLine(line).replace(/\s+/g,' ').trim()).filter(Boolean);
  const signal=[...lines].reverse().find(line=>/(fatal|failed|failure|error|blocked|timeout|preflight|exit code|exception)/i.test(line))||String(run.currentTest||run.title||'Test run failed.');
  const parts=[];
  if(run.currentTest)parts.push('Test: '+String(run.currentTest).replace(/\s+/g,' ').trim().slice(0,140));
  if(Number.isFinite(Number(run.exitCode)))parts.push('Exit: '+Number(run.exitCode));
  parts.push('Failure: '+signal.slice(0,280));
  return parts.join(' | ').slice(0,520);
}
function knownFailureRepairContext(){
  const known=lookupFailureMemory(dataDir,{stage:state.workflow?.state,test:state.run?.currentTest,message:state.workflow?.error||state.run?.title,logs:state.run?.log||[]});
  if(!known)return 'Known failure history: no previous fingerprint match.';
  const repairs=(known.repairs||[]).slice(-3).map(x=>'v'+String(x.version||'?')+': '+String(x.summary||'verified repair')).join(' | ');
  return 'Known failure history: this fingerprint has occurred '+String(known.occurrences||1)+' time(s). Prior verified repairs: '+(repairs||'none recorded')+'. Re-diagnose against current evidence; do not blindly reuse an old fix.';
}
function latestReleaseGateSlimZip(){
  const root=repositoryPathOrThrow(),bad=new Set(['.git','node_modules','build','dist','coverage','.vercel','.firebase']);
  let best=null;
  const walk=dir=>{
    let entries=[];try{entries=fs.readdirSync(dir,{withFileTypes:true})}catch{return}
    for(const e of entries){
      if(e.isDirectory()){if(!bad.has(e.name))walk(path.join(dir,e.name));continue}
      if(!e.isFile()||!/SLIM-UPLOAD-ME.*\.zip$/i.test(e.name))continue;
      const p=path.join(dir,e.name),st=fs.statSync(p);
      if(runStartedAt&&st.mtimeMs<runStartedAt-60000)continue;
      if(!best||st.mtimeMs>best.mtime)best={path:p,mtime:st.mtimeMs};
    }
  };
  walk(root);return best?.path||null;
}
function ensureCleanBeforeRepair(){
  const repoPath=repositoryPathOrThrow();const status=execFileSync('git',['status','--porcelain'],{cwd:repoPath,encoding:'utf8',windowsHide:true}).trim();
  if(status&&!state.workflow?.repairApplied)throw new Error('Local repository has changes that were not created by Yardmaster. Commit, stash, or discard them before applying a repaired ZIP.');
}
async function buildHandoff(failureArchive=''){
  if(continuousLoopFixture)return continuousLoopFixture.buildHandoff({failure:failureSummary(),prompt:repairPrompt()});
  const outDir=path.join(dataDir,'handoffs');fs.mkdirSync(outDir,{recursive:true});
  const out=path.join(outDir,`Yardmaster-Handoff-${Date.now()}.zip`);
  const script=path.join(__dirname,'scripts','New-Handoff.ps1');
  await execFileAsync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-RepoPath',repositoryPathOrThrow(),'-OutputPath',out,'-FailureSummary',failureSummary(),'-EvidenceDir',String(state.lastRunEvidenceDir||''),'-FailureArchive',failureArchive],{cwd:__dirname,encoding:'utf8',windowsHide:true,maxBuffer:20*1024*1024,timeout:180000});
  return out;
}
function selfHealCheckpoint(){
  return captureWorkflowCheckpoint({state,config,version:packageInfo.version});
}
function latestSelfHealDiagnostic(){
  const wf=state.workflow?.diagnostic;if(wf?.path&&fs.existsSync(wf.path))return wf.path;
  const request=readSelfHealRequest(dataDir);if(request?.diagnosticPath&&fs.existsSync(request.diagnosticPath))return request.diagnosticPath;
  return null;
}
function queueSelfHeal(reason,diagnosticPath=null,checkpoint=selfHealCheckpoint()){
  if(!config.autoSelfHeal)return null;
  const source=diagnosticPath&&fs.existsSync(diagnosticPath)?diagnosticPath:createSelfHealFailureBundle(dataDir,{reason,attempt:0,checkpoint,testResult:{stage:'yardmaster-runtime',stdout:String(reason||''),stderr:''}});
  const failureReason=String(reason||'Yardmaster internal failure');const memory=recordFailureMemory(dataDir,{stage:'yardmaster-self-heal',test:state.run?.currentTest,message:failureReason,logs:state.selfHeal?.log||state.run?.log||[],version:packageInfo.version});state.intelligence.lastFailureFingerprint=memory.fingerprint;const request={schema:1,reason:failureReason,rootReason:failureReason,diagnosticPath:source,checkpoint,createdAt:new Date().toISOString(),attempt:0};
  writeSelfHealRequest(dataDir,request);
  state.selfHeal={state:'queued',reason:failureReason,detail:'Yardmaster captured its own failure and queued a self-heal.',attempt:0,maxAttempts:Number(config.maxSelfHealAttempts)||SELF_HEAL_MAX_ATTEMPTS,currentTest:null,diagnostic:path.basename(source),error:null,log:[]};
  activity('Self-heal queued: '+String(reason||'internal failure').slice(0,300),'warn');persist();
  if(process.env.YARDMASTER_TEST_SELF_HEAL_QUEUE_ONLY!=='1')setTimeout(()=>runPendingSelfHeal().catch(error=>{state.selfHeal={...state.selfHeal,state:'failed',error:error.message,detail:'Self-heal stopped safely.'};activity('Self-heal failed: '+error.message,'error');persist()}),750);
  return request;
}
async function runPendingSelfHeal(){
  if(workflowBusy)return false;
  let request=readSelfHealRequest(dataDir);if(!request)return false;if(!request.rootReason){request={...request,rootReason:String(request.reason||'Yardmaster internal failure')};writeSelfHealRequest(dataDir,request)}
  const maxAttempts=Math.max(1,Math.min(10,Number(config.maxSelfHealAttempts)||SELF_HEAL_MAX_ATTEMPTS));
  let diagnostic=String(request.diagnosticPath||'');if(!diagnostic||!fs.existsSync(diagnostic))throw new Error('Self-heal diagnostic ZIP is unavailable.');
  workflowBusy=true;cancelRequested=false;
  try{
    for(let attempt=Math.max(1,Number(request.attempt||0)+1);attempt<=maxAttempts;attempt++){
      request={...request,attempt};writeSelfHealRequest(dataDir,request);
      const escalation=selfHealEscalation(attempt,maxAttempts);state.selfHeal={...state.selfHeal,state:'chatgpt',detail:'Sending Yardmaster diagnostic to ChatGPT for self-repair.',attempt,maxAttempts,escalation,currentTest:'ChatGPT repair',diagnostic:path.basename(diagnostic),error:null,startedAt:state.selfHeal?.startedAt||Date.now(),log:state.selfHeal?.log||[],attempts:[...(state.selfHeal?.attempts||[]),{attempt,startedAt:Date.now(),stage:'chatgpt',escalation:escalation.label}].slice(-10)};persist();
      const result=await submitRepairToChatGPT({loopRun:!!state.workflow?.closedLoop||!!config.chatLoopEnabled,mode:config.chatMode,model:config.model,thinkingEffort:config.thinkingEffort,prompt:selfHealPrompt({currentVersion:packageInfo.version,reason:request.rootReason||request.reason,checkpoint:request.checkpoint,attempt,maxAttempts}),artifactPath:diagnostic,dataDir,onStatus:m=>{state.selfHeal={...state.selfHeal,state:'chatgpt',detail:m,currentTest:'ChatGPT repair'};activity('Self-heal: '+m);persist()},shouldCancel:()=>cancelRequested});
      if(result.state==='login_required'){state.selfHeal={...state.selfHeal,state:'waiting-login',detail:'ChatGPT sign-in is required before self-heal can continue.',currentTest:null};persist();notify('Yardmaster self-heal needs you','Sign in to ChatGPT on the Windows PC, then resume self-heal.');return false}
      if(result.state!=='downloaded'||!result.repairPath)throw new Error('Self-heal did not receive a complete Yardmaster application ZIP.');
      state.selfHeal.requiredAction=null;
      let plan;
      try{plan=inspectSelfHealArchive(result.repairPath,{currentVersion:packageInfo.version,expectedFailure:request.rootReason||request.reason,currentAppRoot:__dirname})}
      catch(error){
        if(attempt>=maxAttempts)throw error;
        diagnostic=createSelfHealFailureBundle(dataDir,{reason:error.message,attempt,checkpoint:request.checkpoint,testResult:{stage:'self-heal-plan-validation',stdout:'',stderr:error.message},sourceDiagnostic:diagnostic});
        request={...request,reason:'Previous self-heal package validation failed: '+error.message,diagnosticPath:diagnostic};writeSelfHealRequest(dataDir,request);continue;
      }
      state.selfHeal={...state.selfHeal,state:'certifying',detail:'Downloading and certifying the published Yardmaster '+plan.version+' release.',currentTest:'npm ci → check → self-heal → Playwright → full Play Store',candidateVersion:plan.version};persist();
      const workRoot=path.join(dataDir,'self-heal','staging','attempt-'+attempt+'-'+Date.now());
      try{
        const certified=await fetchAndCertifyPublishedSelfHeal(plan,{currentVersion:packageInfo.version,expectedFailure:request.rootReason||request.reason,currentAppRoot:__dirname,workRoot,testEnvironment:firebaseEnvironment({run:request.checkpoint?.workflow?.firebase||newFirebaseRun(request.checkpoint?.config||config),bridge:firebaseSession?.bridge,liveUrl:config.testingUrl}),onStatus:m=>{state.selfHeal={...state.selfHeal,state:'testing',detail:m,currentTest:m};activity('Self-heal: '+m);persist()},onLine:(line,stream)=>{const clean=redactConsoleLine(line);if(clean.trim()){state.selfHeal.log=[...(state.selfHeal.log||[]),clean].slice(-250);persist()}}});
        state.selfHeal={...state.selfHeal,state:'preparing-update',detail:'All self-heal tests and isolated canary passed. Installing Yardmaster '+certified.version+'.',currentTest:'Installing verified release',candidateVersion:certified.version,certifiedTests:certified.tests,attempts:(state.selfHeal.attempts||[]).map(x=>x.attempt===attempt?{...x,version:certified.version,stage:'candidate-passed',result:'pass',canary:certified.canary}:x)};persist();
        const marker={from:packageInfo.version,to:certified.version,requestedBy:'self-heal',requestedAt:Date.now(),resumeAfterUpdate:{kind:'self-heal',checkpoint:request.checkpoint}};
        writeJson(updateResumePath,marker);
        writeJson(supervisorStopPath,{reason:'self-heal-update',until:Date.now()+5*60*1000});
        notify('Yardmaster self-heal passed','All Yardmaster self-heal, Playwright, and full Play Store tests passed. Updating to '+certified.version+'.');
        if(process.env.YARDMASTER_TEST_SELF_HEAL_STUB==='1'){state.selfHeal={...state.selfHeal,state:'update-stubbed',archive:certified.archive};persist();return true}
        if(process.platform!=='win32')throw new Error('Automatic self-heal installation requires Windows.');
        const updater=path.join(__dirname,'scripts','Update-Yardmaster.ps1');
        spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',updater,'-PackagePath',certified.archive,'-ExpectedSha256',certified.sha256],{detached:true,stdio:'ignore',windowsHide:true}).unref();
        setTimeout(()=>process.exit(0),900);return true;
      }catch(error){
        const testResult=error.testResult||{stage:'published-release-certification',stdout:'',stderr:error.message};
        state.selfHeal={...state.selfHeal,state:'testing',detail:'Self-heal candidate failed certification. Preparing another repair attempt.',currentTest:testResult.stage,error:error.message,attempts:(state.selfHeal.attempts||[]).map(x=>x.attempt===attempt?{...x,stage:testResult.stage,result:'failed',failure:error.message}:x)};activity('Self-heal candidate failed: '+error.message,'error');persist();
        if(attempt>=maxAttempts)throw error;
        diagnostic=createSelfHealFailureBundle(dataDir,{reason:error.message,attempt,checkpoint:request.checkpoint,testResult,sourceDiagnostic:diagnostic});
        request={...request,reason:'Previous self-heal candidate failed '+testResult.stage+': '+error.message,diagnosticPath:diagnostic};writeSelfHealRequest(dataDir,request);
      }
    }
  }catch(error){if(holdChatGPTForAction(error,true))return false;throw error;}finally{workflowBusy=false;persist()}
  return false;
}
function resumePendingSelfHeal(){
  const request=readSelfHealRequest(dataDir);if(!request||state.selfHeal?.state==='waiting-action')return;
  const updateMarker=readJson(updateResumePath,null);
  if(updateMarker?.requestedBy==='self-heal'&&updateMarker?.resumeAfterUpdate?.kind==='self-heal')return;
  state.selfHeal={...state.selfHeal,state:'queued',detail:'Recovered a pending Yardmaster self-heal request after restart.',attempt:Number(request.attempt||0),maxAttempts:Number(config.maxSelfHealAttempts)||SELF_HEAL_MAX_ATTEMPTS,diagnostic:path.basename(String(request.diagnosticPath||''))};persist();
  if(process.env.YARDMASTER_TEST_SELF_HEAL_QUEUE_ONLY!=='1')setTimeout(()=>runPendingSelfHeal().catch(error=>{state.selfHeal={...state.selfHeal,state:'failed',detail:'Self-heal stopped safely.',error:error.message,currentTest:null};activity('Self-heal failed: '+error.message,'error');notify('Yardmaster self-heal failed',error.message);persist()}),2500);
}
function buildImplementationHandoff(taskPrompt){
  const outDir=path.join(dataDir,'handoffs');fs.mkdirSync(outDir,{recursive:true});
  const out=path.join(outDir,`Yardmaster-Implementation-${Date.now()}.zip`);
  const script=path.join(__dirname,'scripts','New-Handoff.ps1');
  execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-RepoPath',repositoryPathOrThrow(),'-OutputPath',out,'-WorkType','implementation','-TaskPrompt',String(taskPrompt||'')],{cwd:__dirname,encoding:'utf8',windowsHide:true,maxBuffer:20*1024*1024});
  return out;
}
function implementationPrompt(taskPrompt){
  return `Yardmaster implementation handoff. Inspect the uploaded current 86 Chaos application before changing anything, then implement the requested work with surgical, evidence-backed changes. Treat 86 Chaos as production software. Preserve correct behavior, .git, local environment/config files, Android and iPhone/iOS compatibility, and existing security boundaries. Do not request, expose, or add credentials. MANDATORY COVERAGE RULE: every implementation change must add or update BOTH Play Store/release-gate regression coverage AND Playwright regression coverage for the exact feature or fix; do not return a build without both categories. Every new build must increment the application version. Use targeted/delta verification for this ordinary change; use the full Play Store gate only when explicitly requested or for major release certification. Avoid destructive Git operations, minimize ongoing Firebase/Vercel/other infrastructure costs without weakening reliability or security, and never push production/main. Return ONE COMPLETE APPLICATION ZIP when finished. Yardmaster will apply it locally and verify it. If you need Yardmaster to run a Windows command before returning the ZIP, respond with a YARDMASTER block containing POWERSHELL ... END_POWERSHELL ... END; Yardmaster will copy/paste it into PowerShell and send the result back to you.\n\nRequested work:\n${String(taskPrompt||'').trim()}`;
}
function parseChatLoopPlan(value=config.chatLoopPlan){
  const lines=Array.isArray(value)?value:String(value||'').split(/\r?\n|;/);
  const plan=[];
  for(const raw of lines){
    const parts=(Array.isArray(raw)?raw:String(raw).split('|')).map(x=>String(x||'').trim());
    if(!parts[0])continue;
    const mode=/^chat$/i.test(parts[0])?'Chat':'Work',model=(parts[1]||config.model||'GPT-5.6 Sol').slice(0,100),thinking=['Instant','Medium','High'].includes(parts[2])?parts[2]:(config.thinkingEffort||'High');
    plan.push({mode,model,thinkingEffort:thinking});
    if(plan.length>=20)break;
  }
  return plan.length?plan:[{mode:config.chatMode||'Work',model:config.model||'GPT-5.6 Sol',thinkingEffort:config.thinkingEffort||'High'}];
}
function nextChatLoopSelection(wf,{advance=true}={}){
  const fallback={mode:config.chatMode||'Work',model:config.model||'GPT-5.6 Sol',thinkingEffort:config.thinkingEffort||'High'};
  if(!config.chatLoopEnabled)return {...fallback,routeLabel:'Single selection'};
  const plan=parseChatLoopPlan(),index=Math.max(0,Number(wf?.chatLoopIndex)||0)%plan.length,selection=plan[index];
  if(wf){wf.chatLoopCurrent={...selection,index,total:plan.length};if(advance)wf.chatLoopIndex=(index+1)%plan.length;}
  return {...selection,routeLabel:`Step ${index+1}/${plan.length}: ${selection.mode} • ${selection.model} • ${selection.thinkingEffort}`};
}
function repairPrompt(){
  return `Yardmaster automated repair handoff. The attached ZIP already contains the current app, YARDMASTER_PROMPT.txt, full logs, and release-gate evidence. Inspect the ZIP, diagnose the actual failure, make only the smallest evidence-backed repair, add/update BOTH Play Store/release-gate coverage AND Playwright regression coverage for the exact repaired failure, bump the app version for any new build, do not push production, and return ONE COMPLETE APPLICATION ZIP. Do not ask me to paste anything already in the archive. If you need Yardmaster to run a Windows command before you can finish, return exactly a YARDMASTER block containing POWERSHELL ... END_POWERSHELL ... END; Put the entire YARDMASTER protocol in ONE fenced code block to preserve literal syntax. Yardmaster validates and executes the complete script file and sends the result back. The current source and reports are already attached; do not launch a browser attachment helper or use a browser debugging port.\n\n${compactFailureSummary()}\n\n${knownFailureRepairContext()}`;
}
async function submitCurrentHandoff({resume=false}={}){
  if(workflowBusy)return;
  const wf=state.workflow||(state.workflow={state:'idle',repairAttempts:0,pendingRepair:null,repairApplied:false,approval:null});
  if(process.env.YARDMASTER_TEST_HANDOFF_STUB==='1'){
    workflowBusy=true;
    wf.handoffPath=null;
    wf.handoffKind='test-stub';
    wf.repairAttempts=(wf.repairAttempts||0)+1;
    wf.state='chatgpt-stubbed';
    const selection=nextChatLoopSelection(wf);
    state.chatgpt={state:'Working',...selection};
    activity('Automatic failure handoff started after a failed test run.');
    workflowBusy=false;
    persist();
    return {state:'stubbed'};
  }
  workflowBusy=true;
  try{
  if(!wf.handoffPath||!fs.existsSync(wf.handoffPath)||wf.handoffKind==='release-gate-slim'||/SLIM-UPLOAD-ME.*\.zip$/i.test(wf.handoffPath)){
    const slim=wf.handoffPath&&fs.existsSync(wf.handoffPath)&&/SLIM-UPLOAD-ME.*\.zip$/i.test(wf.handoffPath)?wf.handoffPath:latestReleaseGateSlimZip();
    wf.failureReportPath=slim||wf.failureReportPath||null;
    wf.state='preparing-handoff';persist();
    wf.handoffPath=await buildHandoff(wf.failureReportPath||'');
    wf.handoffKind='source-and-failure';
    activity('Prepared current application source and saved failure evidence in one ChatGPT handoff ZIP.');
  }else if(resume){
    activity('Resuming the current failed test from its existing failure ZIP. The Play Store gate will not restart.');
  }
  }catch(error){workflowBusy=false;wf.state='handoff-error';wf.error=error.message;persist();throw error}
  if(!resume)wf.repairAttempts=(wf.repairAttempts||0)+1;
  const selection=nextChatLoopSelection(wf);
  if(resume)wf.resumeStartedAt=Date.now();
  wf.state='chatgpt';wf.approval=null;wf.error=null;wf.diagnostic=null;state.chatgpt={state:'Working',...selection};activity(`${resume?'Resuming':'Sending'} failure to ChatGPT (${selection.mode}, ${selection.model}, ${selection.thinkingEffort}), repair attempt ${wf.repairAttempts}/${config.maxRepairAttempts}.`);
  try{
    const result=await (continuousLoopFixture?.submitRepair||submitRepairToChatGPT)({loopRun:!!wf.closedLoop||!!config.chatLoopEnabled,mode:selection.mode,model:selection.model,thinkingEffort:selection.thinkingEffort,prompt:repairPrompt(),artifactPath:wf.handoffPath,dataDir,onStatus:m=>{state.chatgpt={state:m,...selection};activity(m);persist()},shouldCancel:()=>cancelRequested,onAssistantProtocol:executeProtocol});
    if(result.state==='login_required'){
      wf.repairAttempts=Math.max(0,(wf.repairAttempts||1)-1);wf.state='waiting-login';state.chatgpt={state:'Sign in required',detail:result.message};activity(result.message||'Sign in to ChatGPT in the Yardmaster ChatGPT window, then choose Resume Handoff.','warn');notify('Yardmaster needs you','Sign in to ChatGPT on the Windows PC, then resume the handoff.');return;
    }
    if(result.state!=='downloaded'||!result.repairPath)throw new Error('ChatGPT did not return a repaired ZIP.');
    wf.requiredAction=null;wf.pendingRepair={zipPath:result.repairPath,receivedAt:Date.now(),attempt:wf.repairAttempts};wf.state='repair-downloaded';state.chatgpt={state:'Repair downloaded'};activity('ChatGPT repair ZIP downloaded.');
    if(wf.closedLoop||wf.handsFree||config.repoUpdateMode==='automatic')await applyPendingRepair();
    else if(config.repoUpdateMode==='ask'){wf.approval={type:'repair',message:'Apply the downloaded repair to the local repository?',createdAt:Date.now()};wf.state='waiting-approval';activity('Repair is waiting for your approval.','warn');notify('Yardmaster approval needed','A repaired app ZIP is ready. Approve the local repository update to continue.')}
    else {wf.state='download-only';activity('Repair downloaded. Local Repo Update is set to Never, so no files were changed.');notify('Yardmaster repair downloaded','Repo Update is set to Never. Open Yardmaster when you are ready.')}
  }catch(e){
    if(cancelRequested){wf.state='stopped';state.chatgpt={state:'Stopped'};activity('ChatGPT handoff stopped by user.','warn')}else if(holdChatGPTForAction(e)){}else{wf.state='handoff-error';wf.error=e.message;wf.diagnostic=e.diagnostic||null;state.chatgpt={state:'Error',detail:e.message,diagnostic:e.diagnostic?.name||null};activity('ChatGPT handoff failed: '+e.message+(e.diagnostic?.name?' Diagnostic: '+e.diagnostic.name:''),'error');notify('Yardmaster handoff failed',e.message);if(config.autoSelfHeal&&!['CHATGPT_COMPOSER_UNAVAILABLE','CHATGPT_DOCK_UNAVAILABLE','CHATGPT_CONNECTION_INTERRUPTED'].includes(e.code))queueSelfHeal('ChatGPT handoff automation failed: '+e.message,e.diagnostic?.path||null,selfHealCheckpoint())}
  }finally{workflowBusy=false;persist();if(process.env.YARDMASTER_TEST_SELF_HEAL_QUEUE_ONLY!=='1'&&state.selfHeal?.state!=='waiting-action'&&readSelfHealRequest(dataDir))setTimeout(()=>runPendingSelfHeal().catch(error=>{state.selfHeal={...state.selfHeal,state:'failed',error:error.message,detail:'Self-heal stopped safely.'};activity('Self-heal failed: '+error.message,'error');persist()}),250);setTimeout(()=>maybeStartQueuedOperatorUpdate().catch(error=>activity('Queued Yardmaster update failed: '+error.message,'error')),75)}
}
async function submitImplementationTask(taskPrompt,{pushWhenPassed=false}={}){
  if(workflowBusy)throw new Error('Yardmaster is already handling another ChatGPT job.');
  if(activeProcess)throw new Error('A test process is already running.');
  const task=String(taskPrompt||'').trim();if(!task)throw new Error('Implementation task is empty.');if(task.length>12000)throw new Error('Implementation task is too long. Keep it under 12,000 characters.');
  ensureNonProductionBranch(config.branch,'New 86 Chaos Work');
  ensureSelectedBranch();
  ensureCleanBeforeRepair();
  config.testType='delta';writeJson(cfgPath,config);
  const wf=state.workflow={
    state:'implementation-handoff',
    repairAttempts:0,
    pendingRepair:null,
    repairApplied:false,
    approval:null,
    handsFree:true,
    pushWhenPassed:!!pushWhenPassed,
    taskPrompt:task,
    handoffKind:'implementation',
    handoffPath:buildImplementationHandoff(task),
    diagnostic:null,
    error:null,
    chatLoopIndex:Number(state.workflow?.chatLoopIndex)||0
  };
  workflowBusy=true;
  const selection=nextChatLoopSelection(wf);
  state.chatgpt={state:'Working',...selection};
  activity('Sending hands-free 86 Chaos implementation task to ChatGPT ('+selection.routeLabel+').');
  try{
    const result=await submitRepairToChatGPT({
      mode:selection.mode,
      model:selection.model,
      thinkingEffort:selection.thinkingEffort,
      loopRun:true,
      prompt:implementationPrompt(task),
      artifactPath:wf.handoffPath,
      dataDir,
      onStatus:m=>{state.chatgpt={state:m,...selection};activity(m);persist()},
      shouldCancel:()=>cancelRequested,
      onAssistantProtocol:executeProtocol
    });
    if(result.state==='login_required'){
      wf.state='waiting-login';state.chatgpt={state:'Sign in required',detail:result.message};
      activity(result.message||'Sign in to ChatGPT, then choose Resume Handoff.','warn');return;
    }
    if(result.state!=='downloaded'||!result.repairPath)throw new Error('ChatGPT did not return an implementation ZIP.');
    wf.pendingRepair={zipPath:result.repairPath,receivedAt:Date.now(),attempt:0};
    wf.state='implementation-downloaded';state.chatgpt={state:'Implementation downloaded'};
    activity('Implementation ZIP downloaded. Applying it locally and starting delta verification.');
    await applyPendingRepair();
  }catch(e){
    if(cancelRequested){wf.state='stopped';state.chatgpt={state:'Stopped'};activity('Implementation handoff stopped by user.','warn')}
    else if(holdChatGPTForAction(e)){}else{wf.state='handoff-error';wf.error=e.message;wf.diagnostic=e.diagnostic||null;state.chatgpt={state:'Error',detail:e.message,diagnostic:e.diagnostic?.name||null};activity('Implementation handoff failed: '+e.message+(e.diagnostic?.name?' Diagnostic: '+e.diagnostic.name:''),'error');notify('Yardmaster implementation failed',e.message);if(config.autoSelfHeal&&!['CHATGPT_COMPOSER_UNAVAILABLE','CHATGPT_DOCK_UNAVAILABLE'].includes(e.code))queueSelfHeal('ChatGPT implementation automation failed: '+e.message,e.diagnostic?.path||null,selfHealCheckpoint())}
  }finally{workflowBusy=false;persist();if(process.env.YARDMASTER_TEST_SELF_HEAL_QUEUE_ONLY!=='1'&&state.selfHeal?.state!=='waiting-action'&&readSelfHealRequest(dataDir))setTimeout(()=>runPendingSelfHeal().catch(error=>{state.selfHeal={...state.selfHeal,state:'failed',error:error.message,detail:'Self-heal stopped safely.'};activity('Self-heal failed: '+error.message,'error');persist()}),250);setTimeout(()=>maybeStartQueuedOperatorUpdate().catch(error=>activity('Queued Yardmaster update failed: '+error.message,'error')),75)}
}
async function resumeImplementationTask(){
  const wf=state.workflow;
  if(!wf?.handsFree||!wf.taskPrompt)throw new Error('No hands-free implementation is waiting to resume.');
  wf.handoffPath=wf.handoffPath&&fs.existsSync(wf.handoffPath)?wf.handoffPath:buildImplementationHandoff(wf.taskPrompt);
  workflowBusy=false;
  await submitImplementationTask(wf.taskPrompt,{pushWhenPassed:!!wf.pushWhenPassed});
}
async function applyPendingRepair(options={}){
  const wf=state.workflow;if(!wf?.pendingRepair?.zipPath)throw new Error('No repaired ZIP is waiting to be applied.');
  ensureCleanBeforeRepair();
  wf.state='applying-repair';wf.approval=null;activity('Saving the pre-repair snapshot and applying the repaired application ZIP.');persist();
  if(process.env.YARDMASTER_TEST_APPLY_REPAIR_STUB!=='1'){try{wf.preRepairSnapshot=await createRepositorySnapshotAsync(dataDir,{repoPath:config.repositoryPath,config,version:packageInfo.version,reason:'before-repair'});state.intelligence.lastSnapshot=wf.preRepairSnapshot;activity('Saved pre-repair snapshot: '+path.basename(wf.preRepairSnapshot)+'.')}catch(error){throw new Error('Could not create the mandatory pre-repair snapshot: '+error.message)}}
  if(cancelRequested||state.workflow!==wf)return;
  wf.state='applying-repair';wf.approval=null;activity('Applying repaired application ZIP to the local repository.');
  if(process.env.YARDMASTER_TEST_APPLY_REPAIR_STUB==='1'){wf.repairApplied=true;wf.lastAppliedRepair=wf.pendingRepair;wf.pendingRepair=null;wf.state='repair-applied';activity('Repair apply completed through the Playwright test stub.');persist();return}
  const script=path.join(__dirname,'scripts','Apply-Repair.ps1');
  if(continuousLoopFixture&&process.platform!=='win32')continuousLoopFixture.applyRepair(wf.pendingRepair.zipPath);
  else await execFileAsync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-RepoPath',config.repositoryPath,'-ZipPath',wf.pendingRepair.zipPath],{cwd:__dirname,encoding:'utf8',windowsHide:true,maxBuffer:20*1024*1024});
  if(cancelRequested||state.workflow!==wf)return;
  wf.repairApplied=true;wf.lastAppliedRepair=wf.pendingRepair;wf.pendingRepair=null;wf.state='repair-applied';activity('Repair applied locally. Starting verification tests.');
  persist();if(!options.skipTest)runTest({retry:true,source:'repair'});
}
function rejectPendingRepair(){
  const wf=state.workflow;if(!wf?.pendingRepair)throw new Error('No repair is waiting for approval.');
  wf.state='repair-rejected';wf.approval=null;activity('Repair was rejected. No local repository files were changed.','warn');persist();
}
async function handleFailedRun(){
  const wf=state.workflow||(state.workflow={state:'idle',repairAttempts:0,pendingRepair:null,repairApplied:false,approval:null});
  if(currentRunOptions.postDeploy){wf.state='post-deploy-failed';activity('Post-deployment tests failed. Preparing another repair cycle.','warn')}
  if(!config.autoHandoff&&!wf.closedLoop){wf.state='failed-manual';activity('Tests failed. Automatic repair is disabled, so Yardmaster is waiting for Resume Handoff.','warn');persist();return}
  const limit=Number(config.maxRepairAttempts);if(!wf.closedLoop&&limit>0&&(wf.repairAttempts||0)>=limit){wf.state='repair-limit';activity('Automatic repair limit reached. Yardmaster stopped.','warn');notify('Yardmaster stopped','The automatic repair-attempt limit was reached.');return}
  wf.handoffPath=null;
  await submitCurrentHandoff();
}
function continueAfterRun(code,options={}){
  const f=state.workflow?.firebase;
  if(f){
    const next=finishFirebasePhase(f,code,readJson(path.join(dataDir,'firebase-phase-telemetry.json'),{}));syncFirebase();
    if(next==='live-next'){activity('Local emulator verification passed. Starting the selected live phase once.');runTest({...options,retry:true,commandOverride:undefined,source:'both-live-phase'});return}
    if(code===0&&['emulator','both'].includes(f.mode)){state.workflow.state='complete';state.workflow.closedLoop=false;state.run.title='Tests Passed';activity(f.mode==='both'?'Emulator tests and the selected live phase completed.':'Emulator workflow completed locally.');void stopFirebaseSession();persist();return}
    if(code!==0&&!state.workflow.closedLoop&&!config.autoHandoff)void stopFirebaseSession();
  }
  if(options.partialResume){
    state.workflow={...(state.workflow||{}),state:code===0?'partial-resume-complete':'partial-resume-failed',closedLoop:false};
    activity(code===0?'Durable Play Store checkpoint resume completed. Prior passed tests were preserved as evidence; this fallback is not a substitute for a fresh final certification.':'Durable Play Store checkpoint resume failed.',code===0?'info':'error');
    notify(code===0?'Yardmaster: checkpoint resume complete':'Yardmaster: checkpoint resume failed',code===0?'The interrupted Play Store run resumed from durable evidence. Run a final full certification when ready.':'Open Yardmaster for the resumed-run failure.');
    persist();return;
  }
  if(state.update?.state==='Queued'){
    const resumeAfterUpdate={kind:'continue-after-run',code:Number(code),options:{...options}};
    state.workflow={...(state.workflow||{}),state:'update-queued',resumeAfterUpdate};state.update={...state.update,resumeAfterUpdate};
    activity('The current test finished. Applying the queued Yardmaster update before continuing the workflow.');
    persist();setTimeout(()=>maybeStartQueuedOperatorUpdate().catch(e=>activity('Queued Yardmaster update failed: '+e.message,'error')),75);return;
  }
  if(code===0){
    state.workflow.state=options.postDeploy?'complete':'tests-passed';
    if(options.postDeploy){state.workflow.closedLoop=false;activity('Closed-loop verification passed on the deployed testing build.');notify('Yardmaster: Release gate passed',config.testType+' • '+config.branch);return}
    if(state.workflow?.closedLoop&&!state.workflow?.repairApplied){
      state.workflow.state='complete';state.workflow.closedLoop=false;activity('Release gate passed. No repair changes need to be pushed.');notify('Yardmaster: Release gate passed',config.testType+' • '+config.branch);return;
    }
    if(state.workflow?.closedLoop||state.workflow?.pushWhenPassed||config.autoPush)gitPush().catch(e=>{state.workflow.state='push-error';activity('Auto-push failed: '+e.message,'error')});
  }else{
    setTimeout(()=>handleFailedRun().catch(e=>activity('Failure handoff error: '+e.message,'error')),200);
  }
}
function terminateProcessTree(pid){
  if(!Number(pid))return;
  try{
    if(process.platform==='win32')spawn('taskkill',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore'}).unref();
    else{try{process.kill(-Number(pid),'SIGTERM')}catch{process.kill(Number(pid),'SIGTERM')}}
  }catch{}
}
function spawnTestProcess(repoPath,cmd,env=process.env){
  if(process.platform==='win32'){
    const args=['-NoProfile','-ExecutionPolicy','Bypass','-Command',`$env:GIT_PAGER='cat';$env:PAGER='cat';Set-Location '${repoPath.replaceAll("'","''")}'; ${cmd}`];
    return spawn('powershell.exe',args,{cwd:repoPath,env,windowsHide:true});
  }
  return spawn('/bin/sh',['-lc',`GIT_PAGER=cat PAGER=cat ${cmd}`],{cwd:repoPath,env,detached:true});
}
function runTest(options={}){
  if(activeProcess||firebaseStarting)throw new Error('A process is already running or Firebase is starting.');
  cancelRequested=false;pauseRequested=false;pausedCompletion=null;
  const repoPath=repositoryPathOrThrow();
  if(!options.retry&&!options.postDeploy)state.workflow={state:'testing',repairAttempts:0,pendingRepair:null,repairApplied:false,approval:null,closedLoop:!!options.closedLoop,testPlan:config.testType,fullFirstComplete:false};
  state.workflow.state='testing';state.workflow.error=null;
  currentRunOptions={...options};
  ensureSelectedBranch();
  const usesFirebase=isFirebaseProject(repoPath);
  if(usesFirebase)state.workflow.firebase=newFirebaseRun(config,(options.retry||options.postDeploy)?state.workflow.firebase:null);
  const phase=usesFirebase?firebasePhase(state.workflow.firebase,plannedTestType(config.testType,state.workflow),options):null;
  const testType=phase?.type||plannedTestType(config.testType,state.workflow);
  let cmd=options.commandOverride||psCommand(testType);
  state.run={state:'running',title:options.title||(testType==='full'?'Full Release Gate':'Local Test Run'),subtitle:`${config.branch} • ${cmd}`,progress:1,counts:{pass:0,fail:0,skip:0,timeout:0},currentTest:'Starting…',elapsedMs:0,log:[],stdout:[],stderr:[],testType,command:cmd,cwd:repoPath,project:readRunProject(repoPath),startedAt:Date.now(),lastSignalAt:Date.now(),hangThresholdMs:Number(config.hangThresholdMs)||180000,finishedAt:null,exitCode:null};
  runStartedAt=Date.now();activity(`Started ${testType} tests on ${config.branch}${options.postDeploy?' after deployment':''}.`);
  firebaseStarting=true;firebaseAbort=new AbortController();
  const launch=async()=>{
    let bridge=usesFirebase?firebaseSession?.bridge||null:null;
    if(usesFirebase&&phase.target==='emulator'){
      bridge=await prepareFirebaseSession(repoPath,state.workflow.firebase,{signal:firebaseAbort.signal});
    }
    while(pauseRequested&&!cancelRequested)await new Promise(r=>setTimeout(r,100));
    if(cancelRequested||firebaseAbort.signal.aborted)return;
    if(usesFirebase){if(options.commandOverride&&phase.type==='verification')throw new Error('Live Verification Only cannot use an arbitrary full-suite command override.');cmd=options.commandOverride||firebaseCommand(repoPath,phase,bridge);state.run.command=cmd;state.run.subtitle=config.branch+' • '+cmd;}
    const environment=usesFirebase?firebaseEnvironment({run:state.workflow.firebase,bridge,telemetryFile:path.join(dataDir,'firebase-phase-telemetry.json'),networkLog:path.join(dataDir,'firebase','firebase-network.jsonl'),liveUrl:config.testingUrl}):{...process.env,YARDMASTER_FIREBASE_MODE:config.firebaseMode};
    try{fs.rmSync(path.join(dataDir,'firebase-phase-telemetry.json'),{force:true})}catch{}
    syncFirebase();
    activeProcess=spawnTestProcess(repoPath,cmd,environment);
    if(usesFirebase&&firebaseSession)firebaseSession.ownTestProcess(activeProcess);
    activeProcess.stdout.on('data',d=>String(d).split(/\r?\n/).forEach(line=>{if(line.trim()){state.run.stdout.push(line);state.run.stdout=state.run.stdout.slice(-2000)}log(line)}));activeProcess.stderr.on('data',d=>String(d).split(/\r?\n/).forEach(line=>{if(line.trim()){state.run.stderr.push(line);state.run.stderr=state.run.stderr.slice(-2000)}log(line)}));
  activeProcess.on('error',error=>{log('Could not start the test process: '+error.message)});
  activeProcess.on('close',code=>{
    activeProcess=null;if(state.workflow.state==='firebase-blocked'){persist();return}
    state.run.elapsedMs=Date.now()-runStartedAt;state.run.finishedAt=Date.now();state.run.exitCode=code;if(cancelRequested){state.run.state='stopped';state.run.title='Stopped';state.run.currentTest='Stopped by user';state.workflow.state='stopped';saveRunRecord(code);persist();return}state.run.progress=100;state.run.state=code===0?'passed':'failed';state.run.title=code===0?'Tests Passed':'Tests Failed';state.run.currentTest=code===0?'Complete':'Test checks failed — preparing the failure report';
    activity(code===0?'Test run passed.':`Test run failed with exit code ${code}.`,code===0?'info':'error');
    notify(code===0?'Yardmaster: Tests passed':'Yardmaster: Tests failed',code===0?`${state.run.counts.pass||0} passed, ${state.run.counts.skip||0} skipped.`:`${state.run.counts.fail||0} failed. Open Yardmaster for details.`);
    saveRunRecord(code);
    if(completeFirstFull(state.workflow,state.run))activity('Initial full Play Store run finished. Subsequent repair and deployment checks use failed/delta tests.');
    if(pauseRequested){
      pausedCompletion={code,options};
      state.workflow.state='paused';
      state.run.state='paused';
      state.run.title=code===0?'Paused after passing command':'Paused after failed command';
      activity('Current command finished while paused. Yardmaster is holding the next workflow step until Resume.','warn');
      persist();return;
    }
    continueAfterRun(code,options);
    persist();
  });
  };
  launch().catch(async error=>{if(!cancelRequested){firebaseBlocked(error);await recoverFirebaseRun()}else await stopFirebaseSession()}).finally(()=>{firebaseStarting=false;persist()});
}
function stopYardmasterChatGPTBrowser(){
  if(process.platform!=='win32')return;
  try{
    const script="$ErrorActionPreference='SilentlyContinue'; Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'msedge.exe' -and $_.CommandLine -like '*Yardmaster\\edge-profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }";
    const p=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command',script],{windowsHide:true,stdio:'ignore',detached:true});p.on('error',()=>{});
    p.unref();
  }catch{}
}
function stopChatGPTAutomation(){
  try{commandBridge?.stop?.()}catch{}
  commandBridge=null;
  stopYardmasterChatGPTBrowser();
}
function stopRun(){cancelRequested=true;void stopFirebaseSession();pauseRequested=false;pausedCompletion=null;const pausedCheckpoint=readPauseCheckpoint(dataDir);if(pausedCheckpoint?.rootPid)terminateProcessTree(pausedCheckpoint.rootPid);clearPauseCheckpoint(dataDir);if(activeProcess){terminateProcessTree(activeProcess.pid);activeProcess=null}if(adoptedRunController){try{adoptedRunController.stop({terminate:true})}catch{}adoptedRunController=null}stopChatGPTAutomation();state.run.state='stopped';state.run.title='Stopped';state.workflow.state='stopped';state.workflow.closedLoop=false;if(state.selfTest?.state==='running')state.selfTest={...state.selfTest,state:'stopped',detail:'Stopped by user.'};state.chatgpt={state:'Stopped'};state.deployment={...state.deployment,state:'Stopped'};activity('Stopped all Yardmaster work. Remote control remains connected.','warn');persist()}
function pauseRun(){
  pauseRequested=true;
  const repoPath=repositoryPathOrThrow();
  let info=null;try{info=discoverAdoptableReleaseGate(repoPath)}catch{}
  const rootPid=Number(activeProcess?.pid||adoptedRunController?.info?.pid||info?.pid||0);
  if(rootPid&&(activeProcess||adoptedRunController||info?.active)){
    const checkpoint=capturePauseCheckpoint({dataDir,appRoot:__dirname,repoPath,runInfo:info?.active?info:null,ownedPid:rootPid,stateRun:state.run,workflow:state.workflow,config});
    if(adoptedRunController){try{adoptedRunController.stop({terminate:false})}catch{}adoptedRunController=null}
    state.run={...state.run,state:'paused',title:'Paused Play Store Test',pauseCheckpoint:checkpoint};
    state.workflow={...(state.workflow||{}),state:'paused'};
    activity('Play Store run '+(checkpoint.runId||'checkpoint')+' is truly paused. Its Windows process tree is suspended and the durable checkpoint was saved.','warn');
    persist();return checkpoint;
  }
  state.run.state='paused';state.run.title='Paused';state.workflow.state='paused';activity('Yardmaster workflow paused. No active Play Store process was available to suspend.','warn');persist();return null;
}
async function resumeRun(){
  pauseRequested=false;
  if(firebaseStarting){state.run.state='running';state.workflow.state='testing';persist();return {resumed:true,strategy:'firebase-startup'}}
  const savedFirebase=readPauseCheckpoint(dataDir)?.workflow?.firebase;if(savedFirebase)state.workflow.firebase=newFirebaseRun(config,savedFirebase);
  if(state.workflow?.firebase?.target==='emulator'&&activeProcess&&firebaseSession?.status!=='running')throw new Error('Cannot resume a suspended emulator test without its verified emulator session. Stop it and resume the saved local test phase.');
  const checkpoint=readPauseCheckpoint(dataDir);
  if(checkpoint){
    if(savedFirebase?.target==='emulator'){try{await prepareFirebaseSession(checkpoint.repoPath||config.repositoryPath,state.workflow.firebase)}catch(error){firebaseBlocked(error);return {resumed:false,strategy:'emulator-blocked',reason:error.message}}}
    const result=resumeSavedProcess({dataDir,appRoot:__dirname});
    if(result.strategy.kind==='same-process'){
      state.run={...state.run,state:'running',title:'Resuming Play Store Test',currentTest:checkpoint.currentTest||state.run.currentTest||'Reattaching…'};
      activity('Resumed suspended Play Store process '+checkpoint.rootPid+'. Reattaching to run '+(checkpoint.runId||'current')+'.');
      if(activeProcess){clearPauseCheckpoint(dataDir);state.run.title=config.testType==='full'?'Full Release Gate':'Local Test Run';persist();return {resumed:true,strategy:'same-process',owned:true}}
      const deadline=Date.now()+20000;let info=null;
      while(Date.now()<deadline){try{info=discoverAdoptableReleaseGate(config.repositoryPath)}catch{}if(info?.active)break;await new Promise(r=>setTimeout(r,300))}
      if(info?.active){clearPauseCheckpoint(dataDir);const adopted=adoptManualPlayStoreRun({resumeCheckpoint:checkpoint});activity('Reattached to the same Play Store run ID '+info.runId+' after resume.');persist();return {resumed:true,strategy:'same-process',adopted}}
      state.run.state='paused';state.run.title='Resume needs attention';activity('The suspended process resumed, but Yardmaster could not rediscover its release-gate state yet. The checkpoint was kept for another Resume attempt.','warn');persist();return {resumed:false,strategy:'same-process-unattached'};
    }
    if(result.strategy.kind==='partial-checkpoint'){
      const cmd=partialResumeCommand(config.repositoryPath);
      clearPauseCheckpoint(dataDir);
      activity('The original Play Store process is gone. Resuming only unfinished/failed tests from the verified 86 Chaos durable checkpoint; this fallback does not silently restart the full gate.','warn');
      runTest({retry:true,source:'durable-partial-resume',commandOverride:cmd,title:'Resumed Play Store Checkpoint',partialResume:true,closedLoop:false});
      return {resumed:true,strategy:'partial-checkpoint'};
    }
    state.run={...state.run,state:'paused',title:'Resume requires full restart',currentTest:result.strategy.reason};
    state.workflow={...(state.workflow||{}),state:'paused-resume-unavailable'};
    activity(result.strategy.reason+' Yardmaster will not silently restart the complete Play Store gate.','error');persist();
    return {resumed:false,strategy:result.strategy.kind,reason:result.strategy.reason};
  }
  if(activeProcess){state.run.state='running';state.run.title=config.testType==='full'?'Full Release Gate':'Local Test Run';activity('Yardmaster workflow resumed.');persist();return {resumed:true,strategy:'workflow'}}
  if(pausedCompletion){
    const pending=pausedCompletion;pausedCompletion=null;
    state.run.state=pending.code===0?'passed':'failed';
    state.run.title=pending.code===0?'Tests Passed':'Tests Failed';
    activity('Yardmaster workflow resumed after the completed command.');
    continueAfterRun(pending.code,pending.options||{});
    persist();return {resumed:true,strategy:'completed-command'};
  }
  runTest({retry:true,source:'resume'});return {resumed:true,strategy:'restart-current-test'};
}
function gitRun(args){return execFileSync('git',args,{cwd:config.repositoryPath,encoding:'utf8',windowsHide:true}).trim()}
function secretPath(name){return /(^|\/)(\.env($|\.)|.*adminsdk.*\.json$|.*service[-_]?account.*\.json$|.*credentials.*\.json$|.*private[-_]?key.*\.json$)/i.test(name.replaceAll('\\','/'))}
function commitYardmasterRepairIfNeeded(){
  const status=gitRun(['status','--porcelain']);if(!status)return null;
  if(!state.workflow?.repairApplied)throw new Error('Working tree is not clean and these changes were not applied by Yardmaster. Refusing to auto-commit.');
  const dirty=status.split(/\r?\n/).map(x=>x.slice(3).trim()).filter(Boolean);
  const blocked=dirty.filter(secretPath);if(blocked.length)throw new Error('Refusing to commit local secret files: '+blocked.join(', '));
  gitRun(['add','-A']);
  const staged=gitRun(['diff','--cached','--name-only']).split(/\r?\n/).filter(Boolean);
  const blockedStaged=staged.filter(secretPath);
  if(blockedStaged.length){try{gitRun(['reset'])}catch{}throw new Error('Refusing to commit staged secret files: '+blockedStaged.join(', '))}
  let version='repair';try{version=JSON.parse(fs.readFileSync(path.join(config.repositoryPath,'package.json'),'utf8')).version||version}catch{}
  gitRun(['commit','-m',`Yardmaster apply repaired build ${version}`]);state.workflow.repairApplied=false;activity(`Committed repaired build ${version}.`);
  return gitRun(['rev-parse','HEAD']);
}
async function gitPush(){
  const repoPath=repositoryPathOrThrow(),branch=config.branch;if(config.dryRunMode){const plan=dryRunPlan('push',{state,config});activity('Dry-run: push was simulated; no Git or deployment action was executed.','warn');audit('dry-run-push',JSON.stringify(plan));return Promise.resolve(plan)}
  if(!/^[A-Za-z0-9._\/-]+$/.test(branch))throw new Error('Invalid branch name.');
  ensureNonProductionBranch(branch,'automatic push');
  activity(`Preparing push to ${branch}.`);
  const current=gitRun(['branch','--show-current']);if(current!==branch){const status=gitRun(['status','--porcelain']);if(status)throw new Error('Working tree must be clean before switching branches.');gitRun(['switch',branch])}
  let commit=commitYardmasterRepairIfNeeded();if(!commit)commit=gitRun(['rev-parse','HEAD']);
  gitRun(['push','origin',branch]);recordCostEvent(dataDir,{kind:'deployment',units:1,detail:'Push '+branch+' '+commit});if(config.waitForDeploy||state.workflow?.closedLoop)recordCostEvent(dataDir,{kind:'vercel-build',units:1,detail:'Expected build for '+branch+' '+commit});activity(`Pushed ${branch} to origin at ${commit.slice(0,12)}.`);audit('git-push',branch+' '+commit);
  if(state.workflow?.closedLoop||config.waitForDeploy){
    const ready=await watchDeployment(commit);
    if(ready&&(state.workflow?.closedLoop||config.runAfterDeploy)&&!activeProcess)runTest({postDeploy:true,source:'deployment'});
    else if(!ready&&state.workflow?.closedLoop){log('ERROR: Exact testing deployment did not become ready for '+commit.slice(0,12)+'.');state.run.state='failed';state.run.title='Deployment Wait Failed';state.run.currentTest='Exact deployment identity';state.run.exitCode=1;state.workflow.state='deployment-timeout';setTimeout(()=>handleFailedRun().catch(e=>activity('Deployment recovery handoff failed: '+e.message,'error')),200)}
  }
  if(state.deployment?.state!=='Timeout')await maybeStartQueuedOperatorUpdate();
}
async function watchDeployment(expectedCommit){
  state.deployment={state:'Waiting',startedAt:Date.now(),expectedCommit};activity(`Waiting for testing deployment of ${expectedCommit.slice(0,12)}.`);
  const base=config.testingUrl.replace(/\/$/,'');const deadline=Date.now()+20*60*1000;
  while(Date.now()<deadline){
    if(cancelRequested){state.deployment={state:'Stopped',url:base,expectedCommit};activity('Deployment wait stopped by user.','warn');persist();return false}
    try{
      const r=await fetch(base+'/api/build-identity?yardmaster='+Date.now(),{headers:{'Cache-Control':'no-cache'}});
      if(r.ok){
        const identity=await r.json();
        state.deployment={state:'Waiting',url:base,expectedCommit,deployedCommit:identity.gitCommit||null,branch:identity.gitBranch||null,checkedAt:Date.now()};
        if(identity.gitCommit===expectedCommit&&identity.gitBranch===config.branch){
          state.deployment={...state.deployment,state:'Ready',identity};activity('Exact Vercel deployment is ready for the pushed commit.');notify('Yardmaster: Deployment ready',`${config.branch} • ${expectedCommit.slice(0,12)}`);persist();return true;
        }
      }
    }catch{}
    persist();await new Promise(r=>setTimeout(r,continuousLoopFixture?100:15000));
  }
  state.deployment={state:'Timeout',url:base,expectedCommit};activity('Exact deployment wait timed out.','warn');notify('Yardmaster: Deployment wait timed out',`${config.branch} • ${expectedCommit.slice(0,12)}`);persist();return false;
}

function parseProtocol(text){
  const lines=String(text).split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const start=lines.findIndex(x=>/^YARDMASTER$/i.test(x));
  const end=lines.findIndex((x,i)=>i>start&&/^END$/i.test(x));
  if(start<0||end<0)return [];
  return lines.slice(start+1,end);
}
async function waitForProcess(){
  while((activeProcess||firebaseStarting)&&!cancelRequested)await new Promise(r=>setTimeout(r,500));
}
function newestRepairZip(){
  const dirs=[path.join(dataDir,'chatgpt-downloads'),path.join(os.homedir(),'Downloads')];
  const files=[];
  for(const dir of dirs){
    try{for(const name of fs.readdirSync(dir)){if(/\.zip$/i.test(name)){const p=path.join(dir,name);files.push({p,mtime:fs.statSync(p).mtimeMs})}}}catch{}
  }
  return files.sort((a,b)=>b.mtime-a.mtime)[0]?.p||null;
}
async function installLatestDownloadedZip(){
  const zip=newestRepairZip();if(!zip)throw new Error('No downloaded repair ZIP was found.');
  state.workflow=state.workflow||{};
  state.workflow.pendingRepair={zipPath:zip,receivedAt:Date.now(),attempt:state.workflow.repairAttempts||0};
  activity('Yardmaster protocol selected latest downloaded ZIP: '+path.basename(zip)+'.');
  if(config.repoUpdateMode==='never'){state.workflow.state='download-only';persist();return}
  if(config.repoUpdateMode==='ask'){state.workflow.approval={type:'repair',message:'Apply the downloaded repair to the local repository?',createdAt:Date.now()};state.workflow.state='waiting-approval';persist();return}
  await applyPendingRepair({skipTest:true});
}
async function executeProtocol(text){
  const reports=[];
  const source=String(text||'');
  const powershellBlocks=[...source.matchAll(/(?:^|\n)POWERSHELL\s*\r?\n([\s\S]*?)\r?\nEND_POWERSHELL(?=\r?\n|$)/gi)].map(m=>m[1]);
  for(const block of powershellBlocks){
    activity('ChatGPT requested a PowerShell command. Validating and running its complete script without interactive input.');
    const repoPath=repositoryPathOrThrow(),beforeStatus=gitRun(['status','--porcelain']);
    const output=[];const result=await runPowerShellClipboardCommand({dataDir,cwd:repoPath,script:block,shouldCancel:()=>cancelRequested,onEvent:event=>{if(event.stage==='command-started'){state.chatgpt={...state.chatgpt,state:'Running a PowerShell command from ChatGPT. Output will be sent back automatically.'};persist()}},env:firebaseEnvironment({run:state.workflow?.firebase||newFirebaseRun(config),bridge:isFirebaseProject(repoPath)?firebaseSession?.bridge:null,liveUrl:config.testingUrl}),onOutput:(line,stream)=>{const clean=redactConsoleLine(line);if(clean.trim()){output.push(clean);output.splice(0,Math.max(0,output.length-120));activity('PowerShell: '+clean)}}});
    const afterStatus=gitRun(['status','--porcelain']);if(afterStatus!==beforeStatus&&afterStatus){state.workflow=state.workflow||{};state.workflow.repairApplied=true;activity('The pasted PowerShell command changed the local repository. Yardmaster marked those changes as part of the repair cycle.');}
    const tail=output.slice(-40).join('\n').slice(-3500);reports.push('POWERSHELL exit='+result.code+' clipboardVerified='+result.clipboardVerified+' pastedWithCtrlV='+result.pastedWithCtrlV+(tail?'\n'+tail:''));
    if(result.code!==0)throw Object.assign(new Error('ChatGPT PowerShell command failed with exit code '+result.code+'.'+(tail?'\n'+tail:'')),{code:'POWERSHELL_COMMAND_FAILED'});
  }
  const stripped=source.replace(/(?:^|\n)POWERSHELL\s*\r?\n[\s\S]*?\r?\nEND_POWERSHELL(?=\r?\n|$)/gi,'\n');
  const commands=parseProtocol(stripped);if(!commands.length){if(reports.length){persist();return reports.join('\n\n')}return ''}
  activity('Received fixed Yardmaster command block from ChatGPT.');
  let condition='always',pushOnPass=false;
  for(let i=0;i<commands.length;i++){
    const raw=commands[i],line=raw.trim();if(!line)continue;
    if((/^PUSH_ON_PASS(?:\s+(.+))?$/i).test(line)){
      const m=line.match(/^PUSH_ON_PASS(?:\s+(.+))?$/i),branch=(m?.[1]||config.branch).trim();
      if(branch==='main'||branch==='production')throw new Error('Hands-free implementation cannot push production/main.');
      if(branch!==config.branch)throw new Error('PUSH_ON_PASS must match the selected branch.');
      pushOnPass=true;continue;
    }
    if(/^IMPLEMENT$/i.test(line)){
      const task=[];let foundEnd=false;
      for(i=i+1;i<commands.length;i++){
        const part=commands[i];
        if(/^END_IMPLEMENT$/i.test(part.trim())){foundEnd=true;break}
        task.push(part);
      }
      if(!foundEnd)throw new Error('IMPLEMENT block is missing END_IMPLEMENT.');
      await submitImplementationTask(task.join('\n'),{pushWhenPassed:pushOnPass});
      break;
    }
    let cfgMatch;
    if((cfgMatch=line.match(/^CHAT_MODE\s+(Work|Chat)$/i))){config.chatMode=cfgMatch[1][0].toUpperCase()+cfgMatch[1].slice(1).toLowerCase();writeJson(cfgPath,config);activity('Protocol selected ChatGPT mode '+config.chatMode+'.');continue}
    if((cfgMatch=line.match(/^MODEL\s+(.+)$/i))){config.model=cfgMatch[1].trim();writeJson(cfgPath,config);activity('Protocol selected ChatGPT model '+config.model+'.');continue}
    if((cfgMatch=line.match(/^EFFORT\s+(Instant|Medium|High)$/i))){config.thinkingEffort=cfgMatch[1][0].toUpperCase()+cfgMatch[1].slice(1).toLowerCase();writeJson(cfgPath,config);activity('Protocol selected ChatGPT thinking effort '+config.thinkingEffort+'.');continue}
    let repoMatch=line.match(/^REPO\s+(.+)$/i);
    if(repoMatch){
      const name=repoMatch[1].trim();
      if(/^86chaos$/i.test(name))config.repositoryPath=defaults.repositoryPath;
      else if(/^current$/i.test(name)){}
      else throw new Error('Yardmaster protocol only allows configured repository aliases.');
      writeJson(cfgPath,config);activity('Protocol selected repository '+name+'.');continue;
    }
    let preserveMatch=line.match(/^PRESERVE\s+(.+)$/i);
    if(preserveMatch){
      const target=preserveMatch[1].trim();
      if(!/^\.git$|^\.env\.test\.local$|^credentials$/i.test(target))throw new Error('Unsupported protected path: '+target);
      activity('Protocol confirmed protected local path: '+target+'.');continue;
    }
    if(/^IF_PASS$/i.test(line)){condition=state.run.state==='passed'?'always':'skip';continue}
    if(/^IF_FAIL$/i.test(line)){condition=state.run.state==='failed'?'always':'skip';continue}
    if(condition==='skip'){
      if(/^IF_(PASS|FAIL)$/i.test(line))condition='always';
      continue;
    }
    let m;
    if((m=line.match(/^BRANCH\s+(.+)$/i))){const branch=m[1].trim();if(!/^[A-Za-z0-9._\/-]+$/.test(branch))throw new Error('Invalid branch in Yardmaster protocol.');ensureNonProductionBranch(branch,'automatic protocol work');config.branch=branch;writeJson(cfgPath,config);activity('Protocol selected branch '+branch+'.');continue}
    if((m=line.match(/^RUN\s+(delta|full|targeted|playwright)$/i))){config.testType=m[1].toLowerCase();writeJson(cfgPath,config);runTest({retry:true,source:'chatgpt-protocol'});await waitForProcess();reports.push('RUN '+config.testType+' state='+state.run.state+' exit='+String(state.run.exitCode)+' current='+String(state.run.currentTest||'')+'\n'+(state.run.log||[]).slice(-30).join('\n').slice(-3500));continue}
    if(/^INSTALL\s+latest_downloaded_zip$/i.test(line)){await installLatestDownloadedZip();continue}
    if((m=line.match(/^PUSH\s+(.+)$/i))){const branch=m[1].trim();if(branch!==config.branch)config.branch=branch;await gitPush();if(activeProcess)await waitForProcess();continue}
    if(/^ACTION\s+PUSH$/i.test(line)){await gitPush();if(activeProcess)await waitForProcess();continue}
    if(/^WAIT[_ ]VERCEL$/i.test(line)){if(state.deployment?.state!=='Ready'&&state.deployment?.expectedCommit)await watchDeployment(state.deployment.expectedCommit);continue}
    if(/^VERIFY\s+exact_commit$/i.test(line)){if(state.deployment?.state!=='Ready')throw new Error('Exact deployment commit is not verified.');continue}
    if(/^SEND_(FAILURE|RESULTS)$/i.test(line)||/^ON_FAIL\s+SEND_RESULTS$/i.test(line)){if(state.run.state==='failed')await submitCurrentHandoff();continue}
    if(/^PAUSE$/i.test(line)){pauseRun();continue}
    if(/^RESUME$/i.test(line)){resumeRun();continue}
    if(/^STOP$/i.test(line)){stopRun();break}
  }
  activity('Finished Yardmaster command block.');persist();return reports.length?reports.join('\n\n'):'Yardmaster instructions completed successfully.';
}
function startProtocolBridge(){
  if(commandBridge)return;
  commandBridge=startCommandBridge({
    dataDir,
    onProtocol:executeProtocol,
    onStatus:m=>{state.chatgpt={state:m};activity(m);persist()}
  });
}
async function adoptManualPlayStoreRun({resumeCheckpoint=null}={}){
  if(isFirebaseProject(repositoryPathOrThrow())&&(state.workflow?.firebase?.mode||config.firebaseMode)!=='live')throw new Error('Start Emulator/Both tests through Yardmaster so it can verify and own the Firebase target. An external run with an unknown target cannot be adopted.');
  if(process.platform!=='win32')throw new Error('Adopting a running Play Store test requires Windows.');
  if(activeProcess||adoptedRunController)throw new Error('Yardmaster is already monitoring a test process.');
  if(workflowBusy)throw new Error('Yardmaster is already handling another ChatGPT job.');
  const repoPath=repositoryPathOrThrow(),current=gitRun(['branch','--show-current']);ensureNonProductionBranch(current,'manual Play Store adoption');
  const info=discoverAdoptableReleaseGate(repoPath);if(!info?.active||String(info.runnerState?.status||'running')!=='running')throw new Error('No active manually started Play Store release gate was found.');
  config.branch=current;config.testType=/^full$/i.test(info.mode)?'full':'delta';writeJson(cfgPath,config);
  cancelRequested=false;pauseRequested=false;pausedCompletion=null;const resumed=!!resumeCheckpoint,closedLoop=resumeCheckpoint?.workflow?.closedLoop!==undefined?!!resumeCheckpoint.workflow.closedLoop:true;currentRunOptions={source:resumed?'paused-update-resume':'adopted-manual',adopted:true,closedLoop,resumed};runStartedAt=Number(resumeCheckpoint?.startedAt)||Date.now();
  state.workflow={firebase:resumeCheckpoint?.workflow?.firebase|| (isFirebaseProject(repoPath)?newFirebaseRun({firebaseMode:'live',firebaseLivePhase:config.firebaseLivePhase}):undefined),state:'adopted-testing',repairAttempts:Number(resumeCheckpoint?.workflow?.repairAttempts||0),pendingRepair:null,repairApplied:false,approval:null,closedLoop,adoptedRunId:info.runId,resumedFromPause:resumed};
  state.run={state:'running',title:resumed?'Resumed Play Store Test':'Adopted Play Store Test',subtitle:config.branch+' • '+info.mode+' • run '+info.runId,progress:Math.max(1,Number(resumeCheckpoint?.progress)||1),counts:{pass:0,fail:0,skip:0,timeout:0},currentTest:resumeCheckpoint?.currentTest||(resumed?'Reattaching to saved checkpoint…':'Adopting existing test…'),elapsedMs:Math.max(0,Date.now()-runStartedAt),log:[],stdout:[],stderr:[],command:'adopt '+info.mode,cwd:repoPath,project:resumed?(resumeCheckpoint?.project||state.run?.project||readRunProject(repoPath)):readRunProject(repoPath),startedAt:runStartedAt,finishedAt:null,exitCode:null,adopted:true,runId:info.runId};
  activity((resumed?'Reattaching to suspended ':'Adopting manually started ')+info.mode+' Play Store gate '+info.runId+'. Closed-loop state is '+(closedLoop?'enabled':'disabled')+'.');
  adoptedRunController=adoptRunningReleaseGate({
    repoPath,
    onLine:line=>{state.run.stdout.push(line);state.run.stdout=state.run.stdout.slice(-2000);log(line)},
    onState:snapshot=>{state.run.progress=snapshot.progress;state.run.currentTest=snapshot.currentPhase||state.run.currentTest;state.run.adoptedState=snapshot;state.run.elapsedMs=Date.now()-runStartedAt;persist()},
    onFinish:(code,snapshot)=>{
      adoptedRunController=null;state.run.elapsedMs=Date.now()-runStartedAt;state.run.finishedAt=Date.now();state.run.exitCode=code;state.run.progress=100;state.run.state=code===0?'passed':'failed';state.run.title=code===0?'Tests Passed':'Tests Failed';state.run.currentTest=code===0?'Complete':(snapshot.blockingReason||snapshot.currentPhase||'Stopped on failure');state.run.adoptedState=snapshot;
      activity(code===0?'Adopted test run passed.':'Adopted test run failed with exit code '+code+'.',code===0?'info':'error');saveRunRecord(code);
      continueAfterRun(code,currentRunOptions);persist();
    }
  });
  persist();return {adopted:true,runId:info.runId,mode:info.mode,testType:config.testType,closedLoop:true};
}
async function runIsolatedFullSelfTest(){
  if(workflowBusy)throw new Error('Yardmaster is already handling another ChatGPT job.');
  workflowBusy=true;cancelRequested=false;
  state.selfTest={state:'running',stage:'starting',detail:'Preparing isolated sandbox.',steps:{},startedAt:Date.now(),diagnostic:null};
  if(process.env.YARDMASTER_TEST_FULL_SELF_TEST_STUB==='1'){
    let fixtureDiagnostic=null;
    if(process.env.YARDMASTER_TEST_SELF_TEST_DIAGNOSTIC==='1'){const dir=path.join(dataDir,'self-test-diagnostics');fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'Yardmaster-Self-Test-Diagnostic-Fixture.zip');fs.writeFileSync(file,'yardmaster self-test diagnostic fixture','utf8');fixtureDiagnostic={name:path.basename(file),path:file,stage:'fixture'};}
    state.selfTest={state:'passed',stage:'complete',detail:'Full isolated Yardmaster process passed.',steps:{sandbox:'pass',manualGateAdoption:'pass',handoff:'pass',chatgpt:'pass',chatgptPowerShellRoundTrip:'pass',download:'pass',apply:'pass',retest:'pass',gitPush:'pass',deployment:'pass',postDeployAdoption:'pass'},startedAt:Date.now(),finishedAt:Date.now(),elapsedMs:1,workspaceId:'fixture-stub',diagnostic:fixtureDiagnostic};
    state.chatgpt={state:'Self-test passed',detail:'Full isolated process completed without touching 86 Chaos.'};
    activity('Full isolated Yardmaster process test passed in fixture mode.');workflowBusy=false;persist();return state.selfTest;
  }
  if(process.platform!=='win32'){workflowBusy=false;throw new Error('The full Yardmaster sandbox process test currently requires Windows.');}
  state.chatgpt={state:'Self-test starting',mode:config.chatMode,model:config.model,thinkingEffort:config.thinkingEffort};
  activity('Starting full isolated Yardmaster process test. 86 Chaos will not be accessed.');
  persist();
  try{
    const result=await runFullSandboxSelfTest({
      dataDir,
      appRoot:__dirname,
      chatSettings:{mode:config.chatMode,model:config.model,thinkingEffort:config.thinkingEffort},
      submitRepair:submitRepairToChatGPT,
      shouldCancel:()=>cancelRequested,
      onStatus:m=>{state.chatgpt={state:m,mode:config.chatMode,model:config.model,thinkingEffort:config.thinkingEffort};activity(m);persist()},
      onState:snapshot=>{state.selfTest={...snapshot,diagnostic:state.selfTest?.diagnostic||null};persist()}
    });
    if(result.state==='login_required'){
      state.selfTest={...state.selfTest,state:'waiting-login',stage:'chatgpt',detail:'Sign in to ChatGPT, then run the full sandbox test again.'};
      state.chatgpt={state:'Sign in required',detail:result.message};
      activity('Full sandbox test paused because ChatGPT sign-in is required.','warn');
      return result;
    }
    const {workspace:ignoredWorkspace,...publicResult}=result;state.selfTest={...state.selfTest,...publicResult,state:'passed',detail:'Full isolated Yardmaster process passed.'};
    state.chatgpt={state:'Self-test passed',detail:'Full isolated process completed without touching 86 Chaos.'};
    activity('Full isolated Yardmaster process test passed.');
    return result;
  }catch(error){
    state.selfTest={...(error.selfTest||state.selfTest),state:'failed',detail:error.message,diagnostic:error.selfTest?.diagnostic||error.diagnostic||state.selfTest?.diagnostic||null};
    if(state.selfTest.diagnostic?.path){
      try{
        const savedPath=saveSelfTestDiagnosticToDownloads(state.selfTest.diagnostic);
        state.selfTest.savedPath=savedPath;
        state.selfTest.detail=error.message+' Diagnostics were automatically saved to '+savedPath;
      }catch(saveError){
        state.selfTest.diagnosticSaveError=(saveError.message||String(saveError))+' Source: '+String(state.selfTest.diagnostic?.path||state.selfTest.diagnostic?.jsonPath||'none');
      }
    }
    state.chatgpt={state:'Self-test failed',detail:state.selfTest.detail,diagnostic:state.selfTest.diagnostic?.name||null};
    activity('Full sandbox self-test failed: '+error.message+(state.selfTest.savedPath?' Diagnostics saved: '+state.selfTest.savedPath:(state.selfTest.diagnostic?.name?' Diagnostic: '+state.selfTest.diagnostic.name:'')),'error');
    throw error;
  }finally{workflowBusy=false;persist();setTimeout(()=>maybeStartQueuedOperatorUpdate().catch(error=>activity('Queued Yardmaster update failed: '+error.message,'error')),75)}
}
function randCode(){return String(crypto.randomInt(0,1000000)).padStart(6,'0')}
function startPairing(){pairCode=randCode();pairExpiresAt=Date.now()+5*60*1000;state.remote.pairCode=pairCode;state.remote.pairExpiresAt=pairExpiresAt}
function cloudflaredSpec(){return {file:process.env.YARDMASTER_CLOUDFLARED_PATH||path.join(__dirname,'bin','cloudflared.exe'),prefix:process.env.YARDMASTER_CLOUDFLARED_SCRIPT?[process.env.YARDMASTER_CLOUDFLARED_SCRIPT]:[]}}
function remoteLogPath(){return path.join(dataDir,'cloudflared.log')}
async function setRemoteUrl(url){
  if(!url)return;
  state.remote.active=true;state.remote.status=remotePhoneConnected()?'connected':'tunnel-ready';state.remote.url=url;state.remote.error=null;
  const code=String(pairCode||state.remote.pairCode||'').trim();
  // Restore the first-version direct mobile link. The QR itself carries the exact
  // tunnel URL and pairing code, so Android never has to survive a redirect hop.
  const pairingUrl=code?'https://www.86chaos.com/yardmaster?remote='+encodeURIComponent(url)+'&code='+encodeURIComponent(code):null;
  state.remote.pairingUrl=pairingUrl;
  try{state.remote.qrDataUrl=pairingUrl?await QRCode.toDataURL(pairingUrl,{margin:1,width:240,color:{dark:'#f1a673',light:'#071525'}}):null}catch{state.remote.qrDataUrl=null}
  saveRemoteState();persist();publishRemoteConnection();
}
function refreshRemoteHealth(retry=true){
  if(!state.remote?.active){if(retry&&remoteWanted&&!remoteStartPromise&&Date.now()>=remoteRetryAt)beginRemoteStart();return;}
  const pid=Number(state.remote.pid||remoteProcess?.pid);
  const registrationLost=pid&&readTunnelRegistrationLost(remoteLogPath());
  if(pid&&pidAlive(pid)&&!registrationLost)return;
  if(registrationLost){terminateProcessTree(pid);remoteProcess=null;activity('Remote tunnel registration expired. Replacing the endpoint automatically; trusted phones remain paired.','warn')}
  state.remote={active:false,status:'error',url:null,pid:null,pairCode:null,pairExpiresAt:null,error:'Remote tunnel stopped. Retrying automatically; trusted phones remain paired.'};
  saveRemoteState();publishRemoteConnection('tunnel-unavailable');
  if(retry&&remoteWanted&&!remoteStartPromise&&Date.now()>=remoteRetryAt)beginRemoteStart();
}
async function startRemote(nonce=remoteStartNonce){
  refreshRemoteHealth(false);
  if(state.remote?.active&&state.remote?.url&&pidAlive(state.remote.pid)){
    startPairing();
    await setRemoteUrl(state.remote.url);
    activity('Remote Access is already running. Refreshed the phone pairing code.');
    return;
  }
  const {file:exe,prefix}=cloudflaredSpec();
  if(!fs.existsSync(exe))throw new Error('Cloudflare tunnel client is missing. Run the Yardmaster installer again.');
  try{execFileSync(exe,[...prefix,'--version'],{windowsHide:true,stdio:'ignore',timeout:10000})}catch{throw new Error('Cloudflare tunnel client could not run. Run the Yardmaster installer again so it can repair Remote Access.')}

  startPairing();
  state.remote={active:true,status:'connecting',url:null,pid:null,pairCode,pairExpiresAt,error:null};
  activity('Starting persistent secure Cloudflare Quick Tunnel.');
  const logFile=remoteLogPath();
  try{fs.writeFileSync(logFile,'','utf8')}catch{}
  const fd=fs.openSync(logFile,'a');
  let child;
  try{
    child=spawn(exe,[...prefix,'tunnel','--no-autoupdate','--url','http://127.0.0.1:'+operatorPort],{windowsHide:true,detached:true,stdio:['ignore',fd,fd]});
  }finally{try{fs.closeSync(fd)}catch{}}
  remoteProcess=child;child.unref();
  state.remote.pid=child.pid;saveRemoteState();persist();

  const deadline=Date.now()+30000;
  let url=null,last='';
  while(Date.now()<deadline){
    if(nonce!==remoteStartNonce){terminateProcessTree(child.pid);return}
    if(!pidAlive(child.pid))break;
    try{
      const text=fs.readFileSync(logFile,'utf8').slice(-12000);last=text;
      const matches=text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/ig);
      if(matches?.length){url=matches[matches.length-1];break}
    }catch{}
    await new Promise(r=>setTimeout(r,400));
  }
  if(nonce!==remoteStartNonce){terminateProcessTree(child.pid);return}
  if(!url){
    const lastLine=last.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).slice(-1)[0]||'';
    terminateProcessTree(child.pid);
    remoteProcess=null;pairCode=null;pairExpiresAt=0;
    state.remote={active:false,status:'error',url:null,pid:null,pairCode:null,pairExpiresAt:null,error:'Remote tunnel stopped before becoming ready'+(lastLine?': '+lastLine:''),lastClientAt:null};
    saveRemoteState();
    persist();
    throw new Error(state.remote.error);
  }
  await setRemoteUrl(url);
  activity('Remote tunnel ready and will survive Yardmaster restarts. Scan the QR code with your phone.');
}
function beginRemoteStart(){
  remoteWanted=true;remoteRetryAt=Date.now()+30000;saveRemoteState();
  if(remoteStartPromise)return remoteStartPromise;
  const nonce=++remoteStartNonce;
  state.remote={...state.remote,active:true,status:'connecting',error:null};persist();
  remoteStartPromise=startRemote(nonce).catch(error=>{
    if(nonce!==remoteStartNonce)return;
    pairCode=null;pairExpiresAt=0;
    state.remote={active:false,status:'error',url:null,pid:null,pairCode:null,pairExpiresAt:null,error:error.message||String(error)};
    activity('Remote Access failed: '+state.remote.error,'error');persist();
  }).finally(()=>{remoteStartPromise=null});
  return remoteStartPromise;
}
function stopRemote(){
  remoteWanted=false;
  remoteStartNonce++;
  const pid=Number(remoteProcess?.pid||state.remote?.pid);
  if(pid)terminateProcessTree(pid);
  remoteProcess=null;pairCode=null;pairExpiresAt=0;
  state.remote={active:false,status:'local',url:null,pid:null,pairCode:null,pairExpiresAt:null,error:null,lastClientAt:null};
  saveRemoteState();publishRemoteConnection('tunnel-unavailable');
  activity('Remote access stopped.','warn');persist()
}
async function shutdownOperator(){
  publishRemoteConnection('offline');
  cancelRequested=true;
  const pausedCheckpoint=readPauseCheckpoint(dataDir);
  if(activeProcess&&!pausedCheckpoint)terminateProcessTree(activeProcess.pid);
  if(adoptedRunController&&!pausedCheckpoint){try{adoptedRunController.stop({terminate:true})}catch{}}
  activeProcess=null;adoptedRunController=null;
  stopChatGPTAutomation();
  await stopFirebaseSession();
  // Keep the detached Remote Access tunnel alive so updates/restarts preserve the same phone URL.
  persist();
  setTimeout(()=>server.close(()=>process.exit(0)),50);
  setTimeout(()=>process.exit(0),1500).unref();
}
function resolvedDownloadsDir(){
  if(process.env.YARDMASTER_TEST_DOWNLOADS_DIR)return process.env.YARDMASTER_TEST_DOWNLOADS_DIR;
  if(process.platform==='win32'){
    try{
      const found=execFileSync('powershell.exe',['-NoProfile','-Sta','-Command',"$p=(New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path;if($p){[Console]::Out.Write($p)}"],{encoding:'utf8',windowsHide:true,timeout:10000}).trim();
      if(found)return found;
    }catch{}
  }
  const candidates=[process.env.USERPROFILE&&path.join(process.env.USERPROFILE,'Downloads'),process.env.OneDrive&&path.join(process.env.OneDrive,'Downloads'),path.join(os.homedir(),'Downloads')].filter(Boolean);
  return candidates.find(p=>{try{return fs.existsSync(p)&&fs.statSync(p).isDirectory()}catch{return false}})||candidates[0]||path.join(os.homedir(),'Downloads');
}
function diagnosticPathInsideRoot(file,root){
  const rel=path.relative(root,file);return rel===''||(!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel));
}
function diagnosticPathAllowed(file){
  return [path.join(dataDir,'self-test-diagnostics'),path.join(dataDir,'handoff-diagnostics')].some(root=>diagnosticPathInsideRoot(file,path.resolve(root)));
}
function saveSelfTestDiagnosticToDownloads(diagnostic){
  if(!diagnostic?.path&&!diagnostic?.jsonPath)throw new Error('No self-test diagnostic is available.');
  const requested=diagnostic?.path?path.resolve(String(diagnostic.path)):null;
  const trace=path.resolve(String(diagnostic?.jsonPath||(requested?requested.replace(/\.zip$/i,'.json'):'')));
  let source=requested;
  if(source&&!diagnosticPathAllowed(source))throw new Error('Diagnostic path is outside Yardmaster diagnostic folders.');
  if(trace&&!diagnosticPathAllowed(trace))throw new Error('Diagnostic trace path is outside Yardmaster diagnostic folders.');
  if(!source||!fs.existsSync(source)||!fs.statSync(source).isFile()){
    if(trace&&fs.existsSync(trace)&&fs.statSync(trace).isFile())source=trace;
    else throw new Error('Self-test diagnostic ZIP and trace are unavailable.');
  }
  const downloads=resolvedDownloadsDir();fs.mkdirSync(downloads,{recursive:true});
  const baseName=path.basename(source).replace(/[^A-Za-z0-9._-]/g,'_')||'Yardmaster-Self-Test-Diagnostic.json';
  const parsed=path.parse(baseName);let destination=path.join(downloads,baseName),n=2;
  while(fs.existsSync(destination)){destination=path.join(downloads,parsed.name+' ('+n+++')'+parsed.ext)}
  fs.copyFileSync(source,destination);
  return destination;
}
function clientIp(req){const cf=String(req.headers['cf-connecting-ip']||'').trim();if(cf)return cf;const xff=String(req.headers['x-forwarded-for']||'').split(',')[0].trim();return xff||req.socket.remoteAddress||'unknown'}
function isLocal(req){const forwarded=!!(req.headers['cf-connecting-ip']||req.headers['x-forwarded-for']);if(forwarded)return false;const a=req.socket.remoteAddress||'',host=String(req.headers.host||'').toLowerCase().split(':')[0];const loopback=a==='127.0.0.1'||a==='::1'||a.endsWith('127.0.0.1');return loopback&&(host==='127.0.0.1'||host==='localhost'||host==='[::1]')}
function requestToken(req){return (req.headers.authorization||'').replace(/^Bearer\s+/i,'')}
function sessionFor(req){const t=requestToken(req),key=tokenHash(t),s=sessions.get(key);if(!s)return null;if(!trustedOwnerSession(s,devices)){sessions.delete(key);persistSessions();return null}markRemoteClient(s);return s}
function tokenOk(req){return isLocal(req)||!!sessionFor(req)}
function passkeyCredential(device){if(!device?.credential)return null;return {id:device.credential.id,publicKey:Buffer.from(device.credential.publicKey,'base64'),counter:Number(device.credential.counter||0),transports:device.credential.transports||[]}}
function pairAllowed(req,code){
  const key=clientIp(req),now=Date.now();let rec=pairFailures.get(key)||{count:0,blockedUntil:0,windowStart:now};
  if(rec.blockedUntil>now)return {ok:false,error:'Too many pairing attempts. Try again later.'};
  if(now-rec.windowStart>5*60*1000)rec={count:0,blockedUntil:0,windowStart:now};
  if(!pairCode||now>pairExpiresAt||String(code)!==pairCode){rec.count++;if(rec.count>=6)rec.blockedUntil=now+10*60*1000;pairFailures.set(key,rec);return {ok:false,error:'Invalid or expired pairing code.'}}
  pairFailures.delete(key);return {ok:true}
}
function newSession(deviceId){const token=crypto.randomBytes(32).toString('hex');sessions.set(tokenHash(token),{deviceId,persistent:true,createdAt:Date.now(),expiresAt:null});persistSessions();return token}
function cors(req,res){const o=String(req.headers.origin||'');if(EXPECTED_ORIGINS.includes(o))res.setHeader('Access-Control-Allow-Origin',o);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Max-Age','600');if(String(req.headers['access-control-request-private-network']||'').toLowerCase()==='true')res.setHeader('Access-Control-Allow-Private-Network','true')}
function body(req){return new Promise((resolve,reject)=>{let d='';req.on('data',c=>{d+=c;if(d.length>1e6)req.destroy()});req.on('end',()=>{try{resolve(d?JSON.parse(d):{})}catch(e){reject(e)}})})}function json(res,obj,code=200){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj))}function text(res,t,code=200){res.writeHead(code,{'Content-Type':'text/plain; charset=utf-8'});res.end(t)}
function staticFile(req,res){let u=new URL(req.url,'http://x').pathname;if(u==='/')u='/index.html';const p=path.normalize(path.join(publicDir,u));if(!(p===publicDir||p.startsWith(publicDir+path.sep))||!fs.existsSync(p)||fs.statSync(p).isDirectory())return false;const ext=path.extname(p);const ct={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.ico':'image/x-icon','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json'}[ext]||'application/octet-stream';res.writeHead(200,{'Content-Type':ct,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});fs.createReadStream(p).pipe(res);return true}
const server=http.createServer(async(req,res)=>{
  cors(req,res);if(req.method==='OPTIONS'){res.writeHead(204);return res.end()}
  const url=new URL(req.url,'http://x');
  try{
    if(url.pathname==='/api/passkey/register/options'&&req.method==='POST'){
      const b=await body(req),gate=pairAllowed(req,b.code);if(!gate.ok)return text(res,gate.error,401);
      const deviceName=String(b.deviceName||'Phone').slice(0,80),registrationId=crypto.randomUUID(),userID=crypto.randomBytes(32);
      const excludeCredentials=Object.values(devices).filter(d=>d.credential?.id).map(d=>({id:d.credential.id,transports:d.credential.transports||[]}));
      const options=await generateRegistrationOptions({rpName:RP_NAME,rpID:RP_ID,userName:deviceName,userDisplayName:deviceName,userID,attestationType:'none',excludeCredentials,authenticatorSelection:{residentKey:'preferred',userVerification:'required'}});
      pendingRegistrations.set(registrationId,{challenge:options.challenge,deviceName,expiresAt:Date.now()+5*60*1000});
      return json(res,{registrationId,options});
    }
    if(url.pathname==='/api/passkey/register/verify'&&req.method==='POST'){
      const b=await body(req),pending=pendingRegistrations.get(b.registrationId);
      if(!pending||Date.now()>pending.expiresAt)return text(res,'Passkey registration expired. Start pairing again.',401);
      const verification=await verifyRegistrationResponse({response:b.credential,expectedChallenge:pending.challenge,expectedOrigin:EXPECTED_ORIGINS,expectedRPID:RP_ID,requireUserVerification:true});
      if(!verification.verified||!verification.registrationInfo?.credential)return text(res,'Passkey verification failed.',401);
      const cred=verification.registrationInfo.credential,id=crypto.randomUUID();
      devices[id]={id,name:pending.deviceName,credential:{id:cred.id,publicKey:Buffer.from(cred.publicKey).toString('base64'),counter:Number(cred.counter||0),transports:cred.transports||[]},createdAt:Date.now(),lastSeenAt:Date.now()};
      writeJson(devicesPath,devices);pendingRegistrations.delete(b.registrationId);pairCode=null;pairExpiresAt=0;state.remote.pairCode='PAIRED';const sessionToken=newSession(id);activity(`Paired passkey device: ${devices[id].name}.`);return json(res,{sessionToken,deviceId:id,expiresIn:null,persistent:true,connection:connectionDescriptor});
    }
    if(url.pathname==='/api/passkey/auth/options'&&req.method==='POST'){
      const b=await body(req),d=devices[b.deviceId];if(!d?.credential)return text(res,'Unknown paired device.',404);
      const authId=crypto.randomUUID(),options=await generateAuthenticationOptions({rpID:RP_ID,allowCredentials:[{id:d.credential.id,transports:d.credential.transports||[]}],userVerification:'required'});
      pendingAuthentications.set(authId,{challenge:options.challenge,deviceId:d.id,expiresAt:Date.now()+5*60*1000});return json(res,{authId,options});
    }
    if(url.pathname==='/api/passkey/auth/verify'&&req.method==='POST'){
      const b=await body(req),pending=pendingAuthentications.get(b.authId);if(!pending||Date.now()>pending.expiresAt)return text(res,'Passkey sign-in expired.',401);
      const d=devices[pending.deviceId],credential=passkeyCredential(d);if(!credential)return text(res,'Paired passkey is unavailable.',401);
      const verification=await verifyAuthenticationResponse({response:b.credential,expectedChallenge:pending.challenge,expectedOrigin:EXPECTED_ORIGINS,expectedRPID:RP_ID,credential,requireUserVerification:true});
      if(!verification.verified)return text(res,'Passkey sign-in failed.',401);
      d.credential.counter=Number(verification.authenticationInfo?.newCounter??d.credential.counter??0);d.lastSeenAt=Date.now();writeJson(devicesPath,devices);pendingAuthentications.delete(b.authId);const sessionToken=newSession(d.id);activity(`Passkey sign-in: ${d.name}.`);return json(res,{sessionToken,deviceId:d.id,expiresIn:null,persistent:true,connection:connectionDescriptor});
    }
    if(req.method==='GET'&&url.pathname.startsWith('/pair/')){
      const supplied=decodeURIComponent(url.pathname.slice('/pair/'.length));
      const activeCode=String(pairCode||state.remote?.pairCode||'');
      if(!state.remote?.active||!state.remote?.url||!activeCode||Date.now()>pairExpiresAt||supplied!==activeCode)return text(res,'This Yardmaster pairing link is invalid or expired. Start Remote Access again on the PC and rescan the QR code.',410);
      let remoteHost='';
      try{remoteHost=new URL(state.remote.url).host}catch{}
      if(!/^[a-z0-9-]+\.trycloudflare\.com$/i.test(remoteHost))return text(res,'Yardmaster remote URL is invalid. Restart Remote Access and rescan the QR code.',500);
      const params=new URLSearchParams({host:remoteHost,code:activeCode});
      res.writeHead(302,{Location:'https://www.86chaos.com/yardmaster#'+params.toString(),'Cache-Control':'no-store'});
      return res.end();
    }
    if(url.pathname==='/api/pair'&&req.method==='POST')return text(res,'This Yardmaster version uses passkey pairing. Refresh the mobile PWA.',410);
    if(url.pathname==='/api/remote/health'&&req.method==='GET')return json(res,{ok:true,version:packageInfo.version,connectionId:connectionIdentity.id,tunnelStatus:state.remote?.active?'ready':'local',pairingAvailable:!!pairCode&&Date.now()<pairExpiresAt,pairExpiresAt:pairExpiresAt||null});
    if(url.pathname.startsWith('/api/')&&!tokenOk(req))return text(res,'Unauthorized',401);
    if(url.pathname==='/api/handoff-diagnostic'&&req.method==='GET'){
      const diagnostic=state.workflow?.diagnostic||state.selfTest?.diagnostic;
      if(!diagnostic?.path)return text(res,'No handoff diagnostic is available.',404);
      const root=path.resolve(path.join(dataDir,'handoff-diagnostics')),file=path.resolve(String(diagnostic.path));
      if(!(file===root||file.startsWith(root+path.sep))||!fs.existsSync(file)||!fs.statSync(file).isFile())return text(res,'Handoff diagnostic file is unavailable.',404);
      const name=path.basename(file);
      res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="'+name.replace(/"/g,'')+'"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      fs.createReadStream(file).pipe(res);return;
    }
    if(url.pathname==='/api/self-test-diagnostic'&&req.method==='GET'){
      const diagnostic=state.selfTest?.diagnostic;
      if(!diagnostic?.path)return text(res,'No self-test diagnostic is available.',404);
      const root=path.resolve(path.join(dataDir,'self-test-diagnostics')),file=path.resolve(String(diagnostic.path));
      if(!(file===root||file.startsWith(root+path.sep))||!fs.existsSync(file)||!fs.statSync(file).isFile())return text(res,'Self-test diagnostic file is unavailable.',404);
      const name=path.basename(file);
      res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="'+name.replace(/"/g,'')+'"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      fs.createReadStream(file).pipe(res);return;
    }
    if(url.pathname==='/api/status'){refreshRemoteHealth();if(state.remote?.active&&!remotePhoneConnected()&&state.remote.status==='connected')state.remote.status='tunnel-ready';let adoptableRun=null;try{const a=discoverAdoptableReleaseGate(config.repositoryPath);if(a?.active&&String(a.runnerState?.status||'running')==='running')adoptableRun={runId:a.runId,mode:a.mode,pid:a.pid,currentPhase:a.runnerState?.currentPhase||'unknown',activityFresh:!!a.activityFresh}}catch{}state.adoptableRun=adoptableRun;const currentSession=sessionFor(req),currentDevice=currentSession&&devices[currentSession.deviceId];const resources=(state.intelligence._resourceAt&&Date.now()-state.intelligence._resourceAt<10000)?state.intelligence._resource:resourceSnapshot({activePid:activeProcess?.pid||null});state.intelligence._resource=resources;state.intelligence._resourceAt=Date.now();const intelligence={timeline:workflowTimeline(state),resources,hang:assessHang(state,resources),mobileActions:mobileActionCards(state),safeMode:safeModeStatus(dataDir),cost:costGuardSnapshot(dataDir,config),lastFailure:state.intelligence.lastFailureFingerprint?lookupFailureMemory(dataDir,{stage:state.workflow?.state,test:state.run?.currentTest,message:state.workflow?.error||state.run?.title,logs:state.run?.log||[]}):null};return json(res,{...state,connection:connectionDescriptor,workingProject:workingProject(state.run,config.repositoryPath),intelligence,selfHeal:selfHealStatusSnapshot(),operatorStatus:operatorStatusSnapshot(),pushHealth:pushHealthSnapshot(),remote:{...state.remote,phoneConnected:remotePhoneConnected()},runHistory:readRunHistory(20),branches:localBranches(),currentDevice:currentDevice?{id:currentDevice.id,name:currentDevice.name,hasPush:!!currentDevice.subscription,pushStatus:currentDevice.pushStatus||null,pushLastSentAt:currentDevice.pushLastSentAt||null,pushLastError:currentDevice.pushLastError||null,pushLastErrorAt:currentDevice.pushLastErrorAt||null}:null,trustedDevices:Object.values(devices).map(d=>({id:d.id,name:d.name,createdAt:d.createdAt,lastSeenAt:d.lastSeenAt,hasPasskey:!!d.credential,hasPush:!!d.subscription,pushStatus:d.pushStatus||null,pushLastSentAt:d.pushLastSentAt||null,pushLastError:d.pushLastError||null,pushLastErrorAt:d.pushLastErrorAt||null})),run:{...state.run,elapsedMs:(activeProcess||adoptedRunController)?Date.now()-runStartedAt:state.run.elapsedMs}})};
    if(url.pathname==='/api/intelligence'&&req.method==='GET'){
      const repoPath=repositoryPathOrThrow(),preflight=await preflightDoctorAsync({repoPath,config,operatorPort}),resources=resourceSnapshot({activePid:activeProcess?.pid||null}),changed=changesSinceLastGood({repoPath,dataDir,config}),known=lookupFailureMemory(dataDir,{stage:state.workflow?.state,test:state.run?.currentTest,message:state.workflow?.error||state.run?.title,logs:state.run?.log||[]});
      state.intelligence.preflight=preflight;
      return json(res,{updatedAt:Date.now(),preflight,resources,hang:assessHang(state,resources),health:healthSnapshot({state:{...state,pushHealth:pushHealthSnapshot()},config,preflight,resources}),timeline:workflowTimeline(state),evidence:listEvidence(dataDir),flakes:flakyTestIntelligence(dataDir),knownFailure:known,smartTests:smartTestSelection(changed.changedFiles),worktrees:listWorktrees(repoPath),provenance:releaseProvenance({repoPath,appRoot:__dirname,version:packageInfo.version,state,config}),manifest:buildManifest(__dirname),selfHealAttempts:compareSelfHealAttempts(state.selfHeal?.attempts||[]),mobileActions:mobileActionCards(state),cost:costGuardSnapshot(dataDir,config),profiles:listProfiles(dataDir),audit:readAudit(dataDir,{limit:80}),changes:changed,annotations:runAnnotations(dataDir,state.run?.runId||'current'),safeMode:safeModeStatus(dataDir),screenshotAvailable:fs.existsSync(path.join(dataDir,'self-heal','last-window.png'))});
    }
    if(url.pathname==='/api/evidence'&&req.method==='GET'){const file=resolveEvidenceFile(dataDir,url.searchParams.get('id'));const ext=path.extname(file).toLowerCase();const types={'.json':'application/json; charset=utf-8','.log':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8','.md':'text/markdown; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.zip':'application/zip'};res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Content-Disposition':ext==='.zip'?('attachment; filename="'+path.basename(file).replace(/"/g,'')+'"'):'inline','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});fs.createReadStream(file).pipe(res);return}
    if(url.pathname==='/api/chatgpt-screenshot'&&req.method==='GET'){const file=path.join(dataDir,'self-heal','last-chatgpt.png');if(!fs.existsSync(file))return text(res,'No recent ChatGPT view is available.',404);res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});fs.createReadStream(file).pipe(res);return}
    if(url.pathname==='/api/operator-screenshot'&&req.method==='GET'){const file=path.join(dataDir,'self-heal','last-window.png');if(!fs.existsSync(file))return text(res,'No recent Yardmaster-only screenshot is available.',404);res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});fs.createReadStream(file).pipe(res);return}
    if(url.pathname==='/api/config'&&req.method==='POST'){
      const b=await body(req);firebaseSettings({firebaseMode:b.firebaseMode??config.firebaseMode,firebaseLivePhase:b.firebaseLivePhase??config.firebaseLivePhase});const allowed=['firebaseMode','firebaseLivePhase','branch','testType','chatMode','model','thinkingEffort','repoUpdateMode','autoPush','waitForDeploy','repositoryPath','testingUrl','vercelProject','autoUpdateOperator','autoHandoff','autoSelfHeal','maxRepairAttempts','maxSelfHealAttempts','runAfterDeploy','dryRunMode','mobileLiveScreenshot','chatLoopEnabled','chatLoopPlan','hangThresholdMs','githubActionsMinuteLimit','vercelBuildLimit'];for(const k of allowed)if(k in b)config[k]=(['maxRepairAttempts','maxSelfHealAttempts','hangThresholdMs','githubActionsMinuteLimit','vercelBuildLimit'].includes(k))?Math.max(0,Math.min(10_000_000,Number(b[k])||0)):b[k];
      if(!/^[A-Za-z0-9._\/-]+$/.test(config.branch))throw new Error('Invalid branch name.');
      if(!TEST_TYPES.includes(config.testType))config.testType='delta';
      if(!['Work','Chat'].includes(config.chatMode))config.chatMode='Work';
      if(!['Instant','Medium','High'].includes(config.thinkingEffort))config.thinkingEffort='High';
      if(!['automatic','ask','never'].includes(config.repoUpdateMode))config.repoUpdateMode='automatic';
      config.chatLoopEnabled=!!config.chatLoopEnabled;config.chatLoopPlan=String(config.chatLoopPlan||'').slice(0,4000);parseChatLoopPlan(config.chatLoopPlan);
      writeJson(cfgPath,config);syncFirebase();audit('config-update',Object.keys(b).join(','),isLocal(req)?'windows':'mobile');activity('Preferences updated.');return json(res,{ok:true,config});
    }
    if(url.pathname==='/api/command'&&req.method==='POST'){const b=await body(req);await executeProtocol(b.text);return json(res,{ok:true,state:state.workflow?.state||state.run?.state});}
    if(url.pathname==='/api/action'&&req.method==='POST'){
      const actionBody=await body(req),{action,deviceId}=actionBody;audit('action',String(action||''),isLocal(req)?'windows':'mobile');
      if(config.dryRunMode&&['start','push','new-implementation','self-heal-now','update-operator-now','remote-start'].includes(String(action))&&!actionBody.forceLive){const plan=dryRunPlan(action,{state,config});activity('Dry-run simulated '+action+' without executing external/destructive work.','warn');return json(res,{ok:true,dryRun:true,plan})}
      if(action==='run-preflight'){const result=await preflightDoctorAsync({repoPath:repositoryPathOrThrow(),config,operatorPort},{force:true});state.intelligence.preflight=result;persist();return json(res,{ok:true,result})}
      if(action==='create-repro-capsule'){const file=createReproductionCapsule(dataDir,{repoPath:repositoryPathOrThrow(),state,config,version:packageInfo.version});state.intelligence.lastReproduction=file;activity('Created isolated reproduction capsule '+path.basename(file)+'.');return json(res,{ok:true,path:file,name:path.basename(file)})}
      if(action==='create-snapshot'){const file=createRepositorySnapshot(dataDir,{repoPath:repositoryPathOrThrow(),config,version:packageInfo.version,reason:String(actionBody.reason||'manual')});state.intelligence.lastSnapshot=file;activity('Created repository snapshot '+path.basename(file)+'.');return json(res,{ok:true,path:file,name:path.basename(file)})}
      if(action==='restore-last-snapshot'){const dir=path.join(dataDir,'snapshots');let candidates=[];try{candidates=fs.readdirSync(dir).filter(n=>/^Yardmaster-Snapshot-.*\.zip$/i.test(n)).map(n=>({path:path.join(dir,n),mtime:fs.statSync(path.join(dir,n)).mtimeMs})).sort((a,b)=>b.mtime-a.mtime)}catch{}const latest=candidates[0]?.path;if(!latest)throw new Error('No pre-repair snapshot is available.');if(process.env.YARDMASTER_TEST_RESTORE_SNAPSHOT_STUB==='1'){activity('Undo Last Repair validated the latest snapshot through the test stub.');return json(res,{ok:true,restored:path.basename(latest),stubbed:true})}if(process.platform!=='win32')throw new Error('Snapshot restore requires Windows.');const script=path.join(__dirname,'scripts','Restore-Snapshot.ps1');execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-RepoPath',repositoryPathOrThrow(),'-SnapshotPath',latest],{cwd:__dirname,encoding:'utf8',windowsHide:true,maxBuffer:20*1024*1024});activity('Restored the last pre-repair snapshot without touching .git, credentials, or local environment files.','warn');audit('restore-snapshot',path.basename(latest));return json(res,{ok:true,restored:path.basename(latest)})}
      if(action==='export-build-manifest'){const manifest=buildManifest(__dirname),file=path.join(dataDir,'intelligence','BUILD-MANIFEST-'+packageInfo.version+'.json');fs.mkdirSync(path.dirname(file),{recursive:true});writeJson(file,manifest);activity('Exported reproducible build manifest.');return json(res,{ok:true,path:file,manifest})}
      if(action==='save-profile'){const profile=saveProfile(dataDir,String(actionBody.name||'Profile'),config);activity('Saved configuration profile '+profile.name+'.');return json(res,{ok:true,profile})}
      if(action==='apply-profile'){const profiles=listProfiles(dataDir),profile=profiles[String(actionBody.key||'')];if(!profile)throw new Error('Configuration profile not found.');config={...config,...profile.config,repositoryPath:config.repositoryPath,automationDefaultsVersion:7};writeJson(cfgPath,config);activity('Applied configuration profile '+profile.name+'.');return json(res,{ok:true,config})}
      if(action==='delete-profile'){deleteProfile(dataDir,String(actionBody.key||''));activity('Deleted configuration profile.');return json(res,{ok:true})}
      if(action==='create-worktree'){const result=createWorktree(dataDir,{repoPath:repositoryPathOrThrow(),branch:String(actionBody.branch||''),base:String(actionBody.base||'HEAD')});activity('Created isolated worktree '+result.branch+'.');return json(res,{ok:true,result})}
      if(action==='remove-worktree'){const result=removeWorktree({repoPath:repositoryPathOrThrow(),worktreePath:String(actionBody.path||'')});activity('Removed isolated worktree.');return json(res,{ok:true,result})}
      if(action==='add-run-note'||action==='bookmark-run'){const item=annotateRun(dataDir,{runId:state.run?.runId||'current',note:String(actionBody.note||''),bookmark:action==='bookmark-run'||!!actionBody.bookmark,state});activity((item.bookmark?'Bookmarked':'Noted')+' current run.');return json(res,{ok:true,item})}
      if(action==='set-safe-mode'){const safe=setSafeMode(dataDir,!!actionBody.enabled,String(actionBody.reason||'manual'));state.safeMode=safe;activity('Safe Mode '+(safe.enabled?'enabled':'disabled')+'.',safe.enabled?'warn':'info');return json(res,{ok:true,safeMode:safe})}
      if(action==='toggle-live-screenshot'){config.mobileLiveScreenshot=!config.mobileLiveScreenshot;writeJson(cfgPath,config);activity('Mobile live screenshot '+(config.mobileLiveScreenshot?'enabled':'disabled')+'.');return json(res,{ok:true,enabled:config.mobileLiveScreenshot})}
      if(action==='dry-run-plan'){return json(res,{ok:true,plan:dryRunPlan(String(actionBody.targetAction||'start'),{state,config})})}
      
      if(action==='save-self-test-diagnostic'){
        const destination=saveSelfTestDiagnosticToDownloads(state.selfTest?.diagnostic);
        state.selfTest.savedPath=destination;state.selfTest.diagnosticSaveError=null;
        activity('Saved self-test diagnostics to Downloads: '+path.basename(destination));
        persist();
        return json(res,{ok:true,name:path.basename(destination),path:destination});
      }
      if(action==='shutdown-operator'){
        json(res,{ok:true});setTimeout(shutdownOperator,25);return;
      }
      if(action==='remote-stop'){json(res,{ok:true,remoteStatus:'local'});setTimeout(stopRemote,75);return}
      if(action==='new-implementation'){
        const task=String(actionBody.taskPrompt||'').trim();
        if(workflowBusy)throw new Error('Yardmaster is already handling another ChatGPT job.');
        if(activeProcess)throw new Error('A test process is already running.');
        if(!task)throw new Error('Implementation task is empty.');
        if(task.length>12000)throw new Error('Implementation task is too long. Keep it under 12,000 characters.');
        ensureNonProductionBranch(config.branch,'New 86 Chaos Work');
        ensureSelectedBranch();
        ensureCleanBeforeRepair();
        state.workflow={state:'implementation-queued',repairAttempts:0,pendingRepair:null,repairApplied:false,approval:null,handsFree:true,pushWhenPassed:!!actionBody.pushWhenPassed,taskPrompt:task,handoffKind:'implementation',requiredCoverage:['play-store','playwright']};
        activity('New 86 Chaos Work accepted from '+(isLocal(req)?'Windows':'authenticated mobile')+'. The PC is starting the handoff.');
        persist();
        json(res,{ok:true,state:'implementation-queued',runsOn:'windows-pc'});
        if(process.env.YARDMASTER_TEST_QUEUE_ONLY!=='1')setTimeout(()=>submitImplementationTask(task,{pushWhenPassed:!!actionBody.pushWhenPassed}).catch(error=>{state.workflow={...state.workflow,state:'handoff-error',error:error.message,diagnostic:error.diagnostic||null};state.chatgpt={state:'Error',detail:error.message,diagnostic:error.diagnostic?.name||null};activity('Implementation start failed: '+error.message+(error.diagnostic?.name?' Diagnostic: '+error.diagnostic.name:''),'error');persist()}),25);
        return;
      }else if(action==='self-heal-now'){const checkpoint=selfHealCheckpoint(),diagnostic=latestSelfHealDiagnostic();queueSelfHeal(String(actionBody.reason||'Manual Yardmaster self-heal requested'),diagnostic,checkpoint);return json(res,{ok:true,state:state.selfHeal});}else if(action==='resume-self-heal'){if(!readSelfHealRequest(dataDir))throw new Error('No pending Yardmaster self-heal request exists.');if(process.env.YARDMASTER_TEST_SELF_HEAL_QUEUE_ONLY==='1'){state.selfHeal={...state.selfHeal,state:'queued',detail:'Self-heal resume accepted by Playwright test stub.'};persist();return json(res,{ok:true,state:'queued',stubbed:true})}setTimeout(()=>runPendingSelfHeal().catch(error=>{state.selfHeal={...state.selfHeal,state:'failed',error:error.message};activity('Self-heal retry failed: '+error.message,'error');persist()}),25);return json(res,{ok:true,state:'queued'});}else if(action==='update-operator-now'){const result=await requestOperatorUpdate({automatic:false,requestedBy:isLocal(req)?'Windows dashboard':'paired phone'});return json(res,{ok:true,...result,update:state.update});}else if(action==='full-self-test'){if(workflowBusy)throw new Error('Yardmaster is already handling another ChatGPT job.');state.selfTest={state:'queued',stage:'queued',detail:'Full isolated process test queued.',steps:{},startedAt:Date.now(),diagnostic:null};persist();setTimeout(()=>runIsolatedFullSelfTest().catch(()=>{}),25);return json(res,{ok:true,state:'queued',isolated:true});}else if(action==='adopt-running-test'){const adopted=await adoptManualPlayStoreRun();return json(res,{ok:true,...adopted});}else if(action==='start')runTest({closedLoop:['full','delta','full-then-delta'].includes(config.testType)});else if(action==='stop')stopRun();else if(action==='pause')pauseRun();else if(action==='resume')await resumeRun();else if(action==='push')await gitPush();else if(action==='verify-deployment'){const commit=state.deployment?.expectedCommit||gitRun(['rev-parse','HEAD']);await watchDeployment(commit)}else if(action==='consume-chatgpt-command'){if(process.env.YARDMASTER_TEST_CHATGPT_COMMAND_STUB!=='1')startProtocolBridge();activity(process.env.YARDMASTER_TEST_CHATGPT_COMMAND_STUB==='1'?'Yardmaster command bridge test stub accepted the request.':'Yardmaster command bridge is watching the current ChatGPT conversation.')}else if(action==='remote-start')beginRemoteStart();else if(action==='revoke-device'){if(!devices[deviceId])throw new Error('Trusted device was not found.');const name=devices[deviceId].name;delete devices[deviceId];for(const [token,session] of sessions)if(session.deviceId===deviceId)sessions.delete(token);persistSessions();writeJson(devicesPath,devices);activity('Revoked trusted device: '+name+'.','warn')}else if(action==='approve-repair')await applyPendingRepair();else if(action==='reject-repair')rejectPendingRepair();else if(action==='resume-handoff'){if(state.workflow?.handsFree&&state.workflow?.taskPrompt)await resumeImplementationTask();else await submitCurrentHandoff({resume:true});}else if(action==='open-chatgpt'){state.chatgpt={state:'Opening'};const result=process.env.YARDMASTER_TEST_OPEN_CHATGPT_STUB==='1'?{state:'opened',stubbed:true}:await openChatGPT({mode:config.chatMode,model:config.model,thinkingEffort:config.thinkingEffort,dataDir});state.chatgpt={state:result.state==='login_required'?'Sign in required':'Opened for manual use',detail:result.message||null,stubbed:!!result.stubbed};activity(result.state==='login_required'?(result.message||'Opened ChatGPT. Sign in once, then choose Open ChatGPT again for a clean manual chat.'):'Opened ChatGPT for manual use with a clean composer. No automated handoff or command bridge was started.')}else throw new Error('Unknown action.');return json(res,{ok:true,remoteStatus:state.remote?.status||'local'});
    }
    if(url.pathname==='/api/push/key')return json(res,{publicKey:vapid.publicKey});
    if(url.pathname==='/api/push/subscribe'&&req.method==='POST'){
      const b=await body(req),session=sessionFor(req),d=session&&devices[session.deviceId];if(!d)return text(res,'Unauthorized',401);
      if(!validPushSubscription(b.subscription))return text(res,'Invalid push subscription.',400);
      d.subscription=b.subscription;d.pushStatus='subscribed';d.pushLastError=null;d.lastSeenAt=Date.now();writeJson(devicesPath,devices);
      const result=b.test===false?{ok:true,skipped:true}:await sendPushToDevice(d,'Yardmaster notifications enabled','This phone will now receive test, repair, and deployment status alerts.',{tag:'yardmaster-push-ready'});
      writeJson(devicesPath,devices);activity((result.ok?'Push notifications enabled and verified for ':'Push subscription saved but test delivery failed for ')+d.name+(result.ok?'.':': '+String(result.reason||result.statusCode||'unknown error')),(result.ok?'info':'warn'));
      return json(res,{ok:true,testDelivered:!!result.ok,statusCode:result.statusCode||null,needsResubscribe:!!result.needsResubscribe,pushStatus:d.pushStatus||null,error:result.ok?null:(result.reason||'Push test failed.')});
    }
    if(url.pathname==='/api/push/test'&&req.method==='POST'){
      const session=sessionFor(req),d=session&&devices[session.deviceId];if(!d)return text(res,'Unauthorized',401);
      if(!d.subscription)return text(res,'Push notifications are not enabled on this phone.',409);
      const result=await sendPushToDevice(d,'Yardmaster test notification','Push delivery from the Windows Yardmaster operator is working.',{tag:'yardmaster-push-test'});
      writeJson(devicesPath,devices);activity((result.ok?'Push test delivered to ':'Push test failed for ')+d.name+(result.ok?'.':': '+String(result.reason||result.statusCode||'unknown error')),(result.ok?'info':'warn'));
      return json(res,{ok:!!result.ok,statusCode:result.statusCode||null,needsResubscribe:!!result.needsResubscribe,pushStatus:d.pushStatus||null,error:result.ok?null:(result.reason||'Push test failed.')},result.ok?200:502);
    }
    if(url.pathname==='/api/devices')return json(res,Object.values(devices).map(d=>({id:d.id,name:d.name,createdAt:d.createdAt,lastSeenAt:d.lastSeenAt,hasPasskey:!!d.credential,hasPush:!!d.subscription})));
    if(staticFile(req,res))return;text(res,'Not found',404);
  }catch(e){activity(e.message||String(e),'error');text(res,e.message||String(e),500)}
});
async function recoverInterruptedOperatorRun(){
  if(activeProcess||adoptedRunController||firebaseStarting||workflowBusy)return;
  const wf=state.workflow,run=state.run;
  let discovered=null;try{discovered=discoverAdoptableReleaseGate(config.repositoryPath)}catch{}
  const strategy=interruptedRunAction({run,workflow:wf,paused:!!readPauseCheckpoint(dataDir),adoptable:!!discovered?.active});
  if(strategy==='none')return;
  if(strategy==='adopt'){await adoptManualPlayStoreRun();return}
  if(strategy==='blocked'){state.run.state='failed';state.run.title='Operator recovery needs attention';wf.state='operator-recovery-blocked';wf.error='The operator restarted three times during this saved test stage.';activity(wf.error,'error');notify('Yardmaster: operator recovery needs attention',wf.error);persist();return}
  wf.operatorRecoveryAttempts=Number(wf.operatorRecoveryAttempts||0)+1;
  activity('Recovered interrupted operator session; resuming the saved test stage ('+wf.operatorRecoveryAttempts+'/3).','warn');
  runTest({retry:true,closedLoop:true,source:'operator-restart-recovery'});
}
server.listen(operatorPort,'127.0.0.1',()=>{audit('operator-start','Yardmaster '+packageInfo.version+' started.','system');activity('Yardmaster local operator started on port '+operatorPort+'.');console.log('Yardmaster: http://127.0.0.1:'+operatorPort);if(state.remote?.active&&state.remote?.url&&pidAlive(state.remote.pid)){startPairing();setRemoteUrl(state.remote.url).catch(()=>{});activity('Restored persistent Remote Access tunnel after Yardmaster restart. Waiting for an authenticated phone connection.')}else if(remoteWanted)beginRemoteStart();resumeAfterOperatorUpdate();readOperatorUpdateResult();setInterval(readOperatorUpdateResult,2000);resumePendingSelfHeal();setTimeout(()=>recoverInterruptedOperatorRun().catch(error=>{activity('Interrupted test recovery failed: '+error.message,'error');persist()}),2000);if(process.env.YARDMASTER_DISABLE_UPDATE_CHECKS!=='1'){setTimeout(checkForOperatorUpdate,30000);setInterval(checkForOperatorUpdate,4*60*60*1000)}setInterval(refreshRemoteHealth,30000);setInterval(()=>{if(state.run?.state!=='running')return;const resources=resourceSnapshot({activePid:activeProcess?.pid||null}),hang=assessHang(state,resources);state.intelligence.hang=hang;if(hang.state==='stalled'&&!state.run.hangWarning){state.run.hangWarning=true;activity('Resource watchdog: '+hang.reason,'warn');notify('Yardmaster: possible hang detected',hang.reason)}},30000)});
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,async()=>{cancelRequested=true;firebaseAbort?.abort();if(activeProcess)terminateProcessTree(activeProcess.pid);try{stopChatGPTAutomation();await stopFirebaseSession()}catch{}persist();process.exit(0)});
