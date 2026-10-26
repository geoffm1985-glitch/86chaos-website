import {createHmac} from 'node:crypto';
import {resolve,relative,isAbsolute} from 'node:path';
import {writeFile,mkdir} from 'node:fs/promises';
import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
// Operator-only CLI. Never imported by the website or deployed as an API.
const command=process.argv[2];
if(!['export','remove'].includes(command)) throw new Error('Usage: node --env-file=.env.local scripts/manage-launch-records.mjs export <private-output-path> | remove');
if(!process.env.UPSTASH_REDIS_REST_TOKEN || !process.env.UPSTASH_REDIS_REST_URL || !process.env.LAUNCH_HASH_SECRET) throw new Error('Private environment configuration required.');
async function redis(...args){const r=await fetch(process.env.UPSTASH_REDIS_REST_URL,{method:'POST',headers:{Authorization:`Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('Store request failed.');const data=await r.json();if(data.error)throw new Error('Store operation failed.');return data.result;}
if(command==='export'){
  if(!process.argv[3])throw new Error('Supply a private output file outside this repository.');
  const destination=resolve(process.argv[3]);const rel=relative(process.cwd(),destination);
  if(!rel.startsWith('..') && !isAbsolute(rel))throw new Error('Export must be outside the repository.');
  const records=[];let cursor='0';
  do{const result=await redis('SCAN',cursor,'MATCH','launch:signup:*','COUNT',100);cursor=result[0];for(const key of result[1]){if(key.endsWith(':lock'))continue;const value=await redis('GET',key);if(value){const {mail,...record}=JSON.parse(value);records.push(record);}}}while(cursor!=='0');
  // Exclusive create avoids accidentally overwriting a retained export.
  await writeFile(destination,JSON.stringify({exportedAt:new Date().toISOString(),records},null,2),{flag:'wx',mode:0o600});
  console.log(`Exported ${records.length} records to the requested private file. Protect the file and include it in retention/removal reviews.`);
}else{
  const rl=createInterface({input:stdin,output:stdout});
  const email=(await rl.question('Email address to remove (private console only): ')).trim().toLowerCase();rl.close();
  const {validEmail}=await import('../src/lib/launch-signup.mjs');if(!validEmail(email))throw new Error('Invalid email address.');
  const key='launch:signup:'+createHmac('sha256',process.env.LAUNCH_HASH_SECRET).update(email).digest('hex');
  const lock=key+':lock';const owner=crypto.randomUUID();
  if(await redis('SET',lock,owner,'EX',60,'NX')!=='OK')throw new Error('A submission is active. Retry after it completes.');
  try{await redis('DEL',key);console.log('Active signup record removed. Also remove associated mailbox copies and private exports, and honor suppression in any future mailing system.');}
  finally{await redis('EVAL',"if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",1,lock,owner);}
}
