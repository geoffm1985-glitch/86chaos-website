import fs from 'node:fs';
import http from 'node:http';
const root=new URL('../fixtures/website/',import.meta.url);
export const readWebsite=name=>fs.readFileSync(new URL(name,root),'utf8');
export function workerHeaders(){
  const config=JSON.parse(readWebsite('vercel.json'));
  return Object.fromEntries(config.headers.find(rule=>rule.source==='/yardmaster/sw.js').headers.map(h=>[h.key,h.value]));
}
export async function startWebsitePushFixture({html='<!doctype html><title>Yardmaster notification regression</title><h1>Yardmaster</h1>'}={}){
  const server=http.createServer((req,res)=>{
    const name=req.url.split('?')[0];
    if(name==='/yardmaster/sw.js'){res.writeHead(200,{'Content-Type':'text/javascript',...workerHeaders()});res.end(readWebsite('sw.js'));return}
    if(name.endsWith('.svg')){res.writeHead(200,{'Content-Type':'image/svg+xml'});res.end('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"/>');return}
    res.writeHead(200,{'Content-Type':'text/html'});res.end(html);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {base:'http://127.0.0.1:'+server.address().port,close:()=>new Promise(resolve=>server.close(resolve))};
}
