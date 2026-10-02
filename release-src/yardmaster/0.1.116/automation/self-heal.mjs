import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {canaryHealthCheck,selfHealEscalation} from './ops-intelligence.mjs';

export const SELF_HEAL_REQUIRED_TESTS=['test:self-heal','test:playwright','test:play-store'];
export const SELF_HEAL_MAX_ATTEMPTS=5;
const ALLOWED_RELEASE_HOSTS=new Set(['86chaos.com','www.86chaos.com']);

const readJson=(file,fallback=null)=>{try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch{return fallback}};
const writeJson=(file,value)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2),'utf8')};
const versionParts=value=>String(value||'0').split('.').map(x=>Number.parseInt(x,10)||0);
export function versionGreater(candidate,current){
  const a=versionParts(candidate),b=versionParts(current);
  for(let i=0;i<Math.max(a.length,b.length);i++){if((a[i]||0)!==(b[i]||0))return (a[i]||0)>(b[i]||0)}
  return false;
}
export function safeReleaseManifestUrl(value){
  const url=new URL(String(value||'https://www.86chaos.com/yardmaster/release.json'));
  if(url.protocol!=='https:'||!ALLOWED_RELEASE_HOSTS.has(url.hostname)||url.pathname!=='/yardmaster/release.json')throw new Error('Self-heal release manifest must be https://86chaos.com/yardmaster/release.json.');
  return url.toString();
}
export function captureWorkflowCheckpoint({state={},config={},version='0.0.0'}={}){
  const workflow=JSON.parse(JSON.stringify(state.workflow||{})),run=JSON.parse(JSON.stringify(state.run||{})),deployment=JSON.parse(JSON.stringify(state.deployment||{})),chatgpt=JSON.parse(JSON.stringify(state.chatgpt||{}));
  let resume={kind:'none'};
  if(['chatgpt','handoff-error','waiting-login','failed-manual'].includes(String(workflow.state||'')))resume={kind:'resume-handoff'};
  else if(run.state==='running'||workflow.state==='testing')resume={kind:'resume-test',testType:String(config.testType||'delta'),closedLoop:!!workflow.closedLoop};
  else if(deployment.state==='Waiting'&&deployment.expectedCommit)resume={kind:'watch-deployment',expectedCommit:String(deployment.expectedCommit)};
  else if(workflow.state==='waiting-approval')resume={kind:'restore-only'};
  return {
    schema:1,createdAt:new Date().toISOString(),version,
    config:{firebaseMode:config.firebaseMode,firebaseLivePhase:config.firebaseLivePhase,branch:config.branch,testType:config.testType,chatMode:config.chatMode,model:config.model,thinkingEffort:config.thinkingEffort,repoUpdateMode:config.repoUpdateMode,autoPush:!!config.autoPush,waitForDeploy:config.waitForDeploy!==false,runAfterDeploy:config.runAfterDeploy!==false},
    workflow,run:{...run,stdout:Array.isArray(run.stdout)?run.stdout.slice(-300):[],stderr:Array.isArray(run.stderr)?run.stderr.slice(-300):[],log:Array.isArray(run.log)?run.log.slice(-350):[]},deployment,chatgpt,resume
  };
}
export function selfHealPrompt({currentVersion,reason,checkpoint,attempt=1,maxAttempts=5}={}){
  const escalation=selfHealEscalation(attempt,maxAttempts);
  const exactFailure=String(reason||'unknown').slice(0,2000);
  return [
    'YARDMASTER SELF-HEAL RECOVERY.',
    'The attached diagnostic ZIP is from Yardmaster itself, not from the 86 Chaos application.',
    'Diagnose the Yardmaster failure and make the smallest evidence-backed repair in geoffm1985-glitch/yardmaster.',
    'Bump the Yardmaster version for every build.',
    'Self-heal escalation level '+escalation.level+' ('+escalation.label+'): '+escalation.instructions,
    'MANDATORY REGRESSION CONTRACT: create or update BOTH Play Store/certification regression tests AND Playwright regression tests for the exact Yardmaster failure being repaired. This is required, not optional prose.',
    'The returned application root MUST include YARDMASTER_SELF_HEAL.json with regressionCoverage.exactFailure exactly equal to the Failure reason below, plus non-empty regressionCoverage.playStoreTests and regressionCoverage.playwrightTests arrays naming the exact test files added or updated for this failure.',
    'Yardmaster will reject the candidate if either regression category is missing, if exactFailure does not match, if a declared test file is absent, or if the declared coverage files were not actually added/changed relative to the running Yardmaster.',
    'Do not modify the 86 Chaos application repository, Firebase, production data, or its release-gate code.',
    'Publish the repaired Yardmaster Windows release to the 86 Chaos website Yardmaster release path, including a verified release.json and SHA-256.',
    'Return ONE COMPLETE YARDMASTER APPLICATION ZIP. Its root MUST contain YARDMASTER_SELF_HEAL.json with: schema=1, version, published=true, releaseManifestUrl=https://www.86chaos.com/yardmaster/release.json, requiredTests containing exactly the required Yardmaster test scripts, and the mandatory regressionCoverage object described above.',
    'Required local certification before Yardmaster installs itself: npm run check, npm run test:self-heal, npm run test:playwright, and npm run test:play-store.',
    'Yardmaster will download the published website package, verify its SHA-256, validate the repair contract, run those tests in an isolated staging folder, and install only if all pass. If any fail it will send the new diagnostic back for another repair attempt.',
    'Do not tell Yardmaster to skip tests or install an unverified package.',
    'Current Yardmaster version: '+String(currentVersion||'unknown')+'.',
    'Failure reason: '+exactFailure,
    'Resume intent after a successful self-heal: '+String(checkpoint?.resume?.kind||'none')+'.'
  ].join('\n');
}
const normalizeFailure=value=>String(value||'').trim().replace(/\s+/g,' ');
function validatedCoveragePaths(value,label,{playwright=false}={}){
  if(!Array.isArray(value)||!value.length)throw new Error('Self-heal regression contract is missing '+label+' coverage.');
  return [...new Set(value.map(entry=>{
    const rel=path.posix.normalize(String(entry||'').replaceAll('\\','/'));
    if(!rel||rel==='.'||rel.startsWith('../')||rel.startsWith('/')||rel.includes('/../'))throw new Error('Self-heal '+label+' coverage contains an unsafe test path.');
    if(playwright){if(!/^test\/playwright\/.+\.(?:spec|test)\.mjs$/i.test(rel))throw new Error('Self-heal Playwright coverage must name test/playwright/*.spec.mjs or *.test.mjs files.');}
    else if(!/^test\/(?!playwright\/).+\.test\.mjs$/i.test(rel))throw new Error('Self-heal Play Store coverage must name test/*.test.mjs files included by certification.');
    return rel;
  }))];
}
export function validateSelfHealPlan(plan,{currentVersion='0.0.0',expectedFailure=null}={}){
  if(!plan||Number(plan.schema)!==1)throw new Error('Self-heal package is missing a schema-1 YARDMASTER_SELF_HEAL.json.');
  if(!plan.version||!versionGreater(plan.version,currentVersion))throw new Error('Self-heal candidate version must be newer than '+currentVersion+'.');
  if(plan.published!==true)throw new Error('Self-heal candidate was not marked as published to the Yardmaster website.');
  const releaseManifestUrl=safeReleaseManifestUrl(plan.releaseManifestUrl);
  const tests=Array.isArray(plan.requiredTests)?plan.requiredTests.map(String):[];
  for(const required of SELF_HEAL_REQUIRED_TESTS)if(!tests.includes(required))throw new Error('Self-heal plan is missing required test '+required+'.');
  const unsupported=tests.filter(x=>!SELF_HEAL_REQUIRED_TESTS.includes(x));
  if(unsupported.length)throw new Error('Self-heal plan requested unsupported tests: '+unsupported.join(', ')+'.');
  const coverage=plan.regressionCoverage;if(!coverage||typeof coverage!=='object')throw new Error('Self-heal package is missing the mandatory regressionCoverage contract.');
  const exactFailure=String(coverage.exactFailure||'').trim();if(!exactFailure)throw new Error('Self-heal regressionCoverage.exactFailure is required.');
  if(expectedFailure!==null&&normalizeFailure(exactFailure)!==normalizeFailure(expectedFailure))throw new Error('Self-heal regression coverage does not target the exact detected failure.');
  const playStoreTests=validatedCoveragePaths(coverage.playStoreTests,'Play Store/certification');
  const playwrightTests=validatedCoveragePaths(coverage.playwrightTests,'Playwright',{playwright:true});
  return {...plan,releaseManifestUrl,requiredTests:[...SELF_HEAL_REQUIRED_TESTS],regressionCoverage:{exactFailure,playStoreTests,playwrightTests}};
}
export function validateRegressionCoverageFiles(appRoot,coverage,{currentAppRoot=null}={}){
  const candidateRoot=path.resolve(appRoot),currentRoot=currentAppRoot?path.resolve(currentAppRoot):null;
  const verifyCategory=(items,label)=>{
    let changed=false;
    for(const rel of items){
      const file=path.resolve(candidateRoot,rel);if(!(file===candidateRoot||file.startsWith(candidateRoot+path.sep))||!fs.existsSync(file)||!fs.statSync(file).isFile())throw new Error('Self-heal '+label+' regression file is missing: '+rel+'.');
      if(currentRoot){const old=path.resolve(currentRoot,rel);if(!(old===currentRoot||old.startsWith(currentRoot+path.sep)))throw new Error('Self-heal '+label+' regression path escaped the current app root.');if(!fs.existsSync(old)||sha256File(file)!==sha256File(old))changed=true;}
    }
    if(currentRoot&&!changed)throw new Error('Self-heal '+label+' regression coverage was declared but none of its test files were added or updated.');
  };
  verifyCategory(coverage.playStoreTests,'Play Store/certification');verifyCategory(coverage.playwrightTests,'Playwright');return true;
}
function extractZip(zipPath,destination){
  fs.rmSync(destination,{recursive:true,force:true});fs.mkdirSync(destination,{recursive:true});
  if(process.platform==='win32')execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command',`Expand-Archive -LiteralPath '${String(zipPath).replaceAll("'","''")}' -DestinationPath '${String(destination).replaceAll("'","''")}' -Force`],{windowsHide:true,stdio:'pipe',maxBuffer:20*1024*1024});
  else execFileSync('unzip',['-q',zipPath,'-d',destination],{stdio:'pipe'});
}
function findAppRoot(root){
  const queue=[root];
  while(queue.length){
    const dir=queue.shift(),pkg=path.join(dir,'package.json');
    if(fs.existsSync(pkg)){const p=readJson(pkg,null);if(p?.name==='yardmaster'&&p?.scripts?.['test:play-store'])return dir}
    let entries=[];try{entries=fs.readdirSync(dir,{withFileTypes:true})}catch{}
    for(const e of entries)if(e.isDirectory()&&!['node_modules','.git'].includes(e.name))queue.push(path.join(dir,e.name));
  }
  return null;
}
export function inspectSelfHealArchive(zipPath,{currentVersion='0.0.0',expectedFailure=null,currentAppRoot=null,tempRoot=os.tmpdir()}={}){
  const dir=fs.mkdtempSync(path.join(tempRoot,'yardmaster-self-heal-plan-'));
  try{
    extractZip(zipPath,dir);const appRoot=findAppRoot(dir);if(!appRoot)throw new Error('Self-heal ZIP does not contain a complete Yardmaster application.');
    const planPath=path.join(appRoot,'YARDMASTER_SELF_HEAL.json');if(!fs.existsSync(planPath))throw new Error('Self-heal ZIP is missing YARDMASTER_SELF_HEAL.json.');
    const valid=validateSelfHealPlan(readJson(planPath,null),{currentVersion,expectedFailure});validateRegressionCoverageFiles(appRoot,valid.regressionCoverage,{currentAppRoot});return valid;
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
}
async function download(url,file){
  const response=await fetch(url,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(120000)});
  if(!response.ok)throw new Error('Self-heal download failed with HTTP '+response.status+'.');
  const bytes=Buffer.from(await response.arrayBuffer());fs.writeFileSync(file,bytes);return bytes.length;
}
export function sha256File(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}
function npmCommand(){return process.platform==='win32'?'npm.cmd':'npm'}
export function runSelfHealProcess(command,args,{cwd,env=process.env,onLine=()=>{},timeoutMs=60*60*1000}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd,windowsHide:true,shell:process.platform==='win32'&&/\.cmd$/i.test(command),env:{...env,YARDMASTER_DISABLE_UPDATE_CHECKS:'1'}});
    let stdout='',stderr='',settled=false;
    const push=(chunk,stream)=>{const text=String(chunk);if(stream==='stdout')stdout+=text;else stderr+=text;for(const line of text.split(/\r?\n/))if(line.trim())onLine(line,stream)};
    child.stdout?.on('data',d=>push(d,'stdout'));child.stderr?.on('data',d=>push(d,'stderr'));
    child.on('error',reject);
    const timer=setTimeout(()=>{if(settled)return;settled=true;try{child.kill('SIGKILL')}catch{}reject(new Error(command+' '+args.join(' ')+' timed out.'))},timeoutMs);
    child.on('close',code=>{if(settled)return;settled=true;clearTimeout(timer);resolve({code:Number(code??1),stdout:stdout.slice(-200000),stderr:stderr.slice(-200000)})});
  });
}
export async function fetchAndCertifyPublishedSelfHeal(plan,{currentVersion='0.0.0',expectedFailure=null,currentAppRoot=null,workRoot,testEnvironment=process.env,onStatus=()=>{},onLine=()=>{}}={}){
  const valid=validateSelfHealPlan(plan,{currentVersion,expectedFailure});
  const root=workRoot||fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster-self-heal-cert-'));fs.mkdirSync(root,{recursive:true});
  onStatus('Fetching the published Yardmaster release manifest.');
  const manifestResponse=await fetch(valid.releaseManifestUrl,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});
  if(!manifestResponse.ok)throw new Error('Published Yardmaster release manifest returned HTTP '+manifestResponse.status+'.');
  const manifest=await manifestResponse.json();
  if(manifest?.verified!==true||String(manifest.version)!==String(valid.version)||!manifest.downloadUrl||!manifest.sha256)throw new Error('Published Yardmaster release manifest does not match the self-heal candidate.');
  const packageUrl=new URL(String(manifest.downloadUrl),valid.releaseManifestUrl).toString();
  const parsed=new URL(packageUrl);if(parsed.protocol!=='https:'||!ALLOWED_RELEASE_HOSTS.has(parsed.hostname))throw new Error('Published Yardmaster package URL is not on 86chaos.com.');
  const archive=path.join(root,'Yardmaster-Windows-'+valid.version+'.zip');
  onStatus('Downloading the published Yardmaster '+valid.version+' package.');await download(packageUrl,archive);
  const actual=sha256File(archive);if(actual.toLowerCase()!==String(manifest.sha256).toLowerCase())throw new Error('Published Yardmaster package SHA-256 does not match release.json.');
  const extracted=path.join(root,'candidate');extractZip(archive,extracted);const appRoot=findAppRoot(extracted);if(!appRoot)throw new Error('Published Yardmaster package is incomplete.');
  const packagePlanPath=path.join(appRoot,'YARDMASTER_SELF_HEAL.json');if(!fs.existsSync(packagePlanPath))throw new Error('Published package is missing YARDMASTER_SELF_HEAL.json.');
  const packagePlan=validateSelfHealPlan(readJson(packagePlanPath,null),{currentVersion,expectedFailure});if(String(packagePlan.version)!==String(valid.version))throw new Error('Published package self-heal plan does not match the approved candidate version.');validateRegressionCoverageFiles(appRoot,packagePlan.regressionCoverage,{currentAppRoot});
  const pkg=readJson(path.join(appRoot,'package.json'),{});if(String(pkg.version)!==String(valid.version))throw new Error('Published package version does not match self-heal plan.');
  const scripts=pkg.scripts||{};for(const testName of SELF_HEAL_REQUIRED_TESTS)if(!scripts[testName])throw new Error('Published package is missing npm script '+testName+'.');
  onStatus('Installing isolated self-heal test dependencies.');let result=await runSelfHealProcess(npmCommand(),['ci','--no-audit','--no-fund'],{cwd:appRoot,onLine,timeoutMs:20*60*1000});if(result.code!==0)throw Object.assign(new Error('Self-heal dependency install failed.'),{testResult:{stage:'npm-ci',...result}});
  const commands=[['check'],...SELF_HEAL_REQUIRED_TESTS.map(name=>['run',name])];
  for(const args of commands){
    const label='npm '+args.join(' ');onStatus('Self-heal certification: '+label+'.');
    result=await runSelfHealProcess(npmCommand(),args,{cwd:appRoot,env:testEnvironment,onLine,timeoutMs:args.includes('test:play-store')?4*60*60*1000:90*60*1000});
    if(result.code!==0)throw Object.assign(new Error('Self-heal certification failed: '+label+'.'),{testResult:{stage:label,...result}});
  }
  onStatus('Starting isolated canary launch before installation.');const canary=await canaryHealthCheck(appRoot,{onStatus,env:testEnvironment});
  return {archive,appRoot,manifest,version:valid.version,sha256:actual,tests:['check',...SELF_HEAL_REQUIRED_TESTS,'canary'],canary};
}
export function createSelfHealFailureBundle(dataDir,{reason,attempt,checkpoint,testResult,sourceDiagnostic}={}){
  const root=path.join(dataDir,'self-heal','attempts'),dir=path.join(root,'attempt-'+String(attempt||1)+'-'+Date.now());fs.mkdirSync(dir,{recursive:true});
  writeJson(path.join(dir,'SELF_HEAL_FAILURE.json'),{schema:1,reason:String(reason||'unknown'),attempt:Number(attempt||1),checkpoint,testResult,sourceDiagnostic:path.basename(String(sourceDiagnostic||'')),createdAt:new Date().toISOString()});
  fs.writeFileSync(path.join(dir,'TEST_OUTPUT.txt'),String(testResult?.stdout||'')+'\n\nSTDERR\n'+String(testResult?.stderr||''),'utf8');
  if(sourceDiagnostic&&fs.existsSync(sourceDiagnostic)&&fs.statSync(sourceDiagnostic).isFile())fs.copyFileSync(sourceDiagnostic,path.join(dir,'SOURCE_DIAGNOSTIC'+path.extname(sourceDiagnostic)));
  const out=path.join(root,'Yardmaster-Self-Heal-Failure-'+Date.now()+'.zip');
  if(process.platform==='win32')execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command',`Compress-Archive -Path '${String(dir).replaceAll("'","''")}\\*' -DestinationPath '${String(out).replaceAll("'","''")}' -Force`],{windowsHide:true,stdio:'pipe'});
  else execFileSync('zip',['-q','-r',out,'.'],{cwd:dir,stdio:'pipe'});
  return out;
}
export function readSelfHealRequest(dataDir){return readJson(path.join(dataDir,'self-heal-request.json'),null)}
export function clearSelfHealRequest(dataDir){try{fs.rmSync(path.join(dataDir,'self-heal-request.json'),{force:true})}catch{}}
export function writeSelfHealRequest(dataDir,request){writeJson(path.join(dataDir,'self-heal-request.json'),request)}
