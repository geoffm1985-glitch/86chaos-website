// IPC disconnect also occurs after an operator crash, so the Emulator Suite
// cannot outlive the Yardmaster process that owns it.
import {spawn} from 'node:child_process';
let owned=[],armed=true;
process.on('message',message=>{
  if(message.type==='owned')owned=message.pids.filter(Number.isInteger);
  if(message.type==='disarm')armed=false;
});
process.on('disconnect',async()=>{
  if(armed)for(const pid of owned){
    if(process.platform==='win32')await new Promise(resolve=>{const child=spawn('taskkill.exe',['/PID',String(pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});child.once('close',resolve);child.once('error',resolve)});
    else{try{process.kill(-pid,'SIGTERM')}catch{try{process.kill(pid,'SIGTERM')}catch{}}}
  }
  if(armed&&process.platform!=='win32'){
    await new Promise(r=>setTimeout(r,1500));
    for(const pid of owned){try{process.kill(-pid,'SIGKILL')}catch{}}
  }
  process.exit(0);
});
