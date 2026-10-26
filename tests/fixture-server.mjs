import {createPreviewServer} from '../scripts/preview-website.mjs';
import {fixture} from './signup-fixture.mjs';
const f=fixture();
const server=createPreviewServer(f.handler,async(req,res,url)=>{
  if(url.pathname==='/__test/reset' && req.method==='POST'){f.reset();res.json({ok:true});return true;}
  if(url.pathname==='/__test/mail'){res.json({count:f.mail.length,records:f.records.size});return true;}
  return false;
});
server.listen(4329,'127.0.0.1',()=>console.log('Loopback-only mock-delivery test server on 4329. No real mail.'));
