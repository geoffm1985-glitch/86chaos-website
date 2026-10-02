import crypto from 'node:crypto';
import {signedConnection,DISCOVERY_URL} from '../../automation/owner-connection.mjs';
const keys=crypto.generateKeyPairSync('rsa',{modulusLength:2048}),owner={id:'fixture-owner',privateKey:keys.privateKey.export({type:'pkcs8',format:'pem'}),publicKey:keys.publicKey.export({format:'jwk'})},connection={id:owner.id,publicKey:owner.publicKey,discoveryUrl:DISCOVERY_URL};
import {readWebsite,startWebsitePushFixture} from './website-push-fixture.mjs';

// Render only Astro's server-side release labels. All DOM, CSS, and browser
// logic below come verbatim from the deployed page source in this checkout.
export function mobilePage(){
  return readWebsite('yardmaster.astro').replace(/^---[\s\S]*?---\s*/, '')
    .replace('{title}','Yardmaster Testing').replace('{description}','Yardmaster mobile regression')
    .replace('{release.downloadUrl}','/yardmaster/download')
    .replace("{release.verified?'Verified':'Testing candidate'}",'Testing candidate')
    .replace('{release.version}','fixture').replace('{releaseDate}','Testing');
}
export const REMOTE='https://mobile-fixture.trycloudflare.com';
export function mobileState(){
  return {connection,version:'fixture',machineName:'Fixture PC',branches:['testing','experiment/fixture'],
    config:{branch:'testing',repositoryPath:'C:\\Fixture',testType:'delta',chatMode:'Work',model:'GPT-5.6 Sol',thinkingEffort:'High',chatLoopEnabled:true,chatLoopPlan:'Work → Chat',repoUpdateMode:'automatic',maxRepairAttempts:25,maxSelfHealAttempts:5,autoHandoff:true,autoSelfHeal:true,autoPush:false,waitForDeploy:true,runAfterDeploy:true,autoUpdateOperator:true,dryRunMode:false,testingUrl:'https://fixture.invalid'},
    remote:{phoneConnected:true,url:REMOTE},operatorStatus:{doing:'Fixture running',waitingOn:'Fixture result',nextAction:'Review result',updatedAt:Date.now()},
    run:{title:'Fixture run',state:'running',currentTest:'Mobile fixture test',progress:42,counts:{pass:8,fail:1,skip:2},command:'fixture-test',log:['first console line','latest console line']},
    workflow:{state:'idle'},chatgpt:{state:'Running',routeLabel:'Work → Chat'},deployment:{state:'Ready',expectedCommit:'a'.repeat(40),deployedCommit:'a'.repeat(40)},
    currentDevice:{hasPush:true,pushStatus:'working'},trustedDevices:[{id:'phone-fixture',name:'Fixture Phone',hasPasskey:true,hasPush:true,pushStatus:'working'}],
    update:{state:'queued',waitingOn:'paused checkpoint'},activity:[{at:Date.now(),message:'Fixture activity'}],runHistory:[{title:'Earlier run',state:'passed',startedAt:Date.now()}]};
}
export function mobileIntelligence(){return {updatedAt:Date.now(),safeMode:{enabled:false},health:[{label:'Git',status:'ok'}],timeline:[{label:'Saved checkpoint'}],profiles:{fixture:{name:'Fixture Profile'}},worktrees:[{branch:'experiment/fixture',path:'C:\\FixtureWorktree'}],evidence:[{id:'fixture-evidence',name:'fixture-evidence.txt',kind:'log'}],screenshotAvailable:true}}
export async function startMobileFixture(){return startWebsitePushFixture({html:mobilePage()})}

export async function prepareMobile(page,{authenticated=true,credentialStub=true,session=true}={}){
  const state=mobileState(),intelligence=mobileIntelligence(),calls=[],failures=new Map(),delays=new Map();
  await page.addInitScript(({remote,authenticated,credentialStub,session})=>{
    if(authenticated&&!localStorage.getItem('fixture:login-seeded')){localStorage.setItem('fixture:login-seeded','1');localStorage.setItem('yardmaster:url',remote);localStorage.setItem('yardmaster:deviceId','phone-fixture');if(session)sessionStorage.setItem('yardmaster:session','fixture-session')}
    // Worker lifecycle has separate real-browser scope tests. Keep remote API mocks
    // from being bypassed by a worker fetch on subsequent reloads.
    Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{register:async()=>{throw new Error('Mobile fixture worker transport is simulated')}}});
    if(credentialStub){
      const credential=()=>({id:'fixture-credential',rawId:new Uint8Array([1]).buffer,type:'public-key',response:{clientDataJSON:new Uint8Array([1]).buffer,attestationObject:new Uint8Array([1]).buffer,authenticatorData:new Uint8Array([1]).buffer,signature:new Uint8Array([1]).buffer,userHandle:null,getTransports:()=>['internal']},getClientExtensionResults:()=>({}),authenticatorAttachment:'platform'});
      Object.defineProperty(navigator,'credentials',{value:{create:async()=>credential(),get:async()=>credential()},configurable:true});
    }
    window.fixtureClipboard='';Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.fixtureClipboard=text},configurable:true});
  },{remote:REMOTE,authenticated,credentialStub,session});
  await page.route(DISCOVERY_URL+'*',route=>route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:signedConnection(owner,REMOTE)}));
  await page.route(REMOTE+'/**',async route=>{
    const req=route.request(),url=new URL(req.url()),body=req.postData()?req.postDataJSON():null;
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
    if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers});return}
    calls.push({path:url.pathname,method:req.method(),body,authorization:req.headers().authorization});
    if(delays.has(url.pathname))await delays.get(url.pathname);
    if(failures.has(url.pathname)){await route.fulfill({headers,status:failures.get(url.pathname),body:'Fixture remote error'});return}
    if(url.pathname==='/api/operator-screenshot'){await route.fulfill({headers,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64')});return}
    if(url.pathname==='/api/evidence'){await route.fulfill({headers,contentType:'text/plain',body:'fixture evidence'});return}
    let json;
    switch(url.pathname){
      case '/api/remote/health':json={ok:true,connectionId:owner.id};break;
      case '/api/status':json=state;break;
      case '/api/intelligence':json=intelligence;break;
      case '/api/config':Object.assign(state.config,body);json={ok:true};break;
      case '/api/action':json={ok:true,runsOn:'windows-pc',queued:true,waitingOn:'paused checkpoint'};break;
      case '/api/command':json={ok:true};break;
      case '/api/passkey/register/options':json={registrationId:'fixture',options:{challenge:'AQ',rp:{name:'Yardmaster'},user:{id:'AQ',name:'Fixture',displayName:'Fixture'},pubKeyCredParams:[{type:'public-key',alg:-7}]}};break;
      case '/api/passkey/auth/options':json={authId:'fixture',options:{challenge:'AQ',allowCredentials:[]}};break;
      case '/api/passkey/register/verify':case '/api/passkey/auth/verify':json={connection,deviceId:'phone-fixture',sessionToken:'fixture-session'};break;
      case '/api/push/key':json={publicKey:'AQID'};break;
      case '/api/push/subscribe':json={ok:true,testDelivered:true};break;
      case '/api/push/test':json={ok:true};break;
      default:throw new Error('Unmocked mobile request: '+url.pathname);
    }
    await route.fulfill({headers,json});
  });
  return {state,intelligence,calls,failures,delays};
}
