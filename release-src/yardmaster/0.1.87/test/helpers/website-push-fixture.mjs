import fs from 'node:fs';
import http from 'node:http';
const root=new URL('../fixtures/website/',import.meta.url);
export const readWebsite=name=>fs.readFileSync(new URL(name,root),'utf8');
export function workerHeaders(){
  const config=JSON.parse(readWebsite('vercel.json'));
  return Object.fromEntries(config.headers.find(rule=>rule.source==='/yardmaster/sw.js').headers.map(h=>[h.key,h.value]));
}
export async function startWebsitePushFixture(){
  const server=http.createServer((req,res)=>{
    const name=req.url.split('?')[0];
    if(name==='/yardmaster/sw.js'){res.writeHead(200,{'Content-Type':'text/javascript',...workerHeaders()});res.end(readWebsite('sw.js'));return}
    res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Yardmaster notification regression</title><h1>Yardmaster</h1>');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {base:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(resolve=>server.close(resolve))};
}
