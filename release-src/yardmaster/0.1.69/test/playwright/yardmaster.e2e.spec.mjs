import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {__testHooks} from '../../automation/chatgpt.mjs';

const projectRoot=path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const randomPort=()=>18000+Math.floor(Math.random()*20000);

async function poll(fn,{timeout=12000,interval=150}={}){
  const deadline=Date.now()+timeout;let lastError;
  while(Date.now()<deadline){
    try{const value=await fn();if(value)return value}catch(error){lastError=error}
    await wait(interval);
  }
  throw lastError||new Error('Timed out waiting for Yardmaster fixture.');
}

class HookCdp{
  constructor(session){this.session=session}
  send(method,params={},timeout=10000){
    return Promise.race([
      this.session.send(method,params),
      new Promise((_,reject)=>setTimeout(()=>reject(new Error('CDP timeout '+method)),timeout))
    ]);
  }
  async eval(expression,timeout=10000){
    const result=await this.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true},timeout);
    if(result.exceptionDetails)throw new Error(result.exceptionDetails.text||'fixture eval failed');
    return result.result?.value;
  }
  waitEvent(method,timeout=5000){
    return new Promise((resolve,reject)=>{
      const done=params=>{clearTimeout(timer);this.session.off(method,done);resolve(params||{})};
      const timer=setTimeout(()=>{this.session.off(method,done);reject(new Error('fixture event timeout '+method))},timeout);
      this.session.on(method,done);
    });
  }
}

async function withHookCdp(page,fn){
  const session=await page.context().newCDPSession(page),cdp=new HookCdp(session);
  try{return await fn(cdp)}finally{await session.detach().catch(()=>{})}
}

function writeZip(dir,name='Yardmaster-Handoff-Fixture.zip'){
  const file=path.join(dir,name);fs.writeFileSync(file,'yardmaster playwright fixture');return file;
}

const composerFixture=({showFilename=true,withRemove=false,completeSend=false}={})=>[
  '<!doctype html><meta charset="utf-8">',
  '<form id="composer-form"><textarea id="prompt-textarea"></textarea><button id="attach" type="button" aria-label="Add files and more">+</button><div id="menu" role="menu" style="display:none"><button id="upload" type="button" role="menuitem">Upload from computer</button></div><input id="real-file" type="file" hidden><span data-testid="attachment-chip" id="attachment-chip"></span>',
  withRemove?'<button id="remove-file" type="button" aria-label="Remove file" hidden>Remove</button>':'',
  completeSend?'<button data-testid="send-button" aria-label="Send" id="send" type="button" disabled>Send</button>':'',
  '</form><input id="decoy-file" type="file" hidden><div id="messages"></div>',
  '<script>',
  'const input=document.querySelector("#prompt-textarea"),attach=document.querySelector("#attach"),menu=document.querySelector("#menu"),upload=document.querySelector("#upload"),real=document.querySelector("#real-file"),chip=document.querySelector("#attachment-chip"),remove=document.querySelector("#remove-file"),send=document.querySelector("#send");',
  'let trustedEdit=false;',
  'const update=()=>{if(send)send.disabled=!(trustedEdit&&input.value.trim()&&real.files&&real.files.length===1)};',
  'attach.addEventListener("click",event=>{if(event.isTrusted)menu.style.display="block"});',
  'upload.addEventListener("click",event=>{if(event.isTrusted)real.click()});',
  showFilename?'real.addEventListener("change",()=>{chip.textContent=real.files&&real.files[0]?real.files[0].name:"";if(remove)remove.hidden=!(real.files&&real.files.length);menu.style.display="none";update()});':'real.addEventListener("change",()=>{if(remove)remove.hidden=!(real.files&&real.files.length);menu.style.display="none";update()});',
  withRemove?'remove.addEventListener("click",event=>{if(!event.isTrusted)return;real.value="";chip.textContent="";remove.hidden=true;update()});':'',
  completeSend?'input.addEventListener("input",event=>{if(event.isTrusted)trustedEdit=true;update()});send.addEventListener("click",event=>{if(!event.isTrusted||send.disabled)return;const message=document.createElement("div");message.dataset.messageAuthorRole="user";message.textContent=input.value;document.querySelector("#messages").append(message);input.value="";chip.textContent="";send.disabled=true});':'',
  '</script>'
].join('');

function createOperatorFixture({handoffError=false}={}){
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster-playwright-')),dataDir=path.join(temp,'data'),repo=path.join(temp,'86chaos'),port=randomPort();
  fs.mkdirSync(dataDir,{recursive:true});fs.mkdirSync(repo,{recursive:true});
  fs.writeFileSync(path.join(repo,'package.json'),JSON.stringify({name:'fixture-86chaos',version:'1.0.0',scripts:{'test:play-store:delta':'node -e "setTimeout(()=>{console.log(\'tests 1\');console.log(\'pass 1\')},1800)"','test:current-release-targeted':'node -e "setTimeout(()=>{console.log(\'tests 1\');console.log(\'pass 1\')},1800)"','test:play-store':'node -e "setTimeout(()=>{console.log(\'tests 1\');console.log(\'pass 1\')},1800)"'}}));
  execFileSync('git',['init','-b','testing'],{cwd:repo,stdio:'ignore'});execFileSync('git',['config','user.email','yardmaster-test@example.invalid'],{cwd:repo,stdio:'ignore'});execFileSync('git',['config','user.name','Yardmaster Test'],{cwd:repo,stdio:'ignore'});execFileSync('git',['add','package.json'],{cwd:repo,stdio:'ignore'});execFileSync('git',['commit','-m','fixture baseline'],{cwd:repo,stdio:'ignore'});
  fs.writeFileSync(path.join(dataDir,'config.json'),JSON.stringify({repositoryPath:repo,branch:'testing',testType:'targeted',repoUpdateMode:'automatic',automationDefaultsVersion:4,autoUpdateOperator:false,autoHandoff:false,autoPush:false,maxRepairAttempts:25}));
  if(handoffError)fs.writeFileSync(path.join(dataDir,'state.json'),JSON.stringify({activity:[],workflow:{state:'handoff-error',error:'fixture handoff failure',repairAttempts:1,closedLoop:true,diagnostic:{name:'fixture-diagnostic.zip',stage:'attachment'}},run:{state:'failed',title:'Tests Failed',subtitle:'fixture',progress:100,counts:{pass:0,fail:1,skip:0,timeout:0},currentTest:'fixture failure',elapsedMs:10,log:['fixture failure'],stdout:[],stderr:[],exitCode:1},chatgpt:{state:'Error'},deployment:{state:'Idle'}}));
  const env={...process.env,YARDMASTER_DATA_DIR:dataDir,YARDMASTER_REPOSITORY_PATH:repo,YARDMASTER_PORT:String(port),YARDMASTER_DISABLE_UPDATE_CHECKS:'1',YARDMASTER_TEST_QUEUE_ONLY:'1',YARDMASTER_TEST_HANDOFF_STUB:'1',YARDMASTER_TEST_FULL_SELF_TEST_STUB:'1',YARDMASTER_TEST_PUSH_STUB:'1',YARDMASTER_TEST_SELF_HEAL_QUEUE_ONLY:'1'};
  const child=spawn(process.execPath,['server.mjs'],{cwd:projectRoot,env,stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',chunk=>output+=String(chunk));child.stderr.on('data',chunk=>output+=String(chunk));
  const baseUrl='http://127.0.0.1:'+port;
  return {temp,dataDir,repo,port,baseUrl,child,output:()=>output};
}

async function readyOperator(fixture){
  await poll(async()=>{const r=await fetch(fixture.baseUrl+'/api/status');return r.ok?r:null},{timeout:12000});
}

async function stopOperator(fixture){
  try{await fetch(fixture.baseUrl+'/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'shutdown-operator'})})}catch{}
  await poll(()=>fixture.child.exitCode!==null,{timeout:4000}).catch(()=>{});
  if(fixture.child.exitCode===null)fixture.child.kill('SIGKILL');
  fs.rmSync(fixture.temp,{recursive:true,force:true});
}

test.skip(process.platform!=='win32','Yardmaster Playwright certification uses Windows and installed Microsoft Edge.');

test.describe('ChatGPT handoff fixtures',()=>{
  test('clean composer uploads one ZIP and ignores a decoy file input',async({page})=>{
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ym-pw-clean-')),upload=writeZip(temp);
    try{
      await page.setContent(composerFixture());
      await withHookCdp(page,cdp=>__testHooks.attachFile(cdp,upload,null));
      await expect(page.locator('#attachment-chip')).toHaveText(path.basename(upload));
      expect(await page.locator('#real-file').evaluate(e=>e.files?.[0]?.name||'')).toBe(path.basename(upload));
      expect(await page.locator('#decoy-file').evaluate(e=>e.files?.length||0)).toBe(0);
    }finally{fs.rmSync(temp,{recursive:true,force:true})}
  });

  test('visible stale attachment is removed before the replacement ZIP is uploaded',async({page})=>{
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ym-pw-stale-')),oldZip=writeZip(temp,'Old-Handoff.zip'),newZip=writeZip(temp,'New-Handoff.zip');
    try{
      await page.setContent(composerFixture({withRemove:true}));
      await page.locator('#real-file').setInputFiles(oldZip);
      await expect(page.locator('#attachment-chip')).toHaveText('Old-Handoff.zip');
      await withHookCdp(page,cdp=>__testHooks.attachFile(cdp,newZip,null));
      await expect(page.locator('#attachment-chip')).toHaveText('New-Handoff.zip');
      expect(await page.locator('#real-file').evaluate(e=>e.files?.length||0)).toBe(1);
    }finally{fs.rmSync(temp,{recursive:true,force:true})}
  });

  test('stale selected file input without a visible chip is cleared safely',async({page})=>{
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ym-pw-input-stale-')),oldZip=writeZip(temp,'Old-Input-Only.zip'),newZip=writeZip(temp,'Replacement.zip');
    try{
      await page.setContent(composerFixture({showFilename:false}));
      await page.locator('#real-file').setInputFiles(oldZip);
      await expect(page.locator('#attachment-chip')).toHaveText('');
      await withHookCdp(page,cdp=>__testHooks.attachFile(cdp,newZip,null));
      await expect(page.locator('#attachment-chip')).toHaveText('');
      expect(await page.locator('#real-file').evaluate(e=>e.files?.[0]?.name||'')).toBe('Replacement.zip');
    }finally{fs.rmSync(temp,{recursive:true,force:true})}
  });

  test('filename-only file-input confirmation is accepted without a visible attachment chip',async({page})=>{
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ym-pw-input-only-')),upload=writeZip(temp,'86chaos-release-gate-SLIM-UPLOAD-ME.zip');
    try{
      await page.setContent(composerFixture({showFilename:false}));
      await withHookCdp(page,cdp=>__testHooks.attachFile(cdp,upload,null));
      await expect(page.locator('#attachment-chip')).toHaveText('');
      expect(await page.locator('#real-file').evaluate(e=>e.files?.[0]?.name||'')).toBe(path.basename(upload));
    }finally{fs.rmSync(temp,{recursive:true,force:true})}
  });

  test('delayed assistant activity prevents a false handoff failure',async({page})=>{
    await page.setContent([
      '<!doctype html><meta charset="utf-8">',
      '<form><textarea id="prompt-textarea"></textarea><button data-testid="send-button" aria-label="Send" id="send" type="button" disabled>Send</button></form><div id="messages"></div>',
      '<script>',
      'const input=document.querySelector("#prompt-textarea"),send=document.querySelector("#send"),messages=document.querySelector("#messages");let trusted=false;',
      'input.addEventListener("input",e=>{if(e.isTrusted)trusted=true;send.disabled=!(trusted&&input.value.trim())});',
      'send.addEventListener("click",e=>{if(!e.isTrusted||send.disabled)return;input.value="";send.disabled=true;setTimeout(()=>{const a=document.createElement("div");a.dataset.messageAuthorRole="assistant";a.textContent="Working on the Yardmaster repair";messages.append(a)},500)});',
      '</script>'
    ].join(''));
    await withHookCdp(page,async cdp=>{
      await __testHooks.sendPrompt(cdp,'YARDMASTER DELAYED RESPONSE PROBE',null,{sendTimeoutMs:220,confirmMs:30,finalConfirmationMs:1800});
    });
    await expect(page.locator('[data-message-author-role="assistant"]')).toHaveText('Working on the Yardmaster repair');
    await expect(page.locator('[data-message-author-role="user"]')).toHaveCount(0);
  });

  test('complete ZIP plus prompt plus trusted send handoff succeeds',async({page})=>{
    const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ym-pw-send-')),upload=writeZip(temp,'Yardmaster-Combined-Handoff-Fixture.zip');
    try{
      await page.setContent(composerFixture({completeSend:true}));
      await withHookCdp(page,async cdp=>{
        await __testHooks.attachFile(cdp,upload,null);
        await __testHooks.sendPrompt(cdp,'YARDMASTER COMPLETE PLAYWRIGHT HANDOFF',null,{sendTimeoutMs:5000,confirmMs:800,attachmentConfirmMs:1000,requiredAttachmentName:path.basename(upload)});
      });
      await expect(page.locator('[data-message-author-role="user"]')).toHaveText('YARDMASTER COMPLETE PLAYWRIGHT HANDOFF');
    }finally{fs.rmSync(temp,{recursive:true,force:true})}
  });
});

test.describe('Windows operator dashboard',()=>{
  test('self-heal controls queue diagnostics without touching 86 Chaos',async({page})=>{
    const fixture=createOperatorFixture();
    try{
      await readyOperator(fixture);await page.goto(fixture.baseUrl);
      const before=execFileSync('git',['status','--porcelain'],{cwd:fixture.repo,encoding:'utf8'});
      await page.getByRole('button',{name:'Settings'}).click();
      await expect(page.getByRole('button',{name:'Run Self-Heal Diagnostic'})).toBeVisible();
      await expect(page.getByRole('button',{name:'Resume Self-Heal'})).toBeVisible();
      await page.getByRole('button',{name:'Run Self-Heal Diagnostic'}).click();
      const status=await poll(async()=>{const x=await (await fetch(fixture.baseUrl+'/api/status')).json();return x.selfHeal?.state==='queued'?x:null},{timeout:8000});
      expect(status.selfHeal.attempt).toBe(0);
      expect(status.selfHeal.maxAttempts).toBe(5);
      expect(fs.existsSync(path.join(fixture.dataDir,'self-heal-request.json'))).toBe(true);
      await expect(page.locator('#selfHealState')).toHaveText(/queued/i,{timeout:5000});
      const after=execFileSync('git',['status','--porcelain'],{cwd:fixture.repo,encoding:'utf8'});
      expect(after).toBe(before);
    }finally{await stopOperator(fixture)}
  });

  test('failed handoff exposes detailed status, resume recovery, push health, and PC update control',async({page})=>{
    const fixture=createOperatorFixture({handoffError:true});
    try{
      await readyOperator(fixture);await page.goto(fixture.baseUrl);
      await expect(page.locator('#doingStatus')).toContainText('handoff stopped safely');
      await expect(page.locator('#waitingStatus')).toContainText('Resume Current Failed Test');
      await expect(page.getByRole('button',{name:'Resume Current Failed Test'})).toBeVisible();
      await page.getByRole('button',{name:'Settings'}).click();
      await expect(page.getByRole('button',{name:'Update PC Yardmaster Now'})).toBeVisible();
      await expect(page.locator('#pushHealthSummary')).toBeVisible();
      await page.setViewportSize({width:390,height:844});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
    }finally{await stopOperator(fixture)}
  });

  test('start, pause, resume, and stop controls act on the isolated operator only',async({page})=>{
    const fixture=createOperatorFixture();
    try{
      await readyOperator(fixture);await page.goto(fixture.baseUrl);
      await page.locator('button[data-action="start"]').click();
      await poll(async()=>{const s=await (await fetch(fixture.baseUrl+'/api/status')).json();return s.run?.state==='running'?s:null});
      await page.locator('button[data-action="pause"]').click();
      await poll(async()=>{const s=await (await fetch(fixture.baseUrl+'/api/status')).json();return s.run?.state==='paused'?s:null});
      await page.locator('button[data-action="resume"]').click();
      await poll(async()=>{const s=await (await fetch(fixture.baseUrl+'/api/status')).json();return ['running','passed'].includes(s.run?.state)?s:null});
      await page.locator('button[data-action="stop"]').click();
      await poll(async()=>{const s=await (await fetch(fixture.baseUrl+'/api/status')).json();return s.run?.state==='stopped'?s:null});
      await expect(page.locator('#runTitle')).toContainText('Stopped');
    }finally{await stopOperator(fixture)}
  });
});
