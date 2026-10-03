import {currentVersion,nextVersion} from './version-fixture.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn,execFileSync} from 'node:child_process';
import {expect} from '@playwright/test';

export async function operatorUpdateFixture({config={}}={}){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ym-update-ui-')),repo=path.join(dir,'repo'),data=path.join(dir,'data');fs.mkdirSync(repo);fs.mkdirSync(data);
  fs.writeFileSync(path.join(repo,'package.json'),'{"name":"fixture","version":"1.0.0"}');execFileSync('git',['init','-b','testing'],{cwd:repo,stdio:'ignore'});
  fs.writeFileSync(path.join(data,'config.json'),JSON.stringify({repositoryPath:repo,autoUpdateOperator:false,autoSelfHeal:false,automationDefaultsVersion:7,...config}));
  const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
  const child=spawn(process.execPath,['server.mjs'],{cwd:path.resolve('.'),stdio:'pipe',env:{...process.env,YARDMASTER_PORT:String(port),YARDMASTER_DATA_DIR:data,YARDMASTER_DISABLE_UPDATE_CHECKS:'1',YARDMASTER_TEST_UPDATE_STUB:'1',YARDMASTER_TEST_UPDATE_MANIFEST:JSON.stringify({version:nextVersion,channel:'testing',verified:false,verification:{candidate:'testing-only'},downloadUrl:'https://example.invalid/testing.zip',sha256:'a'.repeat(64)})}});
  let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);
  const url='http://127.0.0.1:'+port;
  try{await expect.poll(async()=>{if(child.exitCode!==null)throw new Error(output);try{return (await fetch(url+'/api/status')).ok}catch{return false}},{timeout:15000}).toBe(true)}catch(error){child.kill();fs.rmSync(dir,{recursive:true,force:true});throw error}
  return {url,data,close:async()=>{if(child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r))}fs.rmSync(dir,{recursive:true,force:true})}};
}

