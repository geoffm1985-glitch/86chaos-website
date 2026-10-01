import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const projectRoot=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const operatorPort=18000+Math.floor(Math.random()*20000);
const baseUrl='http://127.0.0.1:'+operatorPort;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function poll(fn,{timeout=15000,interval=150}={}){
  const deadline=Date.now()+timeout;let lastError;
  while(Date.now()<deadline){
    try{const value=await fn();if(value)return value}catch(error){lastError=error}
    await wait(interval);
  }
  throw lastError||new Error('Timed out waiting for Yardmaster state.');
}
async function request(pathname,{method='GET',body,token,remote=false}={}){
  const headers={'Content-Type':'application/json'};
  if(token)headers.Authorization='Bearer '+token;
  if(remote){headers['X-Forwarded-For']='203.0.113.25';headers.Host='fixture.trycloudflare.com';headers.Origin='https://www.86chaos.com'}
  return fetch(baseUrl+pathname,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
}
async function stopOperator(child){
  try{await request('/api/action',{method:'POST',body:{action:'shutdown-operator'}})}catch{}
  await poll(()=>child.exitCode!==null,{timeout:6000}).catch(()=>{});
  if(child.exitCode===null)child.kill('SIGKILL');
}
function startOperator(env){
  const child=spawn(process.execPath,['server.mjs'],{cwd:projectRoot,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',chunk=>{output+=chunk});child.stderr.on('data',chunk=>{output+=chunk});
  child.output=()=>output;return child;
}
function processStopped(pid){
  try{process.kill(pid,0)}catch{return true}
  if(process.platform==='linux'){
    try{
      const stat=fs.readFileSync('/proc/'+pid+'/stat','utf8'),close=stat.lastIndexOf(')'),state=stat.slice(close+2).split(' ')[0];
      if(state==='Z')return true;
    }catch{return true}
  }
  return false;
}

test('PC operator and authenticated mobile remote survive restart and enforce controls',async()=>{
  const liveCloudflared=process.env.YARDMASTER_LIVE_CLOUDFLARED||'';
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster-targeted-'));
  const dataDir=path.join(temp,'data'),repo=path.join(temp,'86chaos');
  fs.mkdirSync(dataDir,{recursive:true});fs.mkdirSync(repo,{recursive:true});
  fs.writeFileSync(path.join(repo,'package.json'),JSON.stringify({
    name:'fixture-86chaos',version:'1.0.0',scripts:{
      'test:play-store:delta':'node -e "console.log(\'tests 1\');console.log(\'pass 1\')"',
      'test:current-release-targeted':'node -e "console.log(\'tests 1\');console.log(\'pass 1\')"',
      'test:play-store':'node -e "console.log(\'tests 1\');console.log(\'pass 1\')"'
    }
  }));
  execFileSync('git',['init','-b','testing'],{cwd:repo,stdio:'ignore'});
  execFileSync('git',['config','user.email','yardmaster-test@example.invalid'],{cwd:repo,stdio:'ignore'});
  execFileSync('git',['config','user.name','Yardmaster Test'],{cwd:repo,stdio:'ignore'});
  execFileSync('git',['add','package.json'],{cwd:repo,stdio:'ignore'});
  execFileSync('git',['commit','-m','fixture baseline'],{cwd:repo,stdio:'ignore'});
  fs.writeFileSync(path.join(dataDir,'config.json'),JSON.stringify({
    repositoryPath:repo,branch:'testing',repoUpdateMode:'ask',automationDefaultsVersion:1,
    autoUpdateOperator:false,autoHandoff:false,autoPush:false,maxRepairAttempts:25
  }));
  fs.writeFileSync(path.join(dataDir,'devices.json'),JSON.stringify({
    phone1:{id:'phone1',name:'Fixture phone',createdAt:Date.now(),lastSeenAt:Date.now(),credential:{id:'fixture',publicKey:'AA==',counter:0,transports:[]}}
  }));
  const bearer='fixture-mobile-session';
  const hash=crypto.createHash('sha256').update(bearer).digest('hex');
  fs.writeFileSync(path.join(dataDir,'sessions.json'),JSON.stringify({[hash]:{deviceId:'phone1',expiresAt:Date.now()+3600000}}));
  const fakeCloudflared=path.join(temp,'fake-cloudflared.mjs');
  if(!liveCloudflared)fs.writeFileSync(fakeCloudflared,`if(process.argv.includes('--version')){console.log('cloudflared fixture 1.0');process.exit(0)}console.error('INF https://fixture-yardmaster.trycloudflare.com');setInterval(()=>{},1000)`);

  const env={YARDMASTER_PORT:String(operatorPort),YARDMASTER_DATA_DIR:dataDir,YARDMASTER_REPOSITORY_PATH:repo,YARDMASTER_DISABLE_UPDATE_CHECKS:'1',YARDMASTER_TEST_QUEUE_ONLY:'1',YARDMASTER_TEST_HANDOFF_STUB:'1',YARDMASTER_TEST_FULL_SELF_TEST_STUB:'1',YARDMASTER_TEST_POWERSHELL_PASTE_STUB:'1',YARDMASTER_TEST_SELF_HEAL_QUEUE_ONLY:'1',YARDMASTER_CLOUDFLARED_PATH:liveCloudflared||process.execPath};
  if(!liveCloudflared)env.YARDMASTER_CLOUDFLARED_SCRIPT=fakeCloudflared;
  let operator=startOperator(env);
  try{
    let status=await poll(async()=>{const response=await request('/api/status');return response.ok?response.json():null});
    assert.equal(status.version,'0.1.100');
    assert.equal(status.config.repoUpdateMode,'automatic','old Ask Me default migrates to Automatic');
    assert.equal(status.config.automationDefaultsVersion,7);
    assert.equal(status.config.autoSelfHeal,true,'old installs migrate to automatic Yardmaster self-heal');
    assert.equal(status.config.maxSelfHealAttempts,5);
    assert.equal(status.config.autoHandoff,true,'failed runs must automatically start a repair handoff by default');
    assert.equal(status.config.maxRepairAttempts,25);
    assert.equal(status.remote.status,'local');

    const dashboard=await (await request('/')).text();
    assert.match(dashboard,/New 86 Chaos Work/i);
    assert.match(dashboard,/Start Remote Access/i);
    assert.match(dashboard,/Test Full Yardmaster Process/i);
    assert.match(dashboard,/Adopt Running Play Store Test/i);
    assert.match(dashboard,/Self-heal Yardmaster automatically/i);
    assert.match(dashboard,/Run Self-Heal Diagnostic/i);

    const selfHealStart=await request('/api/action',{method:'POST',body:{action:'self-heal-now',reason:'operator integration fixture'}});
    assert.equal(selfHealStart.status,200,await selfHealStart.text());
    status=await (await request('/api/status')).json();
    assert.equal(status.selfHeal.state,'queued');
    assert.match(status.selfHeal.detail,/queued a self-heal/i);
    assert.equal(fs.existsSync(path.join(dataDir,'self-heal-request.json')),true);
    fs.rmSync(path.join(dataDir,'self-heal-request.json'),{force:true});
    status.selfHeal={...status.selfHeal,state:'idle'};

    const selfTestStart=await request('/api/action',{method:'POST',body:{action:'full-self-test'}});
    assert.equal(selfTestStart.status,200,await selfTestStart.text());
    status=await poll(async()=>{const s=await (await request('/api/status')).json();return s.selfTest?.state==='passed'?s:null},{timeout:5000});
    assert.equal(status.selfTest.stage,'complete');
    assert.equal(status.selfTest.steps.chatgptPowerShellRoundTrip,'pass');
    assert.equal(status.selfTest.steps.manualGateAdoption,'pass');
    assert.equal(status.selfTest.steps.postDeployAdoption,'pass');
    assert.equal(status.config.repositoryPath,repo,'isolated self-test must not replace the configured 86 Chaos repository');

    if(process.platform==='win32'){
      const pastedMarker=path.join(repo,'pasted-command.txt');
      const psProtocol=['YARDMASTER','POWERSHELL',`Set-Content -LiteralPath '${pastedMarker.replaceAll("'","''")}' -Value "PASTED-FROM-CHATGPT"`,'END_POWERSHELL','END'].join('\n');
      const psResponse=await request('/api/command',{method:'POST',body:{text:psProtocol}});
      assert.equal(psResponse.status,200,await psResponse.text());
      assert.match(fs.readFileSync(pastedMarker,'utf8'),/PASTED-FROM-CHATGPT/);
      fs.rmSync(pastedMarker,{force:true});

      const resultsRoot=path.join(repo,'test-results','86chaos-play-store-release-gate'),runId='manual-fixture-'+Date.now(),runDir=path.join(resultsRoot,runId),runnerStatePath=path.join(runDir,'runner-state.json');
      fs.mkdirSync(path.join(runDir,'runner-logs'),{recursive:true});
      const manualChild=spawn(process.execPath,['-e','setTimeout(()=>{},10000)'],{stdio:'ignore'});
      fs.writeFileSync(path.join(resultsRoot,'.current-run.lock'),JSON.stringify({runId,pid:manualChild.pid,startedAt:new Date().toISOString(),runDir}));
      fs.writeFileSync(path.join(resultsRoot,'.last-run.json'),JSON.stringify({runId,runDir,mode:'failed+new',updatedAt:new Date().toISOString()}));
      fs.writeFileSync(runnerStatePath,JSON.stringify({runId,currentPhase:'playwright',status:'running',playwrightStarted:true,playwrightCompleted:false,finalExitCode:null}));
      fs.writeFileSync(path.join(runDir,'runner-logs','manual.log'),'tests 1\nfail 1\n');
      let adoptStatus=await request('/api/action',{method:'POST',body:{action:'adopt-running-test'}});
      assert.equal(adoptStatus.status,200,await adoptStatus.text());
      fs.writeFileSync(runnerStatePath,JSON.stringify({runId,currentPhase:'report-collection',status:'failed',playwrightStarted:true,playwrightCompleted:true,finalExitCode:1,blockingReason:'fixture failure'}));
      try{execFileSync('taskkill.exe',['/PID',String(manualChild.pid),'/T','/F'],{windowsHide:true,stdio:'ignore',timeout:5000})}catch{try{manualChild.kill()}catch{}}
      await poll(()=>processStopped(manualChild.pid),{timeout:6000,interval:100});
      status=await poll(async()=>{const x=await (await request('/api/status')).json();return x.workflow?.state==='chatgpt-stubbed'?x:null},{timeout:15000});
      assert.equal(status.run.adopted,true);
      assert.equal(status.workflow.closedLoop,true);
      assert.equal(status.config.testType,'delta');
      fs.rmSync(resultsRoot,{recursive:true,force:true});
    }

    const preflight=await fetch(baseUrl+'/api/status',{method:'OPTIONS',headers:{Origin:'https://www.86chaos.com','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'authorization','Access-Control-Request-Private-Network':'true','X-Forwarded-For':'203.0.113.25',Host:'fixture.trycloudflare.com'}});
    assert.equal(preflight.status,204);
    assert.equal(preflight.headers.get('access-control-allow-origin'),'https://www.86chaos.com');
    assert.equal(preflight.headers.get('access-control-allow-private-network'),'true');
    const health=await request('/api/remote/health',{remote:true});
    assert.equal(health.status,200,'minimal remote health must be reachable before passkey authentication');
    assert.equal((await health.json()).ok,true);
    assert.equal((await request('/api/status',{remote:true})).status,401,'forwarded requests cannot use local trust');
    const mobileStatus=await request('/api/status',{remote:true,token:bearer});
    assert.equal(mobileStatus.status,200);
    assert.equal((await mobileStatus.json()).trustedDevices[0].name,'Fixture phone');

    const invalidWork=await request('/api/action',{method:'POST',remote:true,token:bearer,body:{action:'new-implementation',taskPrompt:''}});
    assert.equal(invalidWork.status,500);
    assert.match(await invalidWork.text(),/empty/i);
    assert.equal((await request('/api/config',{method:'POST',remote:true,token:bearer,body:{branch:'main'}})).status,200);
    const productionWork=await request('/api/action',{method:'POST',remote:true,token:bearer,body:{action:'new-implementation',taskPrompt:'Change production automatically'}});
    assert.equal(productionWork.status,500);
    assert.match(await productionWork.text(),/production\/main/i);
    assert.equal((await request('/api/config',{method:'POST',remote:true,token:bearer,body:{branch:'testing'}})).status,200);

    const mobileNewWorkStarted=Date.now();
    const mobileNewWork=await request('/api/action',{method:'POST',remote:true,token:bearer,body:{action:'new-implementation',taskPrompt:'Add a mobile-requested feature with release-gate coverage',pushWhenPassed:true}});
    assert.equal(mobileNewWork.status,200);
    assert.ok(Date.now()-mobileNewWorkStarted<2000,'mobile New Work must acknowledge immediately and continue on the PC');
    assert.deepEqual(await mobileNewWork.json(),{ok:true,state:'implementation-queued',runsOn:'windows-pc'});
    status=await (await request('/api/status')).json();
    assert.equal(status.workflow.state,'implementation-queued');
    assert.equal(status.workflow.taskPrompt,'Add a mobile-requested feature with release-gate coverage');
    assert.equal(status.workflow.pushWhenPassed,true);

    const startAt=Date.now();
    const remoteStart=await request('/api/action',{method:'POST',body:{action:'remote-start'}});
    assert.equal(remoteStart.status,200);
    assert.ok(Date.now()-startAt<3000,'remote start returns immediately while tunnel connects');
    status=await poll(async()=>{const s=await (await request('/api/status')).json();return s.remote?.status==='tunnel-ready'?s:null},{timeout:liveCloudflared?45000:10000});
    if(liveCloudflared)assert.match(status.remote.url,/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/);else assert.equal(status.remote.url,'https://fixture-yardmaster.trycloudflare.com');
    const tunnelUrl=status.remote.url;
    const tunnelPid=status.remote.pid;
    assert.ok(tunnelPid>0);
    assert.match(status.remote.pairCode,/^\d{6}$/);
    const pairUrl=new URL(status.remote.pairingUrl);
    assert.equal(pairUrl.origin,'https://www.86chaos.com');
    assert.equal(pairUrl.pathname,'/yardmaster');
    assert.equal(pairUrl.searchParams.get('remote'),tunnelUrl,'QR must carry the exact Cloudflare tunnel URL directly');
    assert.equal(pairUrl.searchParams.get('code'),status.remote.pairCode,'QR must carry the active pairing code directly');
    const mobileRequest=async(pathname,{method='GET',body}={})=>{
      if(!liveCloudflared)return request(pathname,{method,body,remote:true,token:bearer});
      return fetch(tunnelUrl+pathname,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+bearer,Origin:'https://www.86chaos.com'},body:body===undefined?undefined:JSON.stringify(body)});
    };
    if(liveCloudflared){
      assert.equal((await poll(async()=>{try{const response=await fetch(tunnelUrl+'/api/remote/health',{headers:{Origin:'https://www.86chaos.com'}});return response.ok?response:null}catch{return null}},{timeout:30000})).status,200);
      assert.equal((await poll(async()=>{try{const response=await fetch(tunnelUrl+'/api/status');return response.status===401?response:null}catch{return null}},{timeout:30000})).status,401);
      assert.equal((await poll(async()=>{try{const response=await mobileRequest('/api/status');return response.ok?response:null}catch{return null}},{timeout:30000})).status,200);
    } else {
      assert.equal((await mobileRequest('/api/status')).status,200);
    }
    status=await (await request('/api/status')).json();
    assert.equal(status.remote.status,'connected','PC status becomes Phone Connected only after an authenticated remote request');
    assert.equal(status.remote.phoneConnected,true);

    const startRun=await mobileRequest('/api/action',{method:'POST',body:{action:'start'}});
    assert.equal(startRun.status,200,await startRun.text());
    await poll(async()=>{const s=await (await mobileRequest('/api/status')).json();return s.run?.state==='passed'?s:null});
    assert.equal((await mobileRequest('/api/action',{method:'POST',body:{action:'pause'}})).status,200);
    status=await (await mobileRequest('/api/status')).json();
    assert.equal(status.run.state,'paused');
    assert.equal((await mobileRequest('/api/action',{method:'POST',body:{action:'resume'}})).status,200);
    await poll(async()=>{const s=await (await mobileRequest('/api/status')).json();return s.run?.state==='passed'?s:null});
    assert.equal((await mobileRequest('/api/action',{method:'POST',body:{action:'stop'}})).status,200);

    // A failed test must automatically start the repair handoff without phone/PC intervention.
    const fixturePackagePath=path.join(repo,'package.json');
    const fixturePackage=JSON.parse(fs.readFileSync(fixturePackagePath,'utf8'));
    fixturePackage.scripts['test:play-store:delta']='node -e "console.error(\'intentional failure\');process.exit(1)"';
    fs.writeFileSync(fixturePackagePath,JSON.stringify(fixturePackage));
    const failRun=await mobileRequest('/api/action',{method:'POST',body:{action:'start'}});
    assert.equal(failRun.status,200,await failRun.text());
    status=await poll(async()=>{const s=await (await mobileRequest('/api/status')).json();return s.workflow?.state==='chatgpt-stubbed'?s:null},{timeout:10000});
    assert.equal(status.run.state,'failed');
    assert.equal(status.workflow.repairAttempts,1,'failed run should immediately start repair attempt 1');
    assert.equal(status.chatgpt.state,'Working');

    const persistentUrl=status.remote.url;
    await stopOperator(operator);
    assert.doesNotThrow(()=>process.kill(tunnelPid,0),'detached tunnel remains alive through ordinary operator restart');

    operator=startOperator(env);
    status=await poll(async()=>{const response=await mobileRequest('/api/status');if(!response.ok)return null;const s=await response.json();return s.remote?.status==='connected'?s:null},{timeout:liveCloudflared?30000:15000});
    assert.equal(status.remote.url,persistentUrl);
    assert.equal(status.remote.pid,tunnelPid);
    assert.equal(status.run.state,'idle','new operator responds after restart');

    const stopRemote=await mobileRequest('/api/action',{method:'POST',body:{action:'remote-stop'}});
    assert.equal(stopRemote.status,200);
    status=await poll(async()=>{const s=await (await request('/api/status')).json();return s.remote?.status==='local'?s:null});
    assert.equal(status.remote.active,false);
    await poll(()=>processStopped(tunnelPid),{timeout:6000});
  } finally {
    await stopOperator(operator);
    fs.rmSync(temp,{recursive:true,force:true});
  }
});
