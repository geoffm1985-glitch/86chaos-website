import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const operatorPort=18000+Math.floor(Math.random()*20000);
const base='http://127.0.0.1:'+operatorPort;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function poll(fn,{timeout=12000,interval=120}={}){
  const end=Date.now()+timeout;let lastError;
  while(Date.now()<end){
    try{const value=await fn();if(value)return value}catch(error){lastError=error}
    await wait(interval);
  }
  throw lastError||new Error('Timed out waiting for Yardmaster resilience fixture.');
}
async function request(pathname,{method='GET',body,token,remote=false}={}){
  const headers={'Content-Type':'application/json'};
  if(token)headers.Authorization='Bearer '+token;
  if(remote){headers['X-Forwarded-For']='203.0.113.9';headers.Host='fixture.trycloudflare.com';headers.Origin='https://www.86chaos.com'}
  return fetch(base+pathname,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
}
function startOperator(env){
  const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',d=>output+=String(d));child.stderr.on('data',d=>output+=String(d));child.output=()=>output;return child;
}
async function stopOperator(child){
  try{await request('/api/action',{method:'POST',body:{action:'shutdown-operator'}})}catch{}
  await poll(()=>child.exitCode!==null,{timeout:5000}).catch(()=>{});
  if(child.exitCode===null)child.kill('SIGKILL');
}

test('resilience sandbox covers status, push verification, queued remote update, and resumable handoff errors',async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster-resilience-'));
  const dataDir=path.join(temp,'data'),repo=path.join(temp,'86chaos');
  fs.mkdirSync(dataDir,{recursive:true});fs.mkdirSync(repo,{recursive:true});
  fs.writeFileSync(path.join(repo,'package.json'),JSON.stringify({
    name:'fixture',version:'1.0.0',
    scripts:{
      'test:play-store:delta':"node -e \"setTimeout(()=>{console.log('tests 1');console.log('pass 1')},1800)\"",
      'test:current-release-targeted':"node -e \"console.log('tests 1');console.log('pass 1')\"",
      'test:play-store':"node -e \"console.log('tests 1');console.log('pass 1')\""
    }
  }));
  execFileSync('git',['init','-b','testing'],{cwd:repo,stdio:'ignore'});
  execFileSync('git',['config','user.email','fixture@example.invalid'],{cwd:repo});
  execFileSync('git',['config','user.name','Fixture'],{cwd:repo});
  execFileSync('git',['add','package.json'],{cwd:repo});
  execFileSync('git',['commit','-m','fixture'],{cwd:repo,stdio:'ignore'});

  fs.writeFileSync(path.join(dataDir,'config.json'),JSON.stringify({
    repositoryPath:repo,branch:'testing',testType:'delta',autoUpdateOperator:false,autoHandoff:false,automationDefaultsVersion:4
  }));
  fs.writeFileSync(path.join(dataDir,'devices.json'),JSON.stringify({
    phone1:{id:'phone1',name:'Sandbox phone',createdAt:Date.now(),lastSeenAt:Date.now(),credential:{id:'fixture',publicKey:'AA==',counter:0,transports:[]}}
  }));
  const bearer='resilience-session',hash=crypto.createHash('sha256').update(bearer).digest('hex');
  fs.writeFileSync(path.join(dataDir,'sessions.json'),JSON.stringify({[hash]:{deviceId:'phone1',expiresAt:Date.now()+3600000}}));

  const env={
    YARDMASTER_PORT:String(operatorPort),
    YARDMASTER_DATA_DIR:dataDir,
    YARDMASTER_REPOSITORY_PATH:repo,
    YARDMASTER_DISABLE_UPDATE_CHECKS:'1',
    YARDMASTER_TEST_PUSH_STUB:'1',
    YARDMASTER_TEST_UPDATE_STUB:'1',
    YARDMASTER_TEST_HANDOFF_STUB:'1',
    YARDMASTER_TEST_UPDATE_MANIFEST:JSON.stringify({
      product:'Yardmaster',version:'0.1.99',verified:true,
      downloadUrl:'/yardmaster/releases/Yardmaster-Windows-0.1.99.zip',
      sha256:'f'.repeat(64)
    })
  };

  let operator=startOperator(env);
  try{
    let status=await poll(async()=>{const response=await request('/api/status');return response.ok?response.json():null});
    assert.equal(status.version,'0.1.88');
    assert.equal(status.operatorStatus.phase,'idle');
    assert.match(status.operatorStatus.doing,/ready/i);

    const subscription={endpoint:'https://push.example.invalid/subscription',keys:{p256dh:'fixture-p256dh',auth:'fixture-auth'}};
    const push=await request('/api/push/subscribe',{method:'POST',remote:true,token:bearer,body:{subscription,test:true}});
    const pushBody=await push.text();
    assert.equal(push.status,200,pushBody);
    assert.equal(JSON.parse(pushBody).testDelivered,true);
    status=await (await request('/api/status',{remote:true,token:bearer})).json();
    assert.equal(status.currentDevice.hasPush,true);
    assert.equal(status.currentDevice.pushStatus,'working');
    assert.equal(status.pushHealth.workingDevices,1);

    const started=await request('/api/action',{method:'POST',remote:true,token:bearer,body:{action:'start'}});
    assert.equal(started.status,200,await started.text());
    await poll(async()=>{const s=await (await request('/api/status',{remote:true,token:bearer})).json();return s.run.state==='running'?s:null});

    const update=await request('/api/action',{method:'POST',remote:true,token:bearer,body:{action:'update-operator-now'}});
    const updateBody=await update.text();
    assert.equal(update.status,200,updateBody);
    assert.equal(JSON.parse(updateBody).queued,true);
    status=await (await request('/api/status',{remote:true,token:bearer})).json();
    assert.equal(status.operatorStatus.phase,'update-queued');
    assert.match(status.operatorStatus.waitingOn,/current test/i);

    await poll(()=>fs.existsSync(path.join(dataDir,'update-resume.json')),{timeout:10000});
    const marker=JSON.parse(fs.readFileSync(path.join(dataDir,'update-resume.json'),'utf8'));
    assert.equal(marker.to,'0.1.99');
    assert.equal(marker.resumeAfterUpdate.kind,'continue-after-run');
    assert.equal(marker.resumeAfterUpdate.code,0);

    await stopOperator(operator);
    fs.rmSync(path.join(dataDir,'update-resume.json'),{force:true});
    const saved=JSON.parse(fs.readFileSync(path.join(dataDir,'state.json'),'utf8'));
    saved.workflow={
      state:'handoff-error',repairAttempts:1,handoffPath:null,
      error:'ChatGPT did not confirm the Yardmaster ZIP attachment after trusted file selection.',
      diagnostic:{name:'Yardmaster-Handoff-Diagnostic-sandbox.zip'}
    };
    saved.run={...(saved.run||{}),state:'failed',title:'Tests Failed',currentTest:'Stopped on failure',progress:100,log:['fixture failure']};
    fs.writeFileSync(path.join(dataDir,'state.json'),JSON.stringify(saved,null,2));

    operator=startOperator(env);
    status=await poll(async()=>{
      const response=await request('/api/status',{remote:true,token:bearer});if(!response.ok)return null;
      const s=await response.json();return s.workflow?.state==='handoff-error'?s:null;
    });
    assert.equal(status.operatorStatus.canResume,true);
    assert.equal(status.operatorStatus.resumeAction,'resume-handoff');
    assert.match(status.operatorStatus.nextAction,/existing failed-test ZIP/i);

    const resume=await request('/api/action',{method:'POST',remote:true,token:bearer,body:{action:'resume-handoff'}});
    assert.equal(resume.status,200,await resume.text());
    status=await poll(async()=>{const s=await (await request('/api/status',{remote:true,token:bearer})).json();return s.workflow?.state==='chatgpt-stubbed'?s:null});
    assert.equal(status.workflow.repairAttempts,2);
  }finally{
    await stopOperator(operator);
    fs.rmSync(temp,{recursive:true,force:true});
  }
});
