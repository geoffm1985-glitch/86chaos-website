import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import handler from '../api/launch-signup.js';
import retired from '../api/apply.js';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const root = resolve('dist');
const config = JSON.parse(readFileSync('vercel.json','utf8'));
const types = {'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.xml':'application/xml','.txt':'text/plain'};
export function createPreviewServer(signupHandler=handler, extraRoute=()=>false) {
return createServer(async(req,res)=>{
  res.status = code => {res.statusCode=code;return res;};
  res.json = data => {res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));};
  const url = new URL(req.url,'http://localhost');
  if (await extraRoute(req,res,url)) return;
  if(url.pathname === '/api/launch-signup') return signupHandler(req,res);
  if(['/api/apply','/api/beta-application'].includes(url.pathname)) return retired(req,res);
  const redirect = config.redirects.find(x=>x.source === url.pathname);
  if(redirect){res.writeHead(307,{Location:redirect.destination});return res.end();}
  const policy = config.headers.find(x=>x.source === url.pathname);
  for(const h of policy?.headers || []) res.setHeader(h.key,h.key==='Content-Security-Policy' ? h.value.replace('; upgrade-insecure-requests','') : h.value);
  try{
    let file=resolve(root,'.'+decodeURIComponent(url.pathname));
    if(file!==root && !file.startsWith(root+sep)){res.writeHead(403);return res.end();}
    if(url.pathname.endsWith('/')) file=resolve(file,'index.html');
    else if(!extname(file)) file+='.html';
    if(!(await stat(file)).isFile()) throw new Error();
    res.setHeader('Content-Type',types[extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  }catch{res.writeHead(404);res.end('Not found');}
});
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) createPreviewServer().listen(4328,'127.0.0.1',()=>console.log('Local website preview: http://127.0.0.1:4328 (signup disabled unless configured; no mock success)'));
