// Observe both IPC and the operator PID. Windows parent termination need not
// deliver IPC disconnect promptly; process cleanup must not depend on it.
import {killWindowsProcessTrees} from './windows-process-tree.mjs';
let owned=[],armed=true,cleaning=false;
const ownerPid=Number(process.argv[2]);
const alive=pid=>{try{process.kill(pid,0);return true}catch{return false}};
const poll=Number.isInteger(ownerPid)&&ownerPid>0?setInterval(()=>{if(!alive(ownerPid))void cleanup()},250):null;
async function cleanup(){
  if(cleaning)return;cleaning=true;if(poll)clearInterval(poll);
  if(armed&&process.platform==='win32')await killWindowsProcessTrees(owned);
  else if(armed)for(const pid of owned){try{process.kill(-pid,'SIGTERM')}catch{try{process.kill(pid,'SIGTERM')}catch{}}}
  if(armed&&process.platform!=='win32'){
    await new Promise(r=>setTimeout(r,1500));
    for(const pid of owned){try{process.kill(-pid,'SIGKILL')}catch{}}
  }
  process.exit(0);
}
process.on('message',message=>{
  if(message.type==='owned'){owned=message.pids.filter(Number.isInteger);if(process.connected)process.send({type:'owned-ack'},()=>{})}
  if(message.type==='disarm'){armed=false;if(poll)clearInterval(poll)}
});
process.on('disconnect',()=>{void cleanup()});
