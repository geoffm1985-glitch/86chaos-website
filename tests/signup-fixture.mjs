import { createSignupHandler } from '../src/lib/launch-signup.mjs';
export const testEnv = {
  LAUNCH_FORM_ENABLED:'true', RESEND_API_KEY:'mock-private-mail-value', BETA_FROM_EMAIL:'86 Chaos <launch@86chaos.com>',
  PUBLIC_TURNSTILE_SITE_KEY:'mock-public-site-key', TURNSTILE_SECRET_KEY:'mock-private-bot-value',
  UPSTASH_REDIS_REST_URL:'https://example.upstash.io', UPSTASH_REDIS_REST_TOKEN:'mock-private-store-value',
  LAUNCH_HASH_SECRET:'mock-private-hash-value-at-least-thirty-two-characters',
  LAUNCH_ALLOWED_ORIGINS:'https://www.86chaos.com,http://127.0.0.1:4329', TURNSTILE_HOSTNAMES:'www.86chaos.com'
};
export function fixture(overrides = {}) {
  const records=new Map(), rates=new Map(), locks=new Map(), mail=[];
  let bot={success:true,action:'launch_signup',hostname:'www.86chaos.com'};
  let providerStatus=200, providerBody={id:'test-message-id'}, failSave=false, failGet=false, timeout=false;
  const store={
    rate:async(key)=>{const n=(rates.get(key)||0)+1;rates.set(key,n);return n;},
    get:async key=>{if(failGet)throw new Error('store down');return records.get(key)||null;},
    create:async(key,value)=>{if(records.has(key))return false;records.set(key,structuredClone(value));return true;},
    save:async(key,value)=>{if(failSave)throw new Error('store down');records.set(key,structuredClone(value));},
    lock:async(key,value)=>{if(locks.has(key))return false;locks.set(key,value);return true;},
    unlock:async(key,value)=>{if(locks.get(key)===value)locks.delete(key);}
  };
  const fetcher=async(url,options)=>{
    if(url.includes('siteverify')){const token=JSON.parse(options.body).response;return new Response(JSON.stringify(token==='bad-token'?{success:false}:bot),{status:200});}
    mail.push({payload:JSON.parse(options.body),key:options.headers['Idempotency-Key']});
    if(timeout)throw new Error('provider timeout');
    const status=mail.at(-1).payload.reply_to.includes('provider-fail')?502:providerStatus;
    return new Response(JSON.stringify(providerBody),{status});
  };
  const handler=createSignupHandler({env:{...testEnv,...overrides.env},store,fetcher,...overrides});
  const call=async(body={email:'owner@example.com',consent:true,token:'good-token'},opts={})=>{
    const req={method:'POST',headers:{origin:'https://www.86chaos.com','content-type':'application/json',...opts.headers},body,socket:{remoteAddress:'127.0.0.1'},...opts};
    const res={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(data){this.body=data;return this;}};
    await handler(req,res);return res;
  };
  return {handler,call,store,records,rates,locks,mail,setBot:value=>bot=value,setProvider:(status,body)=>{providerStatus=status;providerBody=body;},failSave:value=>failSave=value,failGet:value=>failGet=value,timeout:value=>timeout=value,reset(){records.clear();rates.clear();locks.clear();mail.length=0;}};
}
