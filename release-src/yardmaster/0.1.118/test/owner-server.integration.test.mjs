import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
test('release gate: expired trusted session survives service restart; public controls reject missing/revoked credentials',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ym-server-owner-')),token='fixture-only-owner-token';let child;
 const hash=crypto.createHash('sha256').update(token).digest('hex');
 fs.writeFileSync(path.join(dir,'devices.json'),JSON.stringify({phone:{id:'phone',name:'Fixture phone',credential:{id:'fixture'}}}));
 fs.writeFileSync(path.join(dir,'sessions.json'),JSON.stringify({[hash]:{deviceId:'phone',expiresAt:1}}));
 const port=await new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const p=server.address().port;server.close(()=>resolve(p))})});
 const url='http://127.0.0.1:'+port,headers={'x-forwarded-for':'198.51.100.2',Authorization:'Bearer '+token,'Content-Type':'application/json'};
 async function boot(){child=spawn(process.execPath,['server.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,YARDMASTER_DATA_DIR:dir,YARDMASTER_PORT:String(port),YARDMASTER_DISABLE_UPDATE_CHECKS:'1',YARDMASTER_DISABLE_CONNECTION_PUBLISH:'1'},windowsHide:true,stdio:'ignore'});for(let n=0;n<60;n++){try{if((await fetch(url+'/api/remote/health')).ok)return}catch{}await new Promise(r=>setTimeout(r,100))}throw Error('Fixture service failed to start')}
 async function close(){if(!child||child.exitCode!==null)return;const done=new Promise(resolve=>child.once('exit',resolve));child.kill();await done}
 try{
  await boot();assert.equal((await fetch(url+'/api/config',{method:'POST',headers,body:'{}'})).status,200);
  assert.equal((await fetch(url+'/api/action',{method:'POST',headers:{'x-forwarded-for':'198.51.100.2','Content-Type':'application/json'},body:'{"action":"stop"}'})).status,401);
  const identity=(await (await fetch(url+'/api/remote/health')).json()).connectionId;
  await close();await boot();assert.equal((await fetch(url+'/api/config',{method:'POST',headers,body:'{}'})).status,200);assert.equal((await (await fetch(url+'/api/remote/health')).json()).connectionId,identity);
  assert.equal((await fetch(url+'/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"action":"revoke-device","deviceId":"phone"}'})).status,200);
  assert.equal((await fetch(url+'/api/config',{method:'POST',headers,body:'{}'})).status,401);
 }finally{await close();fs.rmSync(dir,{recursive:true,force:true})}
});
