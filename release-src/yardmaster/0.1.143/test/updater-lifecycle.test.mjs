import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {guardedUpdaterArguments,launchUpdaterProcess,updaterProcessFailure} from '../automation/operator-update.mjs';

test('updater that exits after successful spawn reports its actual exit',async()=>{
  let finish;const exited=new Promise(r=>finish=r);
  const child=await launchUpdaterProcess(['-e','process.exit(7)'],{spawnProcess:(_exe,args,options)=>spawn(process.execPath,args,options),onExit:finish});
  assert.equal((await exited).code,7);assert.ok(child.pid);
});
test('dead updater is detected after startup grace; live updater is allowed to finish',()=>{
  const update={state:'Updating',pid:123,startedAt:1000};
  assert.equal(updaterProcessFailure(update,{now:9000,isAlive:()=>false}),null);
  assert.match(updaterProcessFailure(update,{now:12000,isAlive:()=>false}),/saved workflow is retained/);
  assert.equal(updaterProcessFailure(update,{now:99999999,isAlive:()=>true}),null);
  assert.equal(updaterProcessFailure({...update,state:'Queued'},{now:12000,isAlive:()=>false}),null);
});
test('real Windows updater bootstrap records failures before the update script can start',{skip:process.platform!=='win32'},async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"ym updater's lifecycle "));
  try{
    fs.writeFileSync(path.join(dir,'update-resume.json'),JSON.stringify({resumeAfterUpdate:{kind:'continue-after-run',code:1}}));
    const args=guardedUpdaterArguments(['-File',path.join(dir,'missing updater.ps1'),'-DataDir',dir],{dataDir:dir,startedAt:123456});
    await launchUpdaterProcess(args,{independent:true});
    const deadline=Date.now()+15000;while(!fs.existsSync(path.join(dir,'operator-update-result.json'))&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));
    const read=name=>JSON.parse(fs.readFileSync(path.join(dir,name),'utf8').replace(/^\uFEFF/,''));
    assert.equal(read('operator-update-progress.json').startedAt,123456);
    assert.match(read('operator-update-result.json').error,/not recognized/);
    assert.equal(read('update-resume.json').resumeAfterUpdate.code,1);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
test('real Windows updater continues after its Node operator parent exits',{skip:process.platform!=='win32'},async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ym updater survives ')),done=path.join(dir,'completed.txt');
  try{
    const started=path.join(dir,'started.txt');
    const script=path.join(dir,'update.ps1');fs.writeFileSync(script,`Set-Content -LiteralPath '${started.replaceAll("'","''")}' -Value 'started'\nStart-Sleep -Seconds 2\nSet-Content -LiteralPath '${done.replaceAll("'","''")}' -Value 'finished'\n`);
    const module=new URL('../automation/operator-update.mjs',import.meta.url).href;
    const parent=spawn(process.execPath,['--input-type=module','-e',`import {launchUpdaterProcess,guardedUpdaterArguments} from ${JSON.stringify(module)};await launchUpdaterProcess(guardedUpdaterArguments(['-NoProfile','-File',${JSON.stringify(script)}],{dataDir:${JSON.stringify(dir)},startedAt:123}),{independent:true});process.exit(0);`],{stdio:'ignore',windowsHide:true});
    assert.equal(await new Promise(r=>parent.on('exit',r)),0);
    const deadline=Date.now()+15000;while(!fs.existsSync(done)&&Date.now()<deadline)await new Promise(r=>setTimeout(r,100));
    assert.equal(fs.readFileSync(done,'utf8').trim(),'finished');
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
