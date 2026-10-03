import fs from 'node:fs';

// A living cloudflared process can retry forever after its Quick Tunnel is deleted.
// A later successful registration supersedes the earlier error.
export function tunnelRegistrationLost(log){
  const lines=String(log).split(/\r?\n/);
  let lost=false;
  for(const line of lines){
    if(/Register tunnel error/i.test(line)&&/Unauthorized:\s*Tunnel not found/i.test(line))lost=true;
    else if(/Registered tunnel connection/i.test(line))lost=false;
  }
  return lost;
}
export function readTunnelRegistrationLost(file){
  let fd;
  try{
    fd=fs.openSync(file,'r');
    const size=fs.fstatSync(fd).size,length=Math.min(size,65536),buffer=Buffer.alloc(length);
    fs.readSync(fd,buffer,0,length,size-length);
    return tunnelRegistrationLost(buffer.toString('utf8'));
  }catch{return false}
  finally{if(fd!==undefined)fs.closeSync(fd)}
}
