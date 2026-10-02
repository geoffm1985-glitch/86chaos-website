import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('Export Build Manifest creates the intelligence directory on a fresh operator setup',async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster-manifest-'));
  const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),repo=path.join(temp,'repo'),data=path.join(temp,'data');
  fs.mkdirSync(repo);fs.mkdirSync(data);fs.writeFileSync(path.join(repo,'package.json'),'{"name":"fixture"}');
  execFileSync('git',['init','-b','testing'],{cwd:repo,stdio:'ignore'});
  fs.writeFileSync(path.join(data,'config.json'),JSON.stringify({repositoryPath:repo,branch:'testing',automationDefaultsVersion:6,autoUpdateOperator:false,autoHandoff:false,autoSelfHeal:false}));
  const port=22000+Math.floor(Math.random()*12000),base='http://127.0.0.1:'+port;
  const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,YARDMASTER_DATA_DIR:data,YARDMASTER_REPOSITORY_PATH:repo,YARDMASTER_PORT:String(port),YARDMASTER_DISABLE_UPDATE_CHECKS:'1',YARDMASTER_TEST_QUEUE_ONLY:'1'},stdio:'pipe'});
  let output='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
  try{
    let ready=false;const end=Date.now()+15000;
    while(Date.now()<end){try{ready=(await fetch(base+'/api/status')).ok;if(ready)break}catch{}await new Promise(r=>setTimeout(r,100));}
    assert.ok(ready,'Operator did not start: '+output);
    assert.equal(fs.existsSync(path.join(data,'intelligence')),false,'Regression must start without the destination directory');
    for(let attempt=0;attempt<2;attempt++){
      const response=await fetch(base+'/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'export-build-manifest'})});
      const body=await response.text();assert.equal(response.status,200,body);
      const result=JSON.parse(body);assert.equal(result.ok,true);
      assert.ok(path.resolve(result.path).startsWith(path.resolve(data)+path.sep));
      assert.ok(fs.existsSync(result.path));assert.equal(JSON.parse(fs.readFileSync(result.path,'utf8')).rootHash,result.manifest.rootHash);
    }
  }finally{
    try{await fetch(base+'/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'shutdown-operator'})})}catch{}
    if(child.exitCode===null)child.kill();
    if(child.exitCode===null)await new Promise(resolve=>{const timer=setTimeout(resolve,3000);child.once('exit',()=>{clearTimeout(timer);resolve()})});
    fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }
});
