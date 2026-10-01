import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {stopFixture} from './fixture-cleanup.mjs';

export async function startRunProjectFixture(){
  const root=fileURLToPath(new URL('../../',import.meta.url)),temp=fs.mkdtempSync(path.join(os.tmpdir(),'ym-project-')),repo=path.join(temp,'repo'),data=path.join(temp,'data');fs.mkdirSync(repo);fs.mkdirSync(data);
  const packageFile=path.join(repo,'package.json');
  fs.writeFileSync(packageFile,JSON.stringify({name:'86chaos',version:'18.0.7',scripts:{'test:play-store:delta':'node fixture.cjs'}}));
  fs.writeFileSync(path.join(repo,'fixture.cjs'),"console.log('[RUNNING] NODE: 17.0.43+ historical regression name');setInterval(()=>{},1000);\n");
  for(const args of [['init','-b','testing'],['config','user.name','Fixture'],['config','user.email','fixture@example.invalid'],['add','.'],['commit','-m','fixture']])execFileSync('git',args,{cwd:repo,stdio:'ignore'});
  fs.writeFileSync(path.join(data,'config.json'),JSON.stringify({repositoryPath:repo,branch:'testing',testType:'delta',autoUpdateOperator:false,autoHandoff:false,autoSelfHeal:false,autoPush:false,automationDefaultsVersion:6}));
  const port=46000+Math.floor(Math.random()*1500),base='http://127.0.0.1:'+port;
  const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,YARDMASTER_DATA_DIR:data,YARDMASTER_PORT:String(port),YARDMASTER_REPOSITORY_PATH:repo,YARDMASTER_DISABLE_UPDATE_CHECKS:'1'},stdio:'ignore'});
  const api=async(url,body)=>{const r=await fetch(base+url,{signal:AbortSignal.timeout(12000),...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});if(!r.ok)throw new Error(await r.text());return r.json()};
  const close=async()=>{try{await api('/api/action',{action:'stop'})}catch{}await stopFixture({child,temp,shutdown:()=>api('/api/action',{action:'shutdown-operator'})})};
  const until=Date.now()+45000;
  while(Date.now()<until){try{await api('/api/status');return {temp,repo,data,base,child,packageFile,api,close}}catch{}await new Promise(resolve=>setTimeout(resolve,100))}
  await close();throw new Error('Run project fixture did not start');
}
