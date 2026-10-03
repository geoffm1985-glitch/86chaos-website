import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {killWindowsProcessTrees} from './windows-process-tree.mjs';

export const LIVE_PROJECT='chaos-test-d1601';
export const DEMO_PROJECT='demo-86chaos';
export const FIREBASE_MODES=['emulator','live','both'];
export const LIVE_PHASES=['verification','full'];
const products=['firestore','auth','functions','database','storage'];
const ports={firestore:8080,auth:9099,functions:5001,database:9000,storage:9199,hub:4400};
const guard=fileURLToPath(new URL('./firebase-network-guard.cjs',import.meta.url));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
export function firebaseTempDirectory(dataDir,{platform=process.platform,tempDir=os.tmpdir()}={}){
  // Windows Java selectors need socket files under the standard Temp directory.
  // An owner-specific subfolder still isolates Storage from other test processes.
  return platform==='win32'?path.join(tempDir,'yardmaster-firebase-'+createHash('sha256').update(path.resolve(dataDir)).digest('hex').slice(0,12)):path.join(dataDir,'runtime-tmp');
}
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
export function firebaseSettings(value={}){
  const mode=value.firebaseMode??'emulator',livePhase=value.firebaseLivePhase??'verification';
  if(!FIREBASE_MODES.includes(mode)||!LIVE_PHASES.includes(livePhase))throw new Error('Invalid Firebase test mode or live phase.');
  return {mode,livePhase};
}
export function isFirebaseProject(repo){
  return /^86[-_ ]?chaos$/i.test(read(path.join(repo,'package.json')).name)||fs.existsSync(path.join(repo,'yardmaster.firebase.json'));
}
export function newFirebaseRun(config,saved=null){
  if(saved){firebaseSettings({firebaseMode:saved.mode,firebaseLivePhase:saved.livePhase});return saved}
  const selected=firebaseSettings(config);
  return {...selected,target:selected.mode==='live'?'live':'emulator',phase:'starting',localComplete:false,localRepairRequired:false,
    emulatorPhases:0,livePhases:0,liveVerificationAttempts:0,emulatorRuntimeMs:0,liveRuntimeMs:0,fallbackAttempted:false,liveFirebaseContacted:false,liveContactEvidence:'none',startedAt:Date.now()};
}
export function firebasePhase(run,type,{retry=false}={}){
  const target=run.mode==='live'?'live':run.mode==='both'&&run.localComplete&&!run.localRepairRequired?'live':'emulator';
  const actualType=target==='live'&&run.mode==='both'?(run.livePhase==='full'?'full':'verification'):
    target==='emulator'&&run.mode==='both'&&!run.localComplete&&!retry?'full':
    target==='emulator'&&run.mode==='both'&&run.localRepairRequired&&retry?'delta':type;
  run.target=target;run.phase=actualType==='verification'?'live-verification':`${target}-${actualType}`;run.phaseStartedAt=Date.now();
  if(target==='emulator')run.emulatorPhases++;else{run.livePhases++;if(actualType==='verification')run.liveVerificationAttempts++;run.liveFirebaseContacted=null;run.liveContactEvidence='awaiting-bridge-evidence'}
  return {target,type:actualType};
}
export function finishFirebasePhase(run,code,telemetry={}){
  const runtime=Math.max(0,Date.now()-(run.phaseStartedAt||Date.now()));
  run[run.target==='emulator'?'emulatorRuntimeMs':'liveRuntimeMs']+=runtime;
  if(run.target==='live'&&typeof telemetry.liveFirebaseContacted==='boolean'){run.liveFirebaseContacted=telemetry.liveFirebaseContacted;run.liveContactEvidence='bridge-reported'}
  if(code!==0){
    if(run.mode==='both'&&run.target==='live'){run.target='emulator';run.localRepairRequired=true;run.phase='local-repair-required'}
    return 'failed';
  }
  if(run.target==='emulator'&&run.mode==='both'){run.localComplete=true;run.localRepairRequired=false;run.phase='live-pending';return 'live-next'}
  run.phase='complete';return 'complete';
}
export function readFirebaseBridge(repo){
  const file=path.join(repo,'yardmaster.firebase.json');
  if(!fs.existsSync(file))throw new Error('86 Chaos emulator bridge is missing yardmaster.firebase.json. Emulator tests are blocked; live Firebase was not selected.');
  const b=read(file),pkg=read(path.join(repo,'package.json'));
  if(b.schema!==1||!/^demo-[a-z0-9-]+$/.test(b.projectId||'')||!Array.isArray(b.products)||!b.products.length||b.products.some(p=>!products.includes(p)))throw new Error('Invalid 86 Chaos emulator bridge project/products.');
  const url=new URL(b.localApp?.url||'');
  if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password)throw new Error('Emulator app URL must use HTTP on loopback.');
  if(!/^\/[A-Za-z0-9/_-]+$/.test(b.localApp.readyPath||'')||!pkg.scripts?.[b.localApp.startScript])throw new Error('86 Chaos local app startScript/readyPath is unavailable.');
  const firebase=read(path.join(repo,b.firebaseConfig||'firebase.json'));
  for(const p of products){if(firebase[p]&&!b.products.includes(p))throw new Error('Required Firebase product is absent from bridge: '+p)}
  if(!b.products.includes('firestore')||!b.products.includes('auth'))throw new Error('86 Chaos requires Auth and Firestore emulators.');
  const endpoints=Object.fromEntries([...b.products,'hub'].map(p=>[p,{host:'127.0.0.1',port:Number(firebase.emulators?.[p]?.port||ports[p])}]));
  if(Object.values(endpoints).some(e=>!Number.isInteger(e.port)||e.port<1||e.port>65535)||new Set(Object.values(endpoints).map(e=>e.port)).size!==Object.keys(endpoints).length)throw new Error('Invalid or duplicate Firebase emulator ports.');
  for(const [key,value] of Object.entries(b.scripts||{}))if(!/^[A-Za-z0-9:_-]+$/.test(value)||!pkg.scripts?.[value])throw new Error('Bridge npm script unavailable: '+key);
  for(const key of ['full','delta','playwright'])if(!b.scripts?.[key])throw new Error('Bridge requires complete full, delta and Playwright scripts.');
  return {...b,firebase,endpoints,localUrl:url.href.replace(/\/$/,'')};
}
// NODE_OPTIONS treats backslashes as escapes, including inside double quotes.
export function firebasePreloadOption(file=guard){return '--require='+JSON.stringify(file.replaceAll('\\','/'))}
export function firebaseEnvironment({run,bridge=null,base=process.env,telemetryFile,networkLog,liveUrl}={}){
  const env={...base},emulator=run.target==='emulator';
  for(const key of Object.keys(env)){
    if(key==='CHAOS_BLOCK_LIVE_FIREBASE'||/EMULATOR|^CHAOS_FIREBASE_|^VITE_FIREBASE_|^YARDMASTER_FIREBASE_(TARGET|PROJECT|BRIDGE|NETWORK|TELEMETRY)/.test(key))delete env[key];
    if(emulator&&/TOKEN|CREDENTIAL|SERVICE_ACCOUNT|GOOGLE_APPLICATION|FIREBASE_CONFIG/.test(key))delete env[key];
  }
  env.YARDMASTER_FIREBASE_MODE=run.mode;env.YARDMASTER_FIREBASE_TARGET=emulator?'emulator':'live';
  env.CHAOS_FIREBASE_TARGET=env.VITE_FIREBASE_TARGET=env.FIREBASE_TEST_TARGET=env.YARDMASTER_FIREBASE_TARGET;
  const project=emulator?(bridge?.projectId||DEMO_PROJECT):LIVE_PROJECT;
  // Pin every gate/app alias before dotenv can fill it from saved live settings.
  for(const key of ['GCLOUD_PROJECT','GOOGLE_CLOUD_PROJECT','FIREBASE_PROJECT_ID','FIREBASE_ACTIVE_PROJECT_ID','FIREBASE_TEST_PROJECT_ID','REACT_APP_FIREBASE_PROJECT_ID','REACT_APP_TEST_FIREBASE_PROJECT_ID','CHAOS_EXPECTED_TEST_FIREBASE_PROJECT_ID','VITE_FIREBASE_PROJECT_ID','CHAOS_FIREBASE_PROJECT_ID','YARDMASTER_FIREBASE_PROJECT'])env[key]=project;
  env.FIREBASE_CONFIG=JSON.stringify({projectId:project,databaseURL:`https://${project}-default-rtdb.firebaseio.com`,storageBucket:project+'.appspot.com'});
  if(telemetryFile)env.YARDMASTER_FIREBASE_TELEMETRY_FILE=telemetryFile;
  // Remove a previous emulator preload when routing to live verification.
  env.NODE_OPTIONS=(env.NODE_OPTIONS||'').replace(/--require(?:=|\s+)"[^"]*firebase-network-guard\.cjs"/g,'').trim();
  if(emulator){
    env.CHAOS_BLOCK_LIVE_FIREBASE='1';env.YARDMASTER_FIREBASE_NETWORK_LOG=networkLog||'';
    env.NODE_OPTIONS=`${env.NODE_OPTIONS} ${firebasePreloadOption()}`.trim();
  }
  if(emulator&&bridge){
    const address=p=>bridge.endpoints[p]&&`${bridge.endpoints[p].host}:${bridge.endpoints[p].port}`;
    for(const [key,p] of [['FIRESTORE_EMULATOR_HOST','firestore'],['FIREBASE_AUTH_EMULATOR_HOST','auth'],['FIREBASE_DATABASE_EMULATOR_HOST','database'],['FIREBASE_STORAGE_EMULATOR_HOST','storage'],['CLOUD_STORAGE_EMULATOR_HOST','storage'],['FIREBASE_FUNCTIONS_EMULATOR_HOST','functions'],['FIREBASE_EMULATOR_HUB','hub']])if(address(p))env[key]=address(p);
    env.CHAOS_FIREBASE_EMULATORS_JSON=env.VITE_FIREBASE_EMULATORS_JSON=JSON.stringify(bridge.endpoints);
    env.VITE_FIREBASE_API_KEY='demo-emulator-key';env.VITE_FIREBASE_AUTH_DOMAIN=project+'.firebaseapp.com';env.VITE_FIREBASE_STORAGE_BUCKET=project+'.appspot.com';
  }
  const url=emulator?bridge?.localUrl:liveUrl;
  if(url)for(const key of ['PLAYWRIGHT_BASE_URL','BASE_URL','TEST_BASE_URL','RELEASE_GATE_BASE_URL','CHAOS_TEST_BASE_URL'])env[key]=url;
  return env;
}
export function firebaseCommand(repo,phase,bridge=null){
  const pkg=read(path.join(repo,'package.json'));
  const script=phase.type==='verification'?(bridge?.scripts?.liveVerification||'test:firebase:live-verification'):
    bridge?.scripts?.[phase.type]||({full:'test:play-store',delta:'test:play-store:delta',targeted:'test:current-release-targeted',playwright:'test:playwright'}[phase.type]);
  if(!script||!pkg.scripts?.[script]||!/^[A-Za-z0-9:_-]+$/.test(script))throw new Error('Firebase phase script unavailable: '+(script||phase.type)+'. The live full suite will not be substituted.');
  return 'npm run '+script;
}
export function spawnManaged(command,args,{cwd,env}={}){
  if(process.platform==='win32'&&/\.cmd$/i.test(command)){
    // Resolve before quoting: a bare batch filename can make %~dp0 refer to
    // the working repository instead of the batch file's installation folder.
    if(!path.isAbsolute(command))command=/[\\/]/.test(command)?path.resolve(cwd||process.cwd(),command):
      execFileSync('where.exe',[command],{cwd,env,encoding:'utf8',windowsHide:true}).trim().split(/\r?\n/)[0];
    // Match Node's Windows shell transport: outer /s quotes and verbatim argv.
    const quote=s=>'"'+String(s).replaceAll('"','""')+'"';
    return spawn(process.env.ComSpec||'cmd.exe',['/d','/s','/c','"'+quote(command)+' '+args.map(quote).join(' ')+'"'],{cwd,env,windowsHide:true,windowsVerbatimArguments:true,stdio:'pipe'});
  }
  return spawn(command,args,{cwd,env,detached:process.platform!=='win32',windowsHide:true,stdio:'pipe'});
}
export async function killManaged(child){
  if(!child?.pid)return;
  const closed=new Promise(resolve=>{if(child.yardmasterClosed)resolve();else child.once('close',resolve)});
  if(process.platform==='win32')await killWindowsProcessTrees([child.pid]);
  else{try{process.kill(-child.pid,child.yardmasterSignal||'SIGTERM')}catch{try{child.kill(child.yardmasterSignal||'SIGTERM')}catch{}}}
  await Promise.race([closed,delay(child.yardmasterSignal?8000:1500)]);
  if(child.exitCode===null&&process.platform!=='win32'){try{process.kill(-child.pid,'SIGKILL')}catch{try{child.kill('SIGKILL')}catch{}}await Promise.race([closed,delay(1000)])}
}
export function detectFirebaseTools(repo,appRoot,{exists=fs.existsSync,run=execFileSync,platform=process.platform}={}){
  const candidates=[repo,appRoot].map(root=>path.join(root,'node_modules','firebase-tools','lib','bin','firebase.js'));
  try{
    const wrappers=run(platform==='win32'?'where.exe':'which',['firebase'],{encoding:'utf8',windowsHide:true,timeout:5000}).trim().split(/\r?\n/);
    for(const wrapper of wrappers){
      candidates.push(path.join(path.dirname(wrapper),'node_modules','firebase-tools','lib','bin','firebase.js'));
      if(platform!=='win32'&&exists(wrapper))candidates.push(fs.realpathSync(wrapper));
    }
  }catch{}
  let cli;
  for(const candidate of [...new Set(candidates)]){
    if(!exists(candidate))continue;
    try{run(process.execPath,[candidate,'--version'],{encoding:'utf8',windowsHide:true,timeout:20000,env:{...process.env,NODE_OPTIONS:'',FIREBASE_CLI_DISABLE_UPDATE_CHECK:'true'}});cli=candidate;break}catch{}
  }
  if(!cli)throw new Error('No runnable Firebase CLI was found. Repair firebase-tools dependencies, then retry Emulator mode. No live fallback was attempted.');
  try{run('java',['-version'],{stdio:'pipe',windowsHide:true,timeout:10000})}catch{throw new Error('Java JDK is missing; Firebase Firestore/Database/Storage emulators cannot start.')}
  return {executable:process.execPath,prefix:[cli]};
}
export async function portOpen(endpoint,{timeoutMs=10000,connect=net.connect}={}){return new Promise(resolve=>{const socket=connect(endpoint.port,endpoint.host);socket.setTimeout(timeoutMs);const done=value=>{socket.destroy();resolve(value)};socket.once('connect',()=>done(true));socket.once('error',()=>done(false));socket.once('timeout',()=>done(false))})}
export async function readinessJson(url,{timeoutMs=10000,pendingProjectId}={}){
  try{
    const r=await fetch(url,{signal:AbortSignal.timeout(timeoutMs)});
    if(!r.ok){
      const error=new Error('Readiness HTTP '+r.status);let body;try{body=await r.json()}catch{}
      error.sdkReadinessPending=r.status===503&&!!pendingProjectId&&body?.target==='emulator'&&body.projectId===pendingProjectId&&body.blockLiveFirebase===true&&body.ready===false;
      if(body?.error)error.message+=': '+String(body.error).slice(0,500);
      throw error;
    }
    return await r.json();
  }catch(error){
    if(error.name==='TimeoutError')throw new Error('Readiness timed out after '+timeoutMs+'ms: '+url,{cause:error});
    throw error;
  }
}
function absolutePaths(value,repo,pathImpl=path){
  if(Array.isArray(value))return value.map(v=>absolutePaths(v,repo,pathImpl));
  if(!value||typeof value!=='object')return value;
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,['rules','indexes','source'].includes(k)&&typeof v==='string'?pathImpl.resolve(repo,v):absolutePaths(v,repo,pathImpl)]));
}
function ensureFunctionsJunction(link,target){
  if(fs.existsSync(link)||fs.lstatSync(link,{throwIfNoEntry:false})){
    if(!fs.lstatSync(link).isSymbolicLink())throw new Error('Reserved emulator Functions path is not a junction: '+link);
    if(fs.realpathSync(link)===fs.realpathSync(target))return;
    fs.unlinkSync(link);
  }
  fs.symlinkSync(target,link,'junction');
}
export function firebaseSessionConfiguration(firebase,repo,dataDir,{pathImpl=path,makeJunction=ensureFunctionsJunction}={}){
  const configuration=absolutePaths(firebase,repo,pathImpl);
  const sources=Array.isArray(configuration.functions)?configuration.functions:[configuration.functions];
  sources.forEach((entry,index)=>{
    if(!entry?.source)return;
    // Firebase CLI's Functions emulator uses path.join(projectDir, source).
    // A Windows absolute source is concatenated into an invalid double-drive path.
    const relative=pathImpl.relative(dataDir,entry.source);
    if(pathImpl.isAbsolute(relative)){
      // Cross-drive repositories need a junction, outside the repository checkout.
      const name='functions-source-'+index;
      makeJunction(pathImpl.join(dataDir,name),entry.source);
      entry.source=name;
    }else entry.source=relative||'.';
  });
  return configuration;
}
export class FirebaseSession {
  constructor({repo,appRoot,dataDir,onStatus=()=>{},onFatal=()=>{},detect=detectFirebaseTools,spawnProcess=spawnManaged,timeoutMs=300000,healthGraceMs=60000,now=Date.now}={}){
    Object.assign(this,{repo,appRoot,dataDir,onStatus,onFatal,detect,spawnProcess,timeoutMs,healthGraceMs,now});this.children=[];this.testChildren=new Set();this.status='stopped';this.stopping=false;this.sdkPendingSince=null;
  }
  snapshot(){return {status:this.status,project:this.bridge?.projectId||DEMO_PROJECT,products:Object.fromEntries((this.bridge?.products||[]).map(p=>[p,this.status])),pids:this.children.map(c=>c.pid),testPids:[...this.testChildren].map(c=>c.pid),startedAt:this.startedAt||null,runtimeMs:this.startedAt?Date.now()-this.startedAt:0,error:this.error||null}}
  emit(){this.onStatus(this.snapshot())}
  async ready(){
    const {endpoints,products,localUrl,localApp,projectId}=this.bridge;
    const hub=await readinessJson(`http://${endpoints.hub.host}:${endpoints.hub.port}/emulators`);
    for(const p of products)if(!hub[p]||Number(hub[p].port)!==endpoints[p].port||!['127.0.0.1','localhost','::1'].includes(hub[p].host)||!await portOpen(endpoints[p]))throw new Error('Required emulator is unavailable: '+p);
    const app=await readinessJson(localUrl+localApp.readyPath,{pendingProjectId:projectId});
    if(app.target!=='emulator'||app.projectId!==projectId||app.blockLiveFirebase!==true||products.some(p=>!app.products?.includes(p)))throw new Error('86 Chaos bridge did not acknowledge emulator-only SDK routing and no-live guard.');
  }
  async start(run,{signal}={}){
    if(this.stopPromise)await this.stopPromise;
    if(this.status==='running'){
      // Repair overlays trigger a real bundle/SDK reload. Suspend health polling
      // and allow the same bounded readiness window used for a fresh start.
      this.status='starting';this.emit();
      const end=Date.now()+this.timeoutMs;let last;
      while(Date.now()<end){
        if(this.error||this.stopping||signal?.aborted)throw new Error(this.error||'Emulator startup was cancelled.');
        try{await this.ready();this.status='running';this.healthFailures=0;this.sdkPendingSince=null;this.emit();return this.bridge}catch(error){last=error}
        await delay(200);
      }
      throw new Error('Emulator readiness timed out after repair: '+(last?.message||'not ready'));
    }
    if(this.starting)return this.starting;
    this.stopping=false;this.error=null;this.healthFailures=0;this.sdkPendingSince=null;
    this.starting=this.startInternal(run,signal).finally(()=>{this.starting=null});return this.starting;
  }
  async startInternal(run,signal){
    this.status='starting';this.emit();
    try{
      this.bridge=readFirebaseBridge(this.repo);const tools=this.detect(this.repo,this.appRoot);
      for(const e of Object.values(this.bridge.endpoints))if(await portOpen(e))throw new Error('Emulator port '+e.port+' is already occupied. Yardmaster will not adopt an unverified session.');
      const appURL=new URL(this.bridge.localUrl);if(await portOpen({host:appURL.hostname,port:Number(appURL.port||80)}))throw new Error('Local emulator app port is already occupied.');
      fs.mkdirSync(this.dataDir,{recursive:true});const configFile=path.join(this.dataDir,'firebase-session.json');
      const configuration=firebaseSessionConfiguration(this.bridge.firebase,this.repo,this.dataDir);configuration.emulators={...this.bridge.endpoints,ui:{enabled:false},singleProjectMode:true};
      // Exclude non-emulated products and preserve existing rules/functions sources.
      fs.writeFileSync(configFile,JSON.stringify(configuration,null,2));
      const env=firebaseEnvironment({run:{...run,target:'emulator'},bridge:this.bridge,networkLog:path.join(this.dataDir,'firebase-network.jsonl')});
      // CLI downloads use official Firebase distribution servers; SDK/test children are guarded.
      // Firebase Storage uses os.tmpdir()/firebase/storage for live upload blobs.
      // Isolate it from test fixtures and other emulator processes on this PC.
      const cliTemp=firebaseTempDirectory(this.dataDir);fs.mkdirSync(cliTemp,{recursive:true});
      const cliEnv={...env,TEMP:cliTemp,TMP:cliTemp,TMPDIR:cliTemp,NODE_OPTIONS:process.env.NODE_OPTIONS||'',FIREBASE_CLI_DISABLE_UPDATE_CHECK:'true',FUNCTIONS_DISCOVERY_TIMEOUT:'60'};
      const savedData=path.join(this.dataDir,'emulator-data');
      const imports=fs.existsSync(path.join(savedData,'firebase-export-metadata.json'))?['--import',savedData]:[];
      this.watchdog=spawn(process.execPath,[fileURLToPath(new URL('./firebase-watchdog.mjs',import.meta.url)),String(process.pid)],{stdio:['ignore','ignore','ignore','ipc'],windowsHide:true,detached:true});
      this.watchdog.once('exit',()=>{this.watchdogExited=true});this.watchdog.once('close',()=>{this.watchdogExited=true});this.watchdogExited=false;
      this.watchdog.on('error',e=>this.fail(new Error('Emulator watchdog unavailable: '+e.message)));this.watchdog.unref();this.watchdog.channel?.unref();
      const cli=this.spawnProcess(tools.executable,[...tools.prefix,'emulators:start','--project',this.bridge.projectId,'--config',configFile,'--only',this.bridge.products.join(','),'--export-on-exit',savedData,...imports,'--non-interactive'],{cwd:this.dataDir,env:cliEnv});cli.yardmasterSignal='SIGINT';
      this.add(cli,'Firebase Emulator Suite');
      this.add(this.spawnProcess(process.platform==='win32'?'npm.cmd':'npm',['run',this.bridge.localApp.startScript],{cwd:this.repo,env}),'86 Chaos local app');
      const end=Date.now()+this.timeoutMs;let last;
      while(Date.now()<end){
        // A fatal child exit initiates stop(); retain that cause before cancellation.
        if(this.error)throw new Error(this.error);
        if(signal?.aborted||this.stopping)throw new Error('Emulator startup was cancelled.');
        if(this.children.some(c=>c.exitCode!==null)||this.error)throw new Error(this.error||'An emulator/local app exited before readiness.');
        try{await this.ready();this.status='running';this.startedAt=Date.now();this.emit();this.monitor=setInterval(()=>this.checkHealth(),3000);this.monitor.unref();return this.bridge}catch(e){last=e}
        await delay(200);
      }
      throw new Error('Emulator readiness timed out: '+(last?.message||'not ready'));
    }catch(error){this.error=error.message;await this.stop();this.status='blocked';this.emit();throw error}
  }
  async checkHealth(){
    if(this.checking||this.stopping||this.status!=='running')return;this.checking=true;
    try{await this.ready();this.healthFailures=0;this.sdkPendingSince=null}catch(error){
      if(!this.stopping&&this.status==='running'){
        this.healthFailures=(this.healthFailures||0)+1;
        if(error.sdkReadinessPending){
          if(this.sdkPendingSince===null){this.sdkPendingSince=this.now();this.onStatus({...this.snapshot(),message:'Local SDK readiness delayed; preserving owned tests during a bounded '+Math.round(this.healthGraceMs/1000)+'-second emulator-only recheck window. '+error.message})}
          if(this.now()-this.sdkPendingSince<this.healthGraceMs)return;
        }else this.sdkPendingSince=null;
        if(this.healthFailures>=3)this.fail(error);
      }
    }finally{this.checking=false}
  }
  sendOwned(){
    if(this.watchdog?.connected)this.watchdog.send({type:'owned',pids:[...this.children,...this.testChildren].map(c=>c.pid).filter(Number.isInteger)},()=>{});
  }
  ownTestProcess(child){
    this.testChildren.add(child);this.sendOwned();this.emit();
    child.once('close',()=>{child.yardmasterClosed=true;this.testChildren.delete(child);this.sendOwned();this.emit()});
  }
  add(child,label){
    child.once('close',()=>{child.yardmasterClosed=true});
    this.children.push(child);this.sendOwned();
    child.stdout?.on('data',d=>this.onStatus({...this.snapshot(),message:label+': '+String(d).trim()}));child.stderr?.on('data',d=>{child.yardmasterStderr=((child.yardmasterStderr||'')+String(d)).slice(-2048);this.onStatus({...this.snapshot(),message:label+': '+String(d).trim()})});
    child.once('error',e=>this.fail(new Error(label+': '+e.message)));child.once('exit',(code,signal)=>{if(!this.stopping)this.fail(new Error(label+' exited ('+(code??signal)+'). Tests blocked; no live fallback.'+(child.yardmasterStderr?'\n'+child.yardmasterStderr.trim():'')))});
  }
  fail(error){if(this.stopping||this.status==='blocked')return;this.error=error.message;this.status='blocked';clearInterval(this.monitor);this.emit();this.onFatal(error);void this.stop().then(()=>{this.status='blocked';this.emit()})}
  stop(){
    if(this.stopPromise)return this.stopPromise;
    this.stopping=true;clearInterval(this.monitor);
    const owned=[...this.children.splice(0),...this.testChildren],watchdog=this.watchdog;this.testChildren.clear();
    this.stopPromise=(async()=>{
      await Promise.all(owned.map(killManaged));
      if(watchdog){
        watchdog.ref();watchdog.channel?.ref();
        // The watchdog has no output pipes; exit releases its directory handles.
        // Node can omit close after a parent-initiated IPC disconnect.
        const closed=this.watchdogExited?Promise.resolve():new Promise(resolve=>{watchdog.once('exit',resolve);watchdog.once('close',resolve)});
        if(watchdog.connected){await new Promise(resolve=>watchdog.send({type:'disarm'},()=>resolve()));if(watchdog.connected)watchdog.disconnect()}
        await closed;
      }
      this.watchdog=null;this.status='stopped';this.emit();
    })().finally(()=>{this.stopPromise=null});
    return this.stopPromise;
  }
}
