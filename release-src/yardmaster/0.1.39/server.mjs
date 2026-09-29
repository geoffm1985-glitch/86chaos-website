import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';import {spawn,execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import {openChatGPT,submitRepairToChatGPT,startCommandBridge} from './automation/chatgpt.mjs';import webpush from 'web-push';import QRCode from 'qrcode';import {generateRegistrationOptions,verifyRegistrationResponse,generateAuthenticationOptions,verifyAuthenticationResponse} from '@simplewebauthn/server';
const __dirname=path.dirname(fileURLToPath(import.meta.url));const publicDir=path.join(__dirname,'public');const dataDir=process.env.YARDMASTER_DATA_DIR||(process.env.LOCALAPPDATA?path.join(process.env.LOCALAPPDATA,'Yardmaster'):path.join(os.homedir(),'.yardmaster'));fs.mkdirSync(dataDir,{recursive:true});
const packageInfo=readJson(path.join(__dirname,'package.json'),{version:'0.0.0'});
const cfgPath=path.join(dataDir,'config.json'),statePath=path.join(dataDir,'state.json'),devicesPath=path.join(dataDir,'devices.json'),vapidPath=path.join(dataDir,'vapid.json'),sessionsPath=path.join(dataDir,'sessions.json'),remotePath=path.join(dataDir,'remote.json');
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
const defaults={repositoryPath:defaultRepositoryPath,branch:'testing',testType:'delta',chatMode:'Work',model:'GPT-5.6 Sol',thinkingEffort:'High',repoUpdateMode:'automatic',autoPush:false,waitForDeploy:true,testingUrl:'https://testing.86chaos.com',vercelProject:'86chaos',autoUpdateOperator:true,autoHandoff:true,maxRepairAttempts:25,runAfterDeploy:true,automationDefaultsVersion:4};
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
const recoveredRepositoryPath=detectRepositoryPath(config.repositoryPath);
if(recoveredRepositoryPath)config.repositoryPath=recoveredRepositoryPath;
writeJson(cfgPath,config);let devices=readJson(devicesPath,{});let vapid=readJson(vapidPath,null);if(!vapid){vapid=webpush.generateVAPIDKeys();writeJson(vapidPath,vapid)}webpush.setVapidDetails('mailto:yardmaster@local.invalid',vapid.publicKey,vapid.privateKey);
function pidAlive(pid){try{if(!Number(pid))return false;process.kill(Number(pid),0);return true}catch{return false}}
const savedRemote=readJson(remotePath,null);
const restoredRemote=savedRemote?.active&&savedRemote?.url&&pidAlive(savedRemote.pid)?{active:true,status:'tunnel-ready',url:savedRemote.url,pid:Number(savedRemote.pid),pairCode:null,pairExpiresAt:null,error:null,lastClientAt:null}:{active:false,status:'local',url:null,pid:null,pairCode:null,pairExpiresAt:null,error:null,lastClientAt:null};
let state={online:true,version:packageInfo.version,machineName:os.hostname(),config,run:{state:'idle',title:'Ready for work',subtitle:'Choose a branch and test type, then start.',progress:0,counts:{pass:0,fail:0,skip:0,timeout:0},currentTest:'Idle',elapsedMs:0,log:[]},activity:[],deployment:{state:'Idle'},chatgpt:{state:'Ready'},remote:restoredRemote,update:{state:'Current',version:packageInfo.version},workflow:{state:'idle',repairAttempts:0,pendingRepair:null,repairApplied:false,approval:null}};
const old=readJson(statePath,null);if(old?.activity)state.activity=old.activity.slice(-80);let activeProcess=null,remoteProcess=null,remoteStartPromise=null,remoteStartNonce=0,runStartedAt=0,pairCode=null,pairExpiresAt=0,workflowBusy=false,currentRunOptions={},cancelRequested=false,pauseRequested=false,pausedCompletion=null,commandBridge=null;const RP_ID='86chaos.com',RP_NAME='Yardmaster',EXPECTED_ORIGINS=['https://www.86chaos.com','https://86chaos.com'];const pendingRegistrations=new Map(),pendingAuthentications=new Map(),pairFailures=new Map();
const savedSessions=readJson(sessionsPath,{});const sessions=new Map(Object.entries(savedSessions).filter(([,s])=>s&&Number(s.expiresAt)>Date.now()));
function persistSessions(){writeJson(sessionsPath,Object.fromEntries(sessions))}
function tokenHash(token){return crypto.createHash('sha256').update(String(token||'')).digest('hex')}
function saveRemoteState(){writeJson(remotePath,{active:!!state.remote?.active,status:state.remote?.status||'local',url:state.remote?.url||null,pid:Number(state.remote?.pid)||null,updatedAt:Date.now()})}
function remotePhoneConnected(){return !!state.remote?.lastClientAt&&(Date.now()-Number(state.remote.lastClientAt)<15000)}
function markRemoteClient(session){
  if(!session||!state.remote.active)return;
  state.remote.lastClientAt=Date.now();
  state.remote.status='connected';
}
persistSessions();
function persist(){state.config=config;writeJson(statePath,{...state,remote:{...state.remote,pairCode:null,pairExpiresAt:null,qrDataUrl:null}});if(state.remote?.active)saveRemoteState()}function activity(message,level='info'){state.activity.push({at:Date.now(),message,level});state.activity=state.activity.slice(-100);persist()}async function notify(title,body){for(const d of Object.values(devices)){if(!d.subscription)continue;try{await webpush.sendNotification(d.subscription,JSON.stringify({title,body,url:'https://www.86chaos.com/yardmaster'}))}catch(e){if(e.statusCode===404||e.statusCode===410){delete d.subscription;writeJson(devicesPath,devices)}}}}function redactConsoleLine(line){let s=String(line).replace(/\x1b\[[0-9;]*m/g,'');s=s.replace(/(authorization\s*:\s*bearer\s+)[^\s]+/ig,'$1[REDACTED]');s=s.replace(/\b(gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{25,}|sk-[A-Za-z0-9_-]{20,})\b/g,'[REDACTED]');s=s.replace(/((?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|secret|credential)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s]+)/ig,'$1[REDACTED]');return s}function log(line){const s=redactConsoleLine(line);if(!s.trim())return;state.run.log.push(s);state.run.log=state.run.log.slice(-350);parseLine(s);persist()}
function parseLine(s){let m;if((m=s.match(/(?:ℹ\s*)?tests\s+(\d+)/i)))state.run.total=+m[1];if((m=s.match(/(?:ℹ\s*)?pass\s+(\d+)/i)))state.run.counts.pass=+m[1];if((m=s.match(/(?:ℹ\s*)?fail\s+(\d+)/i)))state.run.counts.fail=+m[1];if((m=s.match(/(?:ℹ\s*)?skipped\s+(\d+)/i)))state.run.counts.skip=+m[1];if((m=s.match(/(?:ℹ\s*)?timeout\s+(\d+)/i)))state.run.counts.timeout=+m[1];if((m=s.match(/^\s*[✔✓]\s+(.+)/)))state.run.currentTest=m[1].slice(0,130);if((m=s.match(/^\s*[✖×]\s+(.+)/)))state.run.currentTest=m[1].slice(0,130);if((m=s.match(/\b(\d+)\s*\/\s*(\d+)\b/))&&+m[2]>0){state.run.progress=Math.round(+m[1]/+m[2]*100)}else if(state.run.total){const done=(state.run.counts.pass||0)+(state.run.counts.fail||0)+(state.run.counts.skip||0);state.run.progress=Math.min(99,Math.round(done/state.run.total*100))}}
function versionParts(value){return String(value||'0').split('.').map(x=>Number.parseInt(x,10)||0)}
function versionGreater(candidate,current){const a=versionParts(candidate),b=versionParts(current);for(let i=0;i<Math.max(a.length,b.length);i++){if((a[i]||0)!==(b[i]||0))return (a[i]||0)>(b[i]||0)}return false}
async function checkForOperatorUpdate(){
  try{
    if(process.env.YARDMASTER_DISABLE_UPDATE_CHECKS==='1'||!config.autoUpdateOperator||activeProcess||workflowBusy||state.update?.state==='Updating')return;
    const manifestUrl=process.env.YARDMASTER_RELEASE_MANIFEST||'https://www.86chaos.com/yardmaster/release.json';
    const response=await fetch(manifestUrl,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw new Error('Release service returned HTTP '+response.status+'.');
    const release=await response.json();
    if(release.verified!==true||!release.version||!release.downloadUrl||!release.sha256)throw new Error('Release manifest is incomplete or not verified.');
    if(!versionGreater(release.version,packageInfo.version)){state.update={state:'Current',version:packageInfo.version,checkedAt:Date.now()};persist();return}
    if(process.platform!=='win32'){state.update={state:'Available',version:release.version};persist();return}
    state.update={state:'Updating',from:packageInfo.version,to:release.version};activity(`Yardmaster ${release.version} is verified and available. Updating automatically.`);
    const updater=path.join(__dirname,'scripts','Update-Yardmaster.ps1');
    spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',updater,'-ManifestUrl',manifestUrl],{detached:true,stdio:'ignore',windowsHide:true}).unref();
    setTimeout(()=>process.exit(0),500);
  }catch(e){state.update={state:'Update check failed',version:packageInfo.version,error:e.message};activity('Operator update check failed: '+e.message,'warn')}
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
function psCommand(type){if(type==='full')return 'npm run test:play-store';if(type==='targeted')return 'npm run test:current-release-targeted';return 'npm run test:play-store:delta'}
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
    else if(verb==='RUN'){const t=arg.toLowerCase();if(!['delta','targeted','full'].includes(t))throw new Error('RUN supports delta, targeted, or full.');config.testType=t;writeJson(cfgPath,config);runTest();results.push({command:line,state:'started'});break;}
    else if(verb==='PUSH'){if(arg)config.branch=arg;await gitPush();results.push({command:line,state:'ok'});}
    else if(verb==='WAIT_VERCEL'){const commit=gitRun(['rev-parse','HEAD']);await watchDeployment(commit);results.push({command:line,state:'ok'});}
    else if(verb==='SEND_FAILURE'){await submitCurrentHandoff();results.push({command:line,state:'started'});}
    else if(verb==='STOP'){stopRun();results.push({command:line,state:'ok'});}
    else if(verb==='PAUSE'){pauseRun();results.push({command:line,state:'ok'});}
    else if(verb==='RESUME'){resumeRun();results.push({command:line,state:'ok'});}
    else throw new Error('Unsupported Yardmaster command: '+verb);
  }
  activity('Executed Yardmaster command block.');persist();return results;
}
function saveRunRecord(exitCode){
  try{
    const dir=path.join(dataDir,'runs');fs.mkdirSync(dir,{recursive:true});
    const id=new Date(runStartedAt||Date.now()).toISOString().replace(/[:.]/g,'-');
    const runDir=path.join(dir,id);fs.mkdirSync(runDir,{recursive:true});
    const record={id,startedAt:state.run.startedAt||runStartedAt||null,finishedAt:state.run.finishedAt||Date.now(),branch:config.branch,testType:config.testType,exitCode,state:state.run.state,counts:state.run.counts,currentTest:state.run.currentTest,elapsedMs:state.run.elapsedMs,command:state.run.command||psCommand(config.testType),cwd:state.run.cwd||config.repositoryPath};
    writeJson(path.join(runDir,'metadata.json'),record);
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
function buildHandoff(){
  const outDir=path.join(dataDir,'handoffs');fs.mkdirSync(outDir,{recursive:true});
  const out=path.join(outDir,`Yardmaster-Handoff-${Date.now()}.zip`);
  const script=path.join(__dirname,'scripts','New-Handoff.ps1');
  execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-RepoPath',repositoryPathOrThrow(),'-OutputPath',out,'-FailureSummary',failureSummary(),'-EvidenceDir',String(state.lastRunEvidenceDir||'')],{cwd:__dirname,encoding:'utf8',windowsHide:true,maxBuffer:20*1024*1024});
  return out;
}
function buildImplementationHandoff(taskPrompt){
  const outDir=path.join(dataDir,'handoffs');fs.mkdirSync(outDir,{recursive:true});
  const out=path.join(outDir,`Yardmaster-Implementation-${Date.now()}.zip`);
  const script=path.join(__dirname,'scripts','New-Handoff.ps1');
  execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-RepoPath',repositoryPathOrThrow(),'-OutputPath',out,'-WorkType','implementation','-TaskPrompt',String(taskPrompt||'')],{cwd:__dirname,encoding:'utf8',windowsHide:true,maxBuffer:20*1024*1024});
  return out;
}
function implementationPrompt(taskPrompt){
  return `Yardmaster implementation handoff. Inspect the uploaded current 86 Chaos application before changing anything, then implement the requested work with surgical, evidence-backed changes. Treat 86 Chaos as production software. Preserve correct behavior, .git, local environment/config files, Android and iPhone/iOS compatibility, and existing security boundaries. Do not request, expose, or add credentials. Every implementation change must include corresponding Play Store/release-gate coverage and every new build must increment the application version. Use targeted/delta verification for this ordinary change; use the full Play Store gate only when explicitly requested or for major release certification. Avoid destructive Git operations, minimize ongoing Firebase/Vercel/other infrastructure costs without weakening reliability or security, and never push production/main. Return ONE COMPLETE APPLICATION ZIP when finished. Yardmaster will apply it locally and verify it.\n\nRequested work:\n${String(taskPrompt||'').trim()}`;
}
function repairPrompt(){
  return `Yardmaster automated handoff. Inspect the uploaded ZIP, including the current application, YARDMASTER_PROMPT.txt, and any release-gate evidence. Diagnose the actual failure and make only the precise evidence-backed repair. Do not ask me to paste files that are already in the archive. Do not expose or add credentials. Preserve correct application behavior. Every implementation change must include corresponding release-gate/Play Store coverage, and every new application build must increment its version. Do not push to production. When finished, give me ONE COMPLETE APPLICATION ZIP containing the repaired app so Yardmaster can download and test it locally.\n\nLatest failure summary:\n${failureSummary()}`;
}
async function submitCurrentHandoff(){
  if(workflowBusy)return;
  const wf=state.workflow||(state.workflow={state:'idle',repairAttempts:0,pendingRepair:null,repairApplied:false,approval:null});
  if(process.env.YARDMASTER_TEST_HANDOFF_STUB==='1'){
    workflowBusy=true;
    wf.handoffPath=null;
    wf.handoffKind='test-stub';
    wf.repairAttempts=(wf.repairAttempts||0)+1;
    wf.state='chatgpt-stubbed';
    state.chatgpt={state:'Working',mode:config.chatMode,model:config.model,thinkingEffort:config.thinkingEffort};
    activity('Automatic failure handoff started after a failed test run.');
    workflowBusy=false;
    persist();
    return {state:'stubbed'};
  }
  if(!wf.handoffPath||!fs.existsSync(wf.handoffPath)){
    const slim=latestReleaseGateSlimZip();
    wf.handoffPath=slim||buildHandoff();
    wf.handoffKind=slim?'release-gate-slim':'structured-failure';
    activity(slim?'Using current Release Gate slim ZIP for ChatGPT handoff.':'No current slim ZIP exists; using structured failure handoff.');
  }
  workflowBusy=true;
  wf.state='chatgpt';wf.repairAttempts=(wf.repairAttempts||0)+1;wf.approval=null;wf.error=null;wf.diagnostic=null;state.chatgpt={state:'Working',mode:config.chatMode,model:config.model,thinkingEffort:config.thinkingEffort};activity(`Sending failure to ChatGPT (${config.chatMode}, ${config.model}, ${config.thinkingEffort}), repair attempt ${wf.repairAttempts}/${config.maxRepairAttempts}.`);
  try{
    const result=await submitRepairToChatGPT({mode:config.chatMode,model:config.model,thinkingEffort:config.thinkingEffort,prompt:repairPrompt(),artifactPath:wf.handoffPath,dataDir,onStatus:m=>{state.chatgpt={state:m,mode:config.chatMode,model:config.model,thinkingEffort:config.thinkingEffort};activity(m);persist()},shouldCancel:()=>cancelRequested});
    if(result.state==='login_required'){
      wf.repairAttempts=Math.max(0,(wf.repairAttempts||1)-1);wf.state='waiting-login';state.chatgpt={state:'Sign in required'};activity('Sign in to ChatGPT in the Yardmaster Edge window, then choose Resume Handoff.','warn');notify('Yardmaster needs you','Sign in to ChatGPT on the Windows PC, then resume the handoff.');return;
    }
    if(result.state!=='downloaded'||!result.repairPath)throw new Error('ChatGPT did not return a repaired ZIP.');
    wf.pendingRepair={zipPath:result.repairPath,receivedAt:Date.now(),attempt:wf.repairAttempts};wf.state='repair-downloaded';state.chatgpt={state:'Repair downloaded'};activity('ChatGPT repair ZIP downloaded.');
    if(wf.handsFree||config.repoUpdateMode==='automatic')await applyPendingRepair();
    else if(config.repoUpdateMode==='ask'){wf.approval={type:'repair',message:'Apply the downloaded repair to the local repository?',createdAt:Date.now()};wf.state='waiting-approval';activity('Repair is waiting for your approval.','warn');notify('Yardmaster approval needed','A repaired app ZIP is ready. Approve the local repository update to continue.')}
    else {wf.state='download-only';activity('Repair downloaded. Local Repo Update is set to Never, so no files were changed.');notify('Yardmaster repair downloaded','Repo Update is set to Never. Open Yardmaster when you are ready.')}
  }catch(e){
    if(cancelRequested){wf.state='stopped';state.chatgpt={state:'Stopped'};activity('ChatGPT handoff stopped by user.','warn')}else{wf.state='handoff-error';wf.error=e.message;wf.diagnostic=e.diagnostic||null;state.chatgpt={state:'Error',detail:e.message,diagnostic:e.diagnostic?.name||null};activity('ChatGPT handoff failed: '+e.message+(e.diagnostic?.name?' Diagnostic: '+e.diagnostic.name:''),'error');notify('Yardmaster handoff failed',e.message)}
  }finally{workflowBusy=false;persist()}
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
    error:null
  };
  workflowBusy=true;
  state.chatgpt={state:'Working',mode:config.chatMode,model:config.model,thinkingEffort:config.thinkingEffort};
  activity('Sending hands-free 86 Chaos implementation task to ChatGPT Work.');
  try{
    const result=await submitRepairToChatGPT({
      mode:config.chatMode,
      model:config.model,
      thinkingEffort:config.thinkingEffort,
      prompt:implementationPrompt(task),
      artifactPath:wf.handoffPath,
      dataDir,
      onStatus:m=>{state.chatgpt={state:m,mode:config.chatMode,model:config.model,thinkingEffort:config.thinkingEffort};activity(m);persist()},
      shouldCancel:()=>cancelRequested
    });
    if(result.state==='login_required'){
      wf.state='waiting-login';state.chatgpt={state:'Sign in required'};
      activity('Sign in to ChatGPT, then choose Resume Handoff.','warn');return;
    }
    if(result.state!=='downloaded'||!result.repairPath)throw new Error('ChatGPT did not return an implementation ZIP.');
    wf.pendingRepair={zipPath:result.repairPath,receivedAt:Date.now(),attempt:0};
    wf.state='implementation-downloaded';state.chatgpt={state:'Implementation downloaded'};
    activity('Implementation ZIP downloaded. Applying it locally and starting delta verification.');
    await applyPendingRepair();
  }catch(e){
    if(cancelRequested){wf.state='stopped';state.chatgpt={state:'Stopped'};activity('Implementation handoff stopped by user.','warn')}
    else{wf.state='handoff-error';wf.error=e.message;wf.diagnostic=e.diagnostic||null;state.chatgpt={state:'Error',detail:e.message,diagnostic:e.diagnostic?.name||null};activity('Implementation handoff failed: '+e.message+(e.diagnostic?.name?' Diagnostic: '+e.diagnostic.name:''),'error');notify('Yardmaster implementation failed',e.message)}
  }finally{workflowBusy=false;persist()}
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
  wf.state='applying-repair';wf.approval=null;activity('Applying repaired application ZIP to the local repository.');
  const script=path.join(__dirname,'scripts','Apply-Repair.ps1');
  execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-RepoPath',config.repositoryPath,'-ZipPath',wf.pendingRepair.zipPath],{cwd:__dirname,encoding:'utf8',windowsHide:true,maxBuffer:20*1024*1024});
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
  if(!config.autoHandoff){wf.state='failed-manual';activity('Tests failed. Automatic repair is disabled, so Yardmaster is waiting for Resume Handoff.','warn');persist();return}
  const limit=Number(config.maxRepairAttempts);if(limit>0&&(wf.repairAttempts||0)>=limit){wf.state='repair-limit';activity('Automatic repair limit reached. Yardmaster stopped.','warn');notify('Yardmaster stopped','The automatic repair-attempt limit was reached.');return}
  wf.handoffPath=null;
  await submitCurrentHandoff();
}
function continueAfterRun(code,options={}){
  if(code===0){
    state.workflow.state=options.postDeploy?'complete':'tests-passed';
    if(!options.postDeploy&&(state.workflow?.pushWhenPassed||config.autoPush))gitPush().catch(e=>activity('Auto-push failed: '+e.message,'error'));
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
function spawnTestProcess(repoPath,cmd){
  if(process.platform==='win32'){
    const args=['-NoProfile','-ExecutionPolicy','Bypass','-Command',`$env:GIT_PAGER='cat';$env:PAGER='cat';Set-Location '${repoPath.replaceAll("'","''")}'; ${cmd}`];
    return spawn('powershell.exe',args,{cwd:repoPath,windowsHide:true});
  }
  return spawn('/bin/sh',['-lc',`GIT_PAGER=cat PAGER=cat ${cmd}`],{cwd:repoPath,detached:true});
}
function runTest(options={}){
  if(activeProcess)throw new Error('A process is already running.');
  cancelRequested=false;pauseRequested=false;pausedCompletion=null;
  const repoPath=repositoryPathOrThrow();
  if(!options.retry&&!options.postDeploy)state.workflow={state:'testing',repairAttempts:0,pendingRepair:null,repairApplied:false,approval:null};
  currentRunOptions={...options};
  ensureSelectedBranch();
  const cmd=psCommand(config.testType);
  state.run={state:'running',title:config.testType==='full'?'Full Release Gate':'Local Test Run',subtitle:`${config.branch} • ${cmd}`,progress:1,counts:{pass:0,fail:0,skip:0,timeout:0},currentTest:'Starting…',elapsedMs:0,log:[],stdout:[],stderr:[],command:cmd,cwd:repoPath,startedAt:Date.now(),finishedAt:null,exitCode:null};
  runStartedAt=Date.now();activity(`Started ${config.testType} tests on ${config.branch}${options.postDeploy?' after deployment':''}.`);
  activeProcess=spawnTestProcess(repoPath,cmd);
  activeProcess.stdout.on('data',d=>String(d).split(/\r?\n/).forEach(line=>{if(line.trim()){state.run.stdout.push(line);state.run.stdout=state.run.stdout.slice(-2000)}log(line)}));activeProcess.stderr.on('data',d=>String(d).split(/\r?\n/).forEach(line=>{if(line.trim()){state.run.stderr.push(line);state.run.stderr=state.run.stderr.slice(-2000)}log(line)}));
  activeProcess.on('error',error=>{log('Could not start the test process: '+error.message)});
  activeProcess.on('close',code=>{
    activeProcess=null;state.run.elapsedMs=Date.now()-runStartedAt;state.run.finishedAt=Date.now();state.run.exitCode=code;if(cancelRequested){state.run.state='stopped';state.run.title='Stopped';state.run.currentTest='Stopped by user';state.workflow.state='stopped';saveRunRecord(code);persist();return}state.run.progress=100;state.run.state=code===0?'passed':'failed';state.run.title=code===0?'Tests Passed':'Tests Failed';state.run.currentTest=code===0?'Complete':'Stopped on failure';
    activity(code===0?'Test run passed.':`Test run failed with exit code ${code}.`,code===0?'info':'error');
    notify(code===0?'Yardmaster: Tests passed':'Yardmaster: Tests failed',code===0?`${state.run.counts.pass||0} passed, ${state.run.counts.skip||0} skipped.`:`${state.run.counts.fail||0} failed. Open Yardmaster for details.`);
    saveRunRecord(code);
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
function stopRun(){cancelRequested=true;pauseRequested=false;pausedCompletion=null;if(activeProcess){terminateProcessTree(activeProcess.pid);activeProcess=null}stopChatGPTAutomation();state.run.state='stopped';state.run.title='Stopped';state.workflow.state='stopped';state.chatgpt={state:'Stopped'};state.deployment={...state.deployment,state:'Stopped'};activity('Stopped all Yardmaster work. Remote control remains connected.','warn');persist()}
function pauseRun(){pauseRequested=true;if(activeProcess){state.run.state='paused';state.run.title='Pause requested';activity('Pause requested. The current command may finish, but Yardmaster will hold the next workflow step until Resume.','warn')}else{state.run.state='paused';state.run.title='Paused';state.workflow.state='paused';activity('Yardmaster workflow paused.','warn')}persist()}
function resumeRun(){
  pauseRequested=false;
  if(activeProcess){state.run.state='running';state.run.title=config.testType==='full'?'Full Release Gate':'Local Test Run';activity('Yardmaster workflow resumed.');persist();return}
  if(pausedCompletion){
    const pending=pausedCompletion;pausedCompletion=null;
    state.run.state=pending.code===0?'passed':'failed';
    state.run.title=pending.code===0?'Tests Passed':'Tests Failed';
    activity('Yardmaster workflow resumed after the completed command.');
    continueAfterRun(pending.code,pending.options||{});
    persist();return;
  }
  runTest({retry:true,source:'resume'});
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
  const repoPath=repositoryPathOrThrow(),branch=config.branch;
  if(!/^[A-Za-z0-9._\/-]+$/.test(branch))throw new Error('Invalid branch name.');
  ensureNonProductionBranch(branch,'automatic push');
  activity(`Preparing push to ${branch}.`);
  const current=gitRun(['branch','--show-current']);if(current!==branch){const status=gitRun(['status','--porcelain']);if(status)throw new Error('Working tree must be clean before switching branches.');gitRun(['switch',branch])}
  let commit=commitYardmasterRepairIfNeeded();if(!commit)commit=gitRun(['rev-parse','HEAD']);
  gitRun(['push','origin',branch]);activity(`Pushed ${branch} to origin at ${commit.slice(0,12)}.`);
  if(config.waitForDeploy){const ready=await watchDeployment(commit);if(ready&&config.runAfterDeploy&&!activeProcess)runTest({postDeploy:true,source:'deployment'})}
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
    persist();await new Promise(r=>setTimeout(r,15000));
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
  while(activeProcess&&!cancelRequested)await new Promise(r=>setTimeout(r,500));
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
  const commands=parseProtocol(text);if(!commands.length)return;
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
    if((m=line.match(/^RUN\s+(delta|full|targeted)$/i))){config.testType=m[1].toLowerCase();writeJson(cfgPath,config);runTest({source:'chatgpt-protocol'});await waitForProcess();continue}
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
  activity('Finished Yardmaster command block.');
}
function startProtocolBridge(){
  if(commandBridge)return;
  commandBridge=startCommandBridge({
    dataDir,
    onProtocol:executeProtocol,
    onStatus:m=>{state.chatgpt={state:m};activity(m);persist()}
  });
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
  saveRemoteState();persist();
}
function refreshRemoteHealth(){
  if(!state.remote?.active)return;
  const pid=Number(state.remote.pid||remoteProcess?.pid);
  if(pid&&pidAlive(pid))return;
  state.remote={active:false,status:'error',url:null,pid:null,pairCode:null,pairExpiresAt:null,error:'Remote tunnel is not running. Start Remote Access to reconnect.'};
  try{fs.rmSync(remotePath,{force:true})}catch{}
}
async function startRemote(nonce=remoteStartNonce){
  refreshRemoteHealth();
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
    child=spawn(exe,[...prefix,'tunnel','--no-autoupdate','--url','http://127.0.0.1:8787'],{windowsHide:true,detached:true,stdio:['ignore',fd,fd]});
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
    try{fs.rmSync(remotePath,{force:true})}catch{}
    persist();
    throw new Error(state.remote.error);
  }
  await setRemoteUrl(url);
  activity('Remote tunnel ready and will survive Yardmaster restarts. Scan the QR code with your phone.');
}
function beginRemoteStart(){
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
  remoteStartNonce++;
  const pid=Number(remoteProcess?.pid||state.remote?.pid);
  if(pid)terminateProcessTree(pid);
  remoteProcess=null;pairCode=null;pairExpiresAt=0;
  state.remote={active:false,status:'local',url:null,pid:null,pairCode:null,pairExpiresAt:null,error:null,lastClientAt:null};
  try{fs.rmSync(remotePath,{force:true})}catch{}
  activity('Remote access stopped.','warn');persist()
}
function shutdownOperator(){
  cancelRequested=true;
  if(activeProcess)terminateProcessTree(activeProcess.pid);
  activeProcess=null;
  stopChatGPTAutomation();
  // Keep the detached Remote Access tunnel alive so updates/restarts preserve the same phone URL.
  persist();
  setTimeout(()=>server.close(()=>process.exit(0)),50);
  setTimeout(()=>process.exit(0),1500).unref();
}
function clientIp(req){const cf=String(req.headers['cf-connecting-ip']||'').trim();if(cf)return cf;const xff=String(req.headers['x-forwarded-for']||'').split(',')[0].trim();return xff||req.socket.remoteAddress||'unknown'}
function isLocal(req){const forwarded=!!(req.headers['cf-connecting-ip']||req.headers['x-forwarded-for']);if(forwarded)return false;const a=req.socket.remoteAddress||'',host=String(req.headers.host||'').toLowerCase().split(':')[0];const loopback=a==='127.0.0.1'||a==='::1'||a.endsWith('127.0.0.1');return loopback&&(host==='127.0.0.1'||host==='localhost'||host==='[::1]')}
function requestToken(req){return (req.headers.authorization||'').replace(/^Bearer\s+/i,'')}
function sessionFor(req){const t=requestToken(req),key=tokenHash(t),s=sessions.get(key);if(!s)return null;if(Date.now()>s.expiresAt){sessions.delete(key);persistSessions();return null}markRemoteClient(s);return s}
function tokenOk(req){return isLocal(req)||!!sessionFor(req)}
function passkeyCredential(device){if(!device?.credential)return null;return {id:device.credential.id,publicKey:Buffer.from(device.credential.publicKey,'base64'),counter:Number(device.credential.counter||0),transports:device.credential.transports||[]}}
function pairAllowed(req,code){
  const key=clientIp(req),now=Date.now();let rec=pairFailures.get(key)||{count:0,blockedUntil:0,windowStart:now};
  if(rec.blockedUntil>now)return {ok:false,error:'Too many pairing attempts. Try again later.'};
  if(now-rec.windowStart>5*60*1000)rec={count:0,blockedUntil:0,windowStart:now};
  if(!pairCode||now>pairExpiresAt||String(code)!==pairCode){rec.count++;if(rec.count>=6)rec.blockedUntil=now+10*60*1000;pairFailures.set(key,rec);return {ok:false,error:'Invalid or expired pairing code.'}}
  pairFailures.delete(key);return {ok:true}
}
function newSession(deviceId){const token=crypto.randomBytes(32).toString('hex');sessions.set(tokenHash(token),{deviceId,expiresAt:Date.now()+12*60*60*1000});persistSessions();return token}
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
      writeJson(devicesPath,devices);pendingRegistrations.delete(b.registrationId);pairCode=null;pairExpiresAt=0;state.remote.pairCode='PAIRED';const sessionToken=newSession(id);activity(`Paired passkey device: ${devices[id].name}.`);return json(res,{sessionToken,deviceId:id,expiresIn:43200});
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
      d.credential.counter=Number(verification.authenticationInfo?.newCounter??d.credential.counter??0);d.lastSeenAt=Date.now();writeJson(devicesPath,devices);pendingAuthentications.delete(b.authId);const sessionToken=newSession(d.id);activity(`Passkey sign-in: ${d.name}.`);return json(res,{sessionToken,deviceId:d.id,expiresIn:43200});
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
    if(url.pathname==='/api/remote/health'&&req.method==='GET')return json(res,{ok:true,version:packageInfo.version,tunnelStatus:state.remote?.active?'ready':'local',pairingAvailable:!!pairCode&&Date.now()<pairExpiresAt,pairExpiresAt:pairExpiresAt||null});
    if(url.pathname.startsWith('/api/')&&!tokenOk(req))return text(res,'Unauthorized',401);
    if(url.pathname==='/api/handoff-diagnostic'&&req.method==='GET'){
      const diagnostic=state.workflow?.diagnostic;
      if(!diagnostic?.path)return text(res,'No handoff diagnostic is available.',404);
      const root=path.resolve(path.join(dataDir,'handoff-diagnostics')),file=path.resolve(String(diagnostic.path));
      if(!(file===root||file.startsWith(root+path.sep))||!fs.existsSync(file)||!fs.statSync(file).isFile())return text(res,'Handoff diagnostic file is unavailable.',404);
      const name=path.basename(file);
      res.writeHead(200,{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="'+name.replace(/"/g,'')+'"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      fs.createReadStream(file).pipe(res);return;
    }
    if(url.pathname==='/api/status'){refreshRemoteHealth();if(state.remote?.active&&!remotePhoneConnected()&&state.remote.status==='connected')state.remote.status='tunnel-ready';return json(res,{...state,remote:{...state.remote,phoneConnected:remotePhoneConnected()},runHistory:readRunHistory(20),branches:localBranches(),trustedDevices:Object.values(devices).map(d=>({id:d.id,name:d.name,createdAt:d.createdAt,lastSeenAt:d.lastSeenAt,hasPasskey:!!d.credential,hasPush:!!d.subscription})),run:{...state.run,elapsedMs:activeProcess?Date.now()-runStartedAt:state.run.elapsedMs}})};
    if(url.pathname==='/api/config'&&req.method==='POST'){
      const b=await body(req);const allowed=['branch','testType','chatMode','model','thinkingEffort','repoUpdateMode','autoPush','waitForDeploy','repositoryPath','testingUrl','vercelProject','autoUpdateOperator','autoHandoff','maxRepairAttempts','runAfterDeploy'];for(const k of allowed)if(k in b)config[k]=k==='maxRepairAttempts'?Math.max(0,Math.min(1000,Number(b[k])||0)):b[k];
      if(!/^[A-Za-z0-9._\/-]+$/.test(config.branch))throw new Error('Invalid branch name.');
      if(!['delta','targeted','full'].includes(config.testType))config.testType='delta';
      if(!['Work','Chat'].includes(config.chatMode))config.chatMode='Work';
      if(!['Instant','Medium','High'].includes(config.thinkingEffort))config.thinkingEffort='High';
      if(!['automatic','ask','never'].includes(config.repoUpdateMode))config.repoUpdateMode='automatic';
      writeJson(cfgPath,config);activity('Preferences updated.');return json(res,{ok:true,config});
    }
    if(url.pathname==='/api/command'&&req.method==='POST'){const b=await body(req);await executeProtocol(b.text);return json(res,{ok:true,state:state.workflow?.state||state.run?.state});}
    if(url.pathname==='/api/action'&&req.method==='POST'){
      const actionBody=await body(req),{action,deviceId}=actionBody;
      if(action==='shutdown-operator'){
        if(!isLocal(req))throw new Error('Yardmaster shutdown is available only from the Windows desktop.');
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
        state.workflow={state:'implementation-queued',repairAttempts:0,pendingRepair:null,repairApplied:false,approval:null,handsFree:true,pushWhenPassed:!!actionBody.pushWhenPassed,taskPrompt:task,handoffKind:'implementation'};
        activity('New 86 Chaos Work accepted from '+(isLocal(req)?'Windows':'authenticated mobile')+'. The PC is starting the handoff.');
        persist();
        json(res,{ok:true,state:'implementation-queued',runsOn:'windows-pc'});
        if(process.env.YARDMASTER_TEST_QUEUE_ONLY!=='1')setTimeout(()=>submitImplementationTask(task,{pushWhenPassed:!!actionBody.pushWhenPassed}).catch(error=>{state.workflow={...state.workflow,state:'handoff-error',error:error.message,diagnostic:error.diagnostic||null};state.chatgpt={state:'Error',detail:error.message,diagnostic:error.diagnostic?.name||null};activity('Implementation start failed: '+error.message+(error.diagnostic?.name?' Diagnostic: '+error.diagnostic.name:''),'error');persist()}),25);
        return;
      }else if(action==='start')runTest();else if(action==='stop')stopRun();else if(action==='pause')pauseRun();else if(action==='resume')resumeRun();else if(action==='push')await gitPush();else if(action==='verify-deployment'){const commit=state.deployment?.expectedCommit||gitRun(['rev-parse','HEAD']);await watchDeployment(commit)}else if(action==='consume-chatgpt-command'){startProtocolBridge();activity('Yardmaster command bridge is watching the current ChatGPT conversation.')}else if(action==='remote-start')beginRemoteStart();else if(action==='revoke-device'){if(!isLocal(req))throw new Error('Trusted-device revocation is available only from the Windows dashboard.');if(!devices[deviceId])throw new Error('Trusted device was not found.');const name=devices[deviceId].name;delete devices[deviceId];for(const [token,session] of sessions)if(session.deviceId===deviceId)sessions.delete(token);persistSessions();writeJson(devicesPath,devices);activity('Revoked trusted device: '+name+'.','warn')}else if(action==='approve-repair')await applyPendingRepair();else if(action==='reject-repair')rejectPendingRepair();else if(action==='resume-handoff'){if(state.workflow?.handsFree&&state.workflow?.taskPrompt)await resumeImplementationTask();else await submitCurrentHandoff();}else if(action==='open-chatgpt'){state.chatgpt={state:'Opening'};const result=await openChatGPT({mode:config.chatMode,model:config.model,thinkingEffort:config.thinkingEffort,dataDir});state.chatgpt={state:result.state==='login_required'?'Sign in required':'Opened for manual use'};activity(result.state==='login_required'?'Opened ChatGPT. Sign in once, then choose Open ChatGPT again for a clean manual chat.':'Opened ChatGPT for manual use with a clean composer. No automated handoff or command bridge was started.')}else throw new Error('Unknown action.');return json(res,{ok:true,remoteStatus:state.remote?.status||'local'});
    }
    if(url.pathname==='/api/push/key')return json(res,{publicKey:vapid.publicKey});
    if(url.pathname==='/api/push/subscribe'&&req.method==='POST'){
      const b=await body(req),session=sessionFor(req),d=session&&devices[session.deviceId];if(!d)return text(res,'Unauthorized',401);d.subscription=b.subscription;d.lastSeenAt=Date.now();writeJson(devicesPath,devices);activity('Push notifications enabled for '+d.name+'.');return json(res,{ok:true});
    }
    if(url.pathname==='/api/devices')return json(res,Object.values(devices).map(d=>({id:d.id,name:d.name,createdAt:d.createdAt,lastSeenAt:d.lastSeenAt,hasPasskey:!!d.credential,hasPush:!!d.subscription})));
    if(staticFile(req,res))return;text(res,'Not found',404);
  }catch(e){activity(e.message||String(e),'error');text(res,e.message||String(e),500)}
});
server.listen(8787,'127.0.0.1',()=>{activity('Yardmaster local operator started on port 8787.');console.log('Yardmaster: http://127.0.0.1:8787');if(state.remote?.active&&state.remote?.url&&pidAlive(state.remote.pid)){startPairing();setRemoteUrl(state.remote.url).catch(()=>{});activity('Restored persistent Remote Access tunnel after Yardmaster restart. Waiting for an authenticated phone connection.')}if(process.env.YARDMASTER_DISABLE_UPDATE_CHECKS!=='1'){setTimeout(checkForOperatorUpdate,30000);setInterval(checkForOperatorUpdate,4*60*60*1000)}setInterval(refreshRemoteHealth,30000)});
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{try{stopChatGPTAutomation()}catch{}persist();process.exit(0)});
