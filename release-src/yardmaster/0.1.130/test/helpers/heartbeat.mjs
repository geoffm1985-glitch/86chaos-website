import fs from 'node:fs';

export function heartbeatBytes(file){return fs.existsSync(file)?fs.statSync(file).size:0}
export async function waitForHeartbeat(file,{minimum=2,timeoutMs=15000,pollMs=50}={}){
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){
    const size=heartbeatBytes(file);
    if(size>=minimum)return size;
    await new Promise(resolve=>setTimeout(resolve,pollMs));
  }
  throw new Error('Heartbeat fixture did not become ready within '+timeoutMs+' ms: expected at least '+minimum+' bytes, observed '+heartbeatBytes(file)+'.');
}
