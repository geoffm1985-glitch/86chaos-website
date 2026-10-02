import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';

const now=()=>Date.now();
const readJson=(file,fallback=null)=>{try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback}};
const writeJson=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n','utf8')};
const sha=value=>crypto.createHash('sha256').update(Buffer.isBuffer(value)?value:String(value)).digest('hex');
const clean=value=>String(value??'').replace(/\s+/g,' ').trim();
const git=(repo,args,fallback='')=>{try{return execFileSync('git',args,{cwd:repo,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim()}catch{return fallback}};
const safeName=value=>String(value||'item').replace(/[^A-Za-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90)||'item';
const ensureDir=dir=>{fs.mkdirSync(dir,{recursive:true});return dir};
const archiveDir=(source,out)=>{
  fs.rmSync(out,{force:true});
  if(process.platform==='win32')execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command',`Compress-Archive -Path '${String(source).replaceAll("'","''")}\\*' -DestinationPath '${String(out).replaceAll("'","''")}' -Force`],{windowsHide:true,stdio:'pipe'});
  else execFileSync('zip',['-q','-r',out,'.'],{cwd:source,stdio:'pipe'});
  return out;
};
const fileHash=file=>sha(fs.readFileSync(file));
const configHash=config=>sha(JSON.stringify(config||{},Object.keys(config||{}).sort()));
const isTextExt=ext=>['.json','.txt','.log','.md','.mjs','.js','.cjs','.html','.css','.yml','.yaml','.ps1','.cmd','.svg','.webmanifest'].includes(ext.toLowerCase());

export function failureFingerprint(input={}){
  const source=[
    clean(input.stage).toLowerCase(),
    clean(input.test||input.currentTest).toLowerCase(),
    clean(input.message||input.error).toLowerCase().replace(/0x[0-9a-f]+/gi,'0x#').replace(/\b\d{4,}\b/g,'#'),
    clean(Array.isArray(input.logs)?input.logs.slice(-20).join(' '):input.logs).toLowerCase().replace(/\b\d{4,}\b/g,'#')
  ].join('|').slice(-16000);
  return sha(source);
}
export function recordFailureMemory(dataDir,input={}){
  const file=path.join(dataDir,'intelligence','failure-memory.json'),db=readJson(file,{schema:1,items:{}});
  const fingerprint=failureFingerprint(input),old=db.items[fingerprint]||{fingerprint,firstSeenAt:now(),occurrences:0,repairs:[]};
  const item={...old,lastSeenAt:now(),occurrences:Number(old.occurrences||0)+1,stage:clean(input.stage),test:clean(input.test||input.currentTest),message:clean(input.message||input.error).slice(0,1000),version:input.version||null,lastRunId:input.runId||null};
  db.items[fingerprint]=item;writeJson(file,db);return item;
}
export function lookupFailureMemory(dataDir,input={}){
  const db=readJson(path.join(dataDir,'intelligence','failure-memory.json'),{items:{}}),fingerprint=failureFingerprint(input);
  return db.items?.[fingerprint]||null;
}
export function recordKnownRepair(dataDir,fingerprint,repair={}){
  const file=path.join(dataDir,'intelligence','failure-memory.json'),db=readJson(file,{schema:1,items:{}}),item=db.items?.[fingerprint];
  if(!item)return null;
  item.repairs=[...(item.repairs||[]),{at:now(),version:repair.version||null,summary:clean(repair.summary).slice(0,1200),commit:repair.commit||null,files:Array.isArray(repair.files)?repair.files.slice(0,80):[]}].slice(-12);
  writeJson(file,db);return item;
}

export function workflowTimeline(state={}){
  const run=state.run||{},wf=state.workflow||{},dep=state.deployment||{},chat=state.chatgpt||{},heal=state.selfHeal||{};
  const status=(active,done=false,failed=false)=>failed?'failed':active?'active':done?'complete':'pending';
  return [
    {id:'start',label:'Start',status:status(run.startedAt&&!run.finishedAt,!!run.startedAt),detail:run.subtitle||wf.state||'Ready'},
    {id:'test',label:'Test',status:status(run.state==='running',['passed','failed','stopped'].includes(run.state),run.state==='failed'),detail:run.currentTest||run.state||'Idle'},
    {id:'diagnostic',label:'Evidence',status:status(wf.state==='handoff-error'||heal.state==='queued',!!wf.diagnostic||!!heal.diagnostic),detail:wf.diagnostic?.name||heal.diagnostic||'Waiting'},
    {id:'chatgpt',label:'ChatGPT',status:status(/chatgpt|handoff|implementation/.test(String(wf.state)),/downloaded|repair-applied|tests-passed/.test(String(wf.state)),chat.state==='Error'),detail:chat.detail||chat.state||'Ready'},
    {id:'repair',label:'Repair',status:status(/repair|waiting-approval/.test(String(wf.state)),!!wf.repairApplied),detail:wf.pendingRepair?.zipPath?path.basename(wf.pendingRepair.zipPath):(wf.repairApplied?'Applied':'Waiting')},
    {id:'retest',label:'Retest',status:status(run.state==='running'&&!!wf.repairApplied,run.state==='passed'&&!!wf.repairApplied,run.state==='failed'&&!!wf.repairApplied),detail:run.currentTest||'Waiting'},
    {id:'deploy',label:'Deploy',status:status(dep.state==='Waiting',/deployed|ready|passed/i.test(String(dep.state)),/fail|error/i.test(String(dep.state))),detail:dep.state||'Idle'},
    {id:'verify',label:'Verify',status:status(heal.state==='soaking',heal.state==='complete',heal.state==='failed'),detail:heal.state==='soaking'?'Health soak':heal.state||'Waiting'}
  ];
}

export function listEvidence(dataDir,{limit=120}={}){
  const roots=['runs','handoff-diagnostics','self-heal','self-test-diagnostics','snapshots','reproductions'];
  const out=[];
  const walk=(root,dir)=>{
    let entries=[];try{entries=fs.readdirSync(dir,{withFileTypes:true})}catch{return}
    for(const entry of entries){
      const full=path.join(dir,entry.name);
      if(entry.isDirectory()){walk(root,full);continue}
      if(!entry.isFile())continue;
      const st=fs.statSync(full),ext=path.extname(entry.name).toLowerCase();
      if(st.size>30*1024*1024)continue;
      if(!isTextExt(ext)&&!['.png','.jpg','.jpeg','.zip','.trace'].includes(ext))continue;
      out.push({id:path.relative(dataDir,full).split(path.sep).join('/'),name:entry.name,type:ext.slice(1)||'file',size:st.size,modifiedAt:st.mtimeMs,root});
    }
  };
  for(const root of roots)walk(root,path.join(dataDir,root));
  return out.sort((a,b)=>b.modifiedAt-a.modifiedAt).slice(0,limit);
}
export function resolveEvidenceFile(dataDir,id){
  const root=path.resolve(dataDir),full=path.resolve(root,String(id||''));
  if(!(full===root||full.startsWith(root+path.sep)))throw new Error('Evidence path escaped Yardmaster data directory.');
  if(!fs.existsSync(full)||!fs.statSync(full).isFile())throw new Error('Evidence file is unavailable.');
  return full;
}

export function createReproductionCapsule(dataDir,{repoPath,state={},config={},version='unknown'}={}){
  const stamp=new Date().toISOString().replace(/[-:.]/g,'').replace('Z','Z'),base=ensureDir(path.join(dataDir,'reproductions')),work=ensureDir(path.join(base,'work-'+stamp+'-'+crypto.randomBytes(2).toString('hex')));
  const head=git(repoPath,['rev-parse','HEAD'],'unknown'),branch=git(repoPath,['branch','--show-current'],'unknown'),changed=git(repoPath,['status','--porcelain'],'');
  const changedFiles=detectChangedFiles(repoPath,{base:'HEAD~1',head:'HEAD'}),smartTests=smartTestSelection(changedFiles);
  const capsule={schema:1,createdAt:new Date().toISOString(),version,head,branch,node:process.version,platform:process.platform,arch:process.arch,config:{branch:config.branch,testType:config.testType,chatMode:config.chatMode,model:config.model,thinkingEffort:config.thinkingEffort},workflow:state.workflow||{},run:{...(state.run||{}),stdout:undefined,stderr:undefined,log:undefined},failureFingerprint:failureFingerprint({stage:state.workflow?.state,test:state.run?.currentTest,message:state.workflow?.error||state.run?.title,logs:state.run?.log||[]}),smartTests};
  writeJson(path.join(work,'REPRODUCTION.json'),capsule);
  writeJson(path.join(work,'SMART_TESTS.json'),smartTests);
  fs.writeFileSync(path.join(work,'README.txt'),['YARDMASTER REPRODUCTION CAPSULE','Version: '+version,'Branch: '+branch,'Commit: '+head,'Test: '+String(state.run?.currentTest||'unknown'),'Workflow: '+String(state.workflow?.state||'unknown'),'','This capsule includes recent Yardmaster evidence when available. Reproduce only in an isolated fixture. Do not modify production or the real 86 Chaos repository.'].join('\n'),'utf8');
  fs.writeFileSync(path.join(work,'git-status.txt'),changed,'utf8');
  fs.writeFileSync(path.join(work,'git-diff.patch'),git(repoPath,['diff','--binary'],'').slice(0,2_000_000),'utf8');
  fs.writeFileSync(path.join(work,'failure.log'),(state.run?.log||[]).slice(-300).join('\n'),'utf8');
  const evidenceDir=ensureDir(path.join(work,'evidence'));let evidenceBytes=0;
  for(const item of listEvidence(dataDir,{limit:80}).filter(x=>x.root!=='reproductions'&&Date.now()-Number(x.modifiedAt||0)<7*24*3600*1000)){
    if(evidenceBytes+Number(item.size||0)>15*1024*1024)continue;
    try{
      const source=resolveEvidenceFile(dataDir,item.id),name=safeName(item.root+'-'+path.basename(source));fs.copyFileSync(source,path.join(evidenceDir,name));evidenceBytes+=Number(item.size||0);
    }catch{}
    if(evidenceBytes>=15*1024*1024)break;
  }
  const out=path.join(base,'Yardmaster-Reproduction-'+stamp+'.zip');archiveDir(work,out);fs.rmSync(work,{recursive:true,force:true});return out;
}

export function smartTestSelection(changedFiles=[]){
  const files=[...new Set(changedFiles.map(String))],node=new Set(['test/static-contracts.test.mjs']),pw=new Set();
  const any=re=>files.some(f=>re.test(f));
  if(any(/^automation\/chatgpt|chatgpt/i)){node.add('test/chatgpt-selection.test.mjs');node.add('test/play-store-chatgpt-send.test.mjs');node.add('test/play-store-chatgpt-browser.test.mjs');pw.add('test/playwright/yardmaster.e2e.spec.mjs')}
  if(any(/self-heal|supervisor|update-yardmaster|install-yardmaster/i)){node.add('test/self-heal.test.mjs');node.add('test/resilience-sandbox.test.mjs');pw.add('test/playwright/full-app.e2e.spec.mjs')}
  if(any(/server\.mjs|public\/|desktop\.cjs|electron\//i)){node.add('test/operator.integration.test.mjs');pw.add('test/playwright/full-app.e2e.spec.mjs')}
  if(any(/push|remote|passkey/i)){node.add('test/push-notifications.test.mjs');pw.add('test/playwright/full-app.e2e.spec.mjs')}
  if(any(/full-self-test|windows-operator/i)){node.add('test/full-self-test.test.mjs');pw.add('test/playwright/full-app.e2e.spec.mjs')}
  if(!pw.size)pw.add('test/playwright/full-app.e2e.spec.mjs');
  return {changedFiles:files,nodeTests:[...node].sort(),playwrightTests:[...pw].sort(),mandatoryFinal:['npm run test:play-store','npm run test:playwright:full']};
}
export function detectChangedFiles(repoPath,{base='HEAD~1',head='HEAD'}={}){
  return git(repoPath,['diff','--name-only',base,head],'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
}

export function recordTestIntelligence(dataDir,record={}){
  const file=path.join(dataDir,'intelligence','test-history.json'),db=readJson(file,{schema:1,tests:{}}),key=clean(record.currentTest||record.testType||record.command||'unknown').slice(0,240)||'unknown',old=db.tests[key]||{runs:0,pass:0,fail:0,durations:[],fingerprints:{}};
  old.runs++;if(Number(record.exitCode)===0)old.pass++;else old.fail++;
  if(Number(record.elapsedMs)>=0)old.durations=[...(old.durations||[]),Number(record.elapsedMs)].slice(-50);
  if(Number(record.exitCode)!==0){const fp=failureFingerprint({stage:'test',test:key,message:record.failure||record.state});old.fingerprints[fp]=(old.fingerprints[fp]||0)+1}
  old.lastAt=record.finishedAt||now();old.lastState=record.state||null;db.tests[key]=old;writeJson(file,db);return old;
}
export function flakyTestIntelligence(dataDir){
  const db=readJson(path.join(dataDir,'intelligence','test-history.json'),{tests:{}}),rows=[];
  for(const [name,t] of Object.entries(db.tests||{})){
    const avg=(t.durations||[]).length?Math.round(t.durations.reduce((a,b)=>a+b,0)/t.durations.length):0;
    rows.push({name,runs:t.runs||0,pass:t.pass||0,fail:t.fail||0,passRate:t.runs?Number(((t.pass/t.runs)*100).toFixed(1)):0,intermittent:!!t.pass&&!!t.fail,averageMs:avg,knownFailureSignatures:Object.keys(t.fingerprints||{}).length,lastAt:t.lastAt||null});
  }
  return rows.sort((a,b)=>(b.intermittent-a.intermittent)||(b.fail-a.fail)).slice(0,80);
}

export function preflightDoctor({repoPath,config={},operatorPort=8787}={}){
  const checks=[];
  const add=(id,ok,detail,severity='error')=>checks.push({id,ok:!!ok,detail:String(detail||''),severity:ok?'ok':severity});
  const major=Number(process.versions.node.split('.')[0]);add('node',major>=22,'Node '+process.version+' (requires 22+)');
  add('repository',!!repoPath&&fs.existsSync(repoPath),'Repository '+String(repoPath||'not configured'));
  const isRepo=repoPath&&fs.existsSync(path.join(repoPath,'.git'));add('git-repository',isRepo,isRepo?'Git metadata found':'Missing .git');
  if(isRepo){const branch=git(repoPath,['branch','--show-current'],'unknown');add('branch',!!branch,'Current branch '+branch);add('production-safety',!['main','production'].includes(branch.toLowerCase()),['main','production'].includes(branch.toLowerCase())?'Production branch selected':'Non-production branch selected','warn');const dirty=git(repoPath,['status','--porcelain'],'');add('working-tree',!dirty,!dirty?'Working tree clean':'Working tree has local changes','warn')}
  add('package-lock',!!repoPath&&fs.existsSync(path.join(repoPath,'package-lock.json')),'package-lock.json '+(repoPath&&fs.existsSync(path.join(repoPath,'package-lock.json'))?'present':'missing'));
  add('playwright-config',fs.existsSync(path.join(process.cwd(),'playwright.config.mjs')),'Yardmaster Playwright config '+(fs.existsSync(path.join(process.cwd(),'playwright.config.mjs'))?'present':'missing'));
  try{const st=fs.statfsSync(repoPath||process.cwd()),free=Number(st.bavail)*Number(st.bsize);add('disk',free>2*1024**3,(free/1024**3).toFixed(1)+' GB free', 'warn')}catch{add('disk',true,'Disk free-space check unavailable','warn')}
  let npmVersion='';try{npmVersion=execFileSync(process.platform==='win32'?'npm.cmd':'npm',['--version'],{encoding:'utf8',windowsHide:true}).trim()}catch{}add('npm',!!npmVersion,npmVersion?'npm '+npmVersion:'npm unavailable');
  add('port',operatorPort>0&&operatorPort<65536,'Operator port '+operatorPort);
  add('test-policy',true,'Every implementation requires Play Store/certification and Playwright regression coverage.');
  return {ok:checks.every(c=>c.ok||c.severity==='warn'),checks,checkedAt:now()};
}

export function resourceSnapshot({activePid=null}={}){
  const mem=process.memoryUsage(),cpu=process.cpuUsage();let relatedProcesses=null;
  try{
    if(process.platform==='win32'){const raw=execFileSync('tasklist',['/FO','CSV','/NH'],{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});relatedProcesses=raw.split(/\r?\n/).filter(line=>/node\.exe|electron\.exe|msedge\.exe|powershell\.exe/i.test(line)).length}
    else{const raw=execFileSync('ps',['-eo','comm='],{encoding:'utf8'});relatedProcesses=raw.split(/\r?\n/).filter(line=>/node|electron|chrom|edge/i.test(line)).length}
  }catch{}
  let activeAlive=null;if(activePid){try{process.kill(Number(activePid),0);activeAlive=true}catch{activeAlive=false}}
  return {at:now(),pid:process.pid,activePid:activePid||null,activeAlive,rss:mem.rss,heapUsed:mem.heapUsed,heapTotal:mem.heapTotal,freeSystemMemory:os.freemem(),totalSystemMemory:os.totalmem(),loadAverage:os.loadavg(),cpuUserMicros:cpu.user,cpuSystemMicros:cpu.system,relatedProcesses,uptimeSec:process.uptime()};
}
export function assessHang(state={},resource={}){
  const run=state.run||{};if(run.state!=='running')return {state:'idle',staleMs:0,reason:'No active test process.'};
  const signal=Number(run.lastSignalAt||run.lastLogAt||run.startedAt||Date.now()),staleMs=Math.max(0,Date.now()-signal);
  const threshold=Number(run.hangThresholdMs||180000),hard=threshold*2;
  if(resource.activeAlive===false)return {state:'stalled',staleMs,reason:'The active process is no longer alive.'};
  if(staleMs>=hard)return {state:'stalled',staleMs,reason:'No progress signal for '+Math.round(staleMs/1000)+' seconds.'};
  if(staleMs>=threshold)return {state:'watch',staleMs,reason:'Progress is quiet, but Yardmaster is allowing extra time before declaring a hang.'};
  return {state:'healthy',staleMs,reason:'Recent progress signal received.'};
}

export function createRepositorySnapshot(dataDir,{repoPath,config={},version='unknown',reason='before-repair'}={}){
  const base=ensureDir(path.join(dataDir,'snapshots')),stamp=new Date().toISOString().replace(/[-:.]/g,''),work=ensureDir(path.join(base,'work-'+stamp));
  const tracked=path.join(work,'tracked-head.zip');execFileSync('git',['archive','--format=zip','-o',tracked,'HEAD'],{cwd:repoPath,windowsHide:true,stdio:'pipe'});
  fs.writeFileSync(path.join(work,'working-tree.patch'),git(repoPath,['diff','--binary'],'').slice(0,4_000_000),'utf8');
  writeJson(path.join(work,'SNAPSHOT.json'),{schema:1,createdAt:new Date().toISOString(),reason,version,commit:git(repoPath,['rev-parse','HEAD'],'unknown'),branch:git(repoPath,['branch','--show-current'],'unknown'),config});
  const out=path.join(base,'Yardmaster-Snapshot-'+stamp+'.zip');archiveDir(work,out);fs.rmSync(work,{recursive:true,force:true});return out;
}

export function listWorktrees(repoPath){
  const raw=git(repoPath,['worktree','list','--porcelain'],'');if(!raw)return [];
  return raw.split(/\n\n+/).map(block=>Object.fromEntries(block.split(/\r?\n/).map(line=>{const i=line.indexOf(' ');return i<0?[line,true]:[line.slice(0,i),line.slice(i+1)]}))).filter(x=>x.worktree).map(x=>({path:x.worktree,head:x.HEAD||null,branch:String(x.branch||'').replace(/^refs\/heads\//,'')||null,bare:!!x.bare,detached:!!x.detached}));
}
export function createWorktree(dataDir,{repoPath,branch,base='HEAD'}={}){
  if(!/^[A-Za-z0-9._\/-]+$/.test(String(branch||'')))throw new Error('Invalid worktree branch.');
  if(['main','production'].includes(String(branch).toLowerCase()))throw new Error('Yardmaster will not create an experimental worktree on a production branch.');
  const dir=path.join(ensureDir(path.join(dataDir,'worktrees')),safeName(branch));if(fs.existsSync(dir))throw new Error('Worktree folder already exists.');
  execFileSync('git',['worktree','add','-b',branch,dir,base],{cwd:repoPath,windowsHide:true,stdio:'pipe'});return {branch,path:dir,base};
}
export function removeWorktree({repoPath,worktreePath}={}){
  if(!worktreePath)throw new Error('Worktree path is required.');execFileSync('git',['worktree','remove',worktreePath,'--force'],{cwd:repoPath,windowsHide:true,stdio:'pipe'});return true;
}

export function buildManifest(root){
  const base=path.resolve(root),files=[];
  const walk=dir=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(['.git','node_modules','test-results'].includes(e.name))continue;const full=path.join(dir,e.name);if(e.isDirectory())walk(full);else if(e.isFile()){const rel=path.relative(base,full).split(path.sep).join('/'),st=fs.statSync(full);files.push({path:rel,size:st.size,sha256:fileHash(full)})}}};
  walk(base);files.sort((a,b)=>a.path.localeCompare(b.path));return {schema:1,generatedAt:new Date().toISOString(),rootHash:sha(JSON.stringify(files)),fileCount:files.length,files};
}
export function releaseProvenance({repoPath,appRoot=process.cwd(),version='unknown',state={},config={}}={}){
  const lock=path.join(appRoot,'package-lock.json'),manifest=buildManifest(appRoot);
  return {version,commit:git(repoPath,['rev-parse','HEAD'],'unknown'),branch:git(repoPath,['branch','--show-current'],'unknown'),node:process.version,platform:process.platform,packageLockSha256:fs.existsSync(lock)?fileHash(lock):null,manifestRootHash:manifest.rootHash,manifestFileCount:manifest.fileCount,lastRun:{state:state.run?.state||null,exitCode:state.run?.exitCode??null,finishedAt:state.run?.finishedAt||null},deployment:{state:state.deployment?.state||null,deployedCommit:state.deployment?.deployedCommit||null},configHash:configHash(config),generatedAt:now()};
}

export function selfHealEscalation(attempt=1,maxAttempts=5){
  const n=Math.max(1,Number(attempt)||1),levels=[
    {level:1,label:'surgical repair',instructions:'Use the smallest evidence-backed code change and exact regression tests.'},
    {level:2,label:'expanded diagnostics',instructions:'Compare the prior attempt, collect broader logs and inspect adjacent state transitions.'},
    {level:3,label:'instrumented reproduction',instructions:'Add temporary diagnostic instrumentation and reproduce in a clean isolated fixture.'},
    {level:4,label:'clean-sandbox reconstruction',instructions:'Recreate the failing workflow from a clean sandbox and compare against the last known-good behavior.'},
    {level:5,label:'safe escalation stop',instructions:'Do not broaden risk further. Preserve the checkpoint and return a complete escalation package for manual review.'}
  ],picked=levels[Math.min(levels.length,n)-1];
  return {...picked,attempt:n,maxAttempts:Number(maxAttempts)||5};
}
export function compareSelfHealAttempts(attempts=[]){
  return attempts.slice(-10).map((a,i)=>({attempt:a.attempt||i+1,version:a.version||a.candidateVersion||null,stage:a.stage||a.currentTest||null,result:a.result||a.state||null,files:a.files||[],failure:a.failure||a.error||null})); 
}

export function mobileActionCards(state={}){
  const cards=[],wf=state.workflow||{},heal=state.selfHeal||{},run=state.run||{};
  if(heal.state&&heal.state!=='idle'&&heal.state!=='complete')cards.push({id:'self-heal',title:'SELF-HEAL MODE',detail:heal.detail||heal.state,primary:heal.state==='waiting-login'?'resume-self-heal':null,primaryLabel:heal.state==='waiting-login'?'Resume after sign-in':null});
  if(wf.state==='handoff-error'||wf.state==='failed-manual')cards.push({id:'failure',title:'Repair needed',detail:wf.error||run.currentTest||'A test failed.',primary:'resume-handoff',primaryLabel:'Resume',secondary:'create-repro-capsule',secondaryLabel:'Repro capsule'});
  if(run.state==='running')cards.push({id:'run',title:run.title||'Test running',detail:run.currentTest||'Running',primary:'pause',primaryLabel:'Pause',secondary:'stop',secondaryLabel:'Stop'});
  if(!cards.length)cards.push({id:'ready',title:'Yardmaster ready',detail:'No operator action is required.'});
  return cards;
}

export function recordCostEvent(dataDir,{kind,units=1,detail=''}={}){
  const file=path.join(dataDir,'intelligence','cost-ledger.json'),db=readJson(file,{schema:1,events:[]});db.events.push({at:now(),kind:String(kind||'other'),units:Number(units)||1,detail:clean(detail).slice(0,500)});db.events=db.events.slice(-1000);writeJson(file,db);return db.events.at(-1);
}
export function costGuardSnapshot(dataDir,config={}){
  const db=readJson(path.join(dataDir,'intelligence','cost-ledger.json'),{events:[]}),since=Date.now()-30*24*3600*1000,events=(db.events||[]).filter(e=>e.at>=since),sum=kind=>events.filter(e=>e.kind===kind).reduce((a,e)=>a+Number(e.units||0),0);
  const actions=sum('github-actions-minutes'),vercel=sum('vercel-build'),deploy=sum('deployment');
  const actionLimit=Number(config.githubActionsMinuteLimit||1500),vercelLimit=Number(config.vercelBuildLimit||100);
  return {windowDays:30,githubActionsMinutes:{used:actions,limit:actionLimit,nearLimit:actions>=actionLimit*.85},vercelBuilds:{used:vercel,limit:vercelLimit,nearLimit:vercel>=vercelLimit*.85},deployments:deploy,warning:actions>=actionLimit*.85||vercel>=vercelLimit*.85};
}

export function dryRunPlan(action,{state={},config={}}={}){
  const common={dryRun:true,action,createdAt:now(),willExecute:false};
  const map={
    start:['Validate preflight','Select '+(config.testType||'delta')+' tests','Run tests in '+(config.branch||'testing'),'Capture evidence','Continue repair workflow on failure'],
    push:['Verify non-production branch','Verify clean tree','git push origin '+(config.branch||'testing'),'Record expected commit','Watch exact deployment if enabled'],
    'new-implementation':['Package current context','Open ChatGPT Work','Apply returned ZIP to isolated/local repo','Run mandatory Play Store/certification coverage','Run mandatory Playwright coverage','Push only after pass when configured'],
    'self-heal-now':['Capture checkpoint','Capture Yardmaster-only evidence','Send self-heal package','Validate dual regression contract','Run certification + Playwright + Play Store','Canary launch','Install','Health soak','Resume checkpoint'],
    'update-operator-now':['Fetch verified release manifest','Verify version and SHA','Canary/health checks','Install at safe point','Restart','Resume protected work']
  };
  return {...common,steps:map[action]||['Validate action','Execute only after explicit non-dry-run request'],currentWorkflow:state.workflow?.state||'idle'};
}

const profilesFile=dataDir=>path.join(dataDir,'intelligence','profiles.json');
export function listProfiles(dataDir){return readJson(profilesFile(dataDir),{schema:1,profiles:{}}).profiles||{}}
export function saveProfile(dataDir,name,config={}){
  const file=profilesFile(dataDir),db=readJson(file,{schema:1,profiles:{}}),key=safeName(name);db.profiles[key]={name:String(name||key),createdAt:now(),config:{branch:config.branch,testType:config.testType,chatMode:config.chatMode,model:config.model,thinkingEffort:config.thinkingEffort,repoUpdateMode:config.repoUpdateMode,autoPush:!!config.autoPush,waitForDeploy:config.waitForDeploy!==false,runAfterDeploy:config.runAfterDeploy!==false,autoHandoff:config.autoHandoff!==false,autoSelfHeal:config.autoSelfHeal!==false,dryRunMode:!!config.dryRunMode}};writeJson(file,db);return db.profiles[key];
}
export function deleteProfile(dataDir,name){const file=profilesFile(dataDir),db=readJson(file,{schema:1,profiles:{}}),key=safeName(name);delete db.profiles[key];writeJson(file,db);return true}

export function healthSnapshot({state={},config={},preflight=null,resources=null}={}){
  const push=state.pushHealth||{},remote=state.remote||{},heal=state.selfHeal||{},run=state.run||{};
  const item=(id,label,status,detail)=>({id,label,status,detail});
  return [
    item('git','Git',preflight?.checks?.find(c=>c.id==='git-repository')?.ok?'ok':'warn',preflight?.checks?.find(c=>c.id==='branch')?.detail||'Not checked'),
    item('tests','Test runner',run.state==='failed'?'warn':run.state==='running'?'working':'ok',run.currentTest||run.state||'Ready'),
    item('chatgpt','ChatGPT bridge',state.chatgpt?.state==='Error'?'warn':'ok',state.chatgpt?.detail||state.chatgpt?.state||'Ready'),
    item('remote','Remote access',remote.error?'warn':remote.active?'ok':'idle',remote.error||remote.status||'Local only'),
    item('push','Notifications',push.needsAttention?'warn':push.workingDevices?'ok':'idle',push.needsAttention?push.needsAttention+' device(s) need attention':push.workingDevices?'Working':'No verified subscription'),
    item('self-heal','Self-heal',heal.state==='failed'?'warn':['queued','chatgpt','certifying','testing','soaking'].includes(heal.state)?'working':'ok',heal.detail||heal.state||'Ready'),
    item('resources','Resources',resources&&resources.freeSystemMemory<512*1024**2?'warn':'ok',resources?Math.round(resources.freeSystemMemory/1024**2)+' MB system memory free':'Not checked'),
    item('dry-run','Automation mode',config.dryRunMode?'warn':'ok',config.dryRunMode?'Dry-run mode enabled':'Live actions enabled')
  ];
}

const auditHeadFile=dataDir=>path.join(dataDir,'audit','head.json');
export function appendAudit(dataDir,event={}){
  const dir=ensureDir(path.join(dataDir,'audit')),file=path.join(dir,'operator-audit.jsonl'),head=readJson(auditHeadFile(dataDir),{hash:'GENESIS',sequence:0}),entry={sequence:Number(head.sequence||0)+1,at:now(),type:String(event.type||'event'),action:event.action||null,source:event.source||null,detail:clean(event.detail).slice(0,2000),branch:event.branch||null,commit:event.commit||null,previousHash:head.hash||'GENESIS'};
  entry.hash=sha(JSON.stringify(entry));fs.appendFileSync(file,JSON.stringify(entry)+'\n','utf8');writeJson(auditHeadFile(dataDir),{hash:entry.hash,sequence:entry.sequence});return entry;
}
export function readAudit(dataDir,{limit=100}={}){
  const file=path.join(dataDir,'audit','operator-audit.jsonl');if(!fs.existsSync(file))return [];
  return fs.readFileSync(file,'utf8').split(/\r?\n/).filter(Boolean).slice(-limit).map(line=>{try{return JSON.parse(line)}catch{return null}}).filter(Boolean).reverse();
}

export function changesSinceLastGood({repoPath,dataDir,config={}}={}){
  const runsDir=path.join(dataDir,'runs');let runs=[];
  try{runs=fs.readdirSync(runsDir,{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>readJson(path.join(runsDir,x.name,'metadata.json'),null)).filter(Boolean).filter(x=>Number(x.exitCode)===0&&x.gitCommit).sort((a,b)=>(b.finishedAt||0)-(a.finishedAt||0))}catch{}
  const good=runs[0]||null,current=git(repoPath,['rev-parse','HEAD'],'unknown'),base=good?.gitCommit&&good.gitCommit!==current?good.gitCommit:'HEAD~1',files=git(repoPath,['diff','--name-only',base,current],'').split(/\r?\n/).filter(Boolean);
  return {lastKnownGood:good?{runId:good.id,commit:good.gitCommit,finishedAt:good.finishedAt,configHash:good.configHash||null}:null,currentCommit:current,comparedFrom:base,changedFiles:files,node:process.version,configChanged:!!good?.configHash&&good.configHash!==configHash(config),smartTests:smartTestSelection(files)};
}

export function annotateRun(dataDir,{runId='current',note='',bookmark=false,state={}}={}){
  const file=path.join(ensureDir(path.join(dataDir,'annotations')),safeName(runId)+'.json'),db=readJson(file,{schema:1,runId,items:[]});const item={id:crypto.randomUUID(),at:now(),note:clean(note).slice(0,2000),bookmark:!!bookmark,currentTest:state.run?.currentTest||null,progress:state.run?.progress??null};db.items.push(item);writeJson(file,db);return item;
}
export function runAnnotations(dataDir,runId='current'){return readJson(path.join(dataDir,'annotations',safeName(runId)+'.json'),{items:[]}).items||[]}

export function safeModeStatus(dataDir){return readJson(path.join(dataDir,'safe-mode.json'),{enabled:false,reason:null,updatedAt:null})}
export function setSafeMode(dataDir,enabled,reason='manual'){const value={enabled:!!enabled,reason:enabled?clean(reason).slice(0,500):null,updatedAt:now()};writeJson(path.join(dataDir,'safe-mode.json'),value);return value}

export async function canaryHealthCheck(appRoot,{timeoutMs=15000,onStatus=()=>{},env=process.env}={}){
  const port=41000+Math.floor(Math.random()*12000),dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster-canary-')),child=spawn(process.execPath,['server.mjs'],{cwd:appRoot,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...env,YARDMASTER_DATA_DIR:dataDir,YARDMASTER_PORT:String(port),YARDMASTER_DISABLE_UPDATE_CHECKS:'1',YARDMASTER_TEST_QUEUE_ONLY:'1',YARDMASTER_TEST_SELF_HEAL_QUEUE_ONLY:'1'}});
  let output='';child.stdout?.on('data',d=>output+=String(d));child.stderr?.on('data',d=>output+=String(d));const deadline=Date.now()+timeoutMs;onStatus('Launching candidate canary on isolated port '+port+'.');
  try{
    while(Date.now()<deadline){
      if(child.exitCode!==null)throw new Error('Canary exited before becoming healthy. '+output.slice(-1200));
      try{const r=await fetch('http://127.0.0.1:'+port+'/api/status',{signal:AbortSignal.timeout(1200)});if(r.ok){const s=await r.json();if(s.online===true){onStatus('Candidate canary responded healthy.');return {ok:true,port,version:s.version||null,firebaseMode:s.config?.firebaseMode||null}}} }catch{}
      await new Promise(r=>setTimeout(r,250));
    }
    throw new Error('Candidate canary did not become healthy within '+timeoutMs+' ms. '+output.slice(-1200));
  }finally{try{child.kill('SIGKILL')}catch{}fs.rmSync(dataDir,{recursive:true,force:true})}
}
