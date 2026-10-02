import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {firebaseEnvironment,firebasePreloadOption,newFirebaseRun} from '../../automation/firebase-target.mjs';

// Exercise Node's real NODE_OPTIONS parser with Windows separators and spaces,
// including inheritance by a grandchild; no remote connection is attempted.
export async function probeWindowsPreload(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster preload spaces '));
  try{
    const guard=path.join(root,'firebase-network-guard.cjs');
    fs.copyFileSync(new URL('../../automation/firebase-network-guard.cjs',import.meta.url),guard);
    const env=firebaseEnvironment({run:newFirebaseRun({})});
    env.NODE_OPTIONS=firebasePreloadOption(guard.replaceAll('/','\\'));
    return spawnSync(process.execPath,['-e',`const a=require('assert');a.throws(()=>require('net').connect(443,'firestore.googleapis.com'),/blocked non-local/);const c=require('child_process').spawnSync(process.execPath,['-e',"require('assert').throws(()=>require('net').connect(443,'firestore.googleapis.com'),/blocked non-local/)"],{env:process.env});a.equal(c.status,0,c.stderr?.toString())`],{env,encoding:'utf8',timeout:10000});
  }finally{await fs.promises.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
}

// Run the actual Windows batch-file launcher, with spaces in its filename,
// executable path and argument. This is intentionally native Windows coverage.
export async function probeWindowsCmdLaunch(){
  const {spawnManaged,killManaged}=await import('../../automation/firebase-target.mjs');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'yardmaster cmd spaces '));let child;
  try{
    const probe=path.join(root,'probe.cjs'),command=path.join(root,'local app launcher.cmd');
    fs.writeFileSync(probe,`const a=require('assert');a.deepEqual(process.argv.slice(2),['run','value with spaces']);a.throws(()=>require('net').connect(443,'firestore.googleapis.com'),/blocked non-local/);console.log('WINDOWS_CMD_READY');`);
    fs.writeFileSync(command,`@echo off\r\n"${process.execPath}" "${probe}" %*\r\n`);
    child=spawnManaged(command,['run','value with spaces'],{cwd:root,env:firebaseEnvironment({run:newFirebaseRun({})})});
    let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);
    const code=await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Windows batch launcher did not finish')),10000);
      child.once('close',code=>{child.yardmasterClosed=true;clearTimeout(timer);resolve(code)});
      child.once('error',error=>{clearTimeout(timer);reject(error)});
    });
    return {code,stdout,stderr};
  }finally{if(child&&!child.yardmasterClosed)await killManaged(child);await fs.promises.rm(root,{recursive:true,force:true,maxRetries:10,retryDelay:100})}
}
