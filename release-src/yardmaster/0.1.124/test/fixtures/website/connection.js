/* Owner identity survives PWA, tunnel and PC restarts; only revocation clears it. */
(()=>{
  const KEY='yardmaster:',DISCOVERY='https://raw.githubusercontent.com/geoffm1985-glitch/86chaos-website/yardmaster-connections/connection.json';
  const valid=url=>/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/i.test(String(url||''));
  function failure(kind,message){return Object.assign(new Error(message),{kind})}
  class OwnerConnection{
    constructor({storage=localStorage,tabStorage=sessionStorage,transport=(...args)=>fetch(...args),cryptography=crypto,network=navigator}={}){
      this.storage=storage;this.tabStorage=tabStorage;this.fetch=transport;this.crypto=cryptography;this.network=network;
      this.base=storage.getItem(KEY+'url')||'';this.credential=storage.getItem(KEY+'ownerCredential')||tabStorage.getItem(KEY+'session')||'';
      try{this.descriptor=JSON.parse(storage.getItem(KEY+'connection')||'null')}catch{this.descriptor=null}
      if(this.credential)this.saveCredential(this.credential);
      this.discoveryPending=null;this.failures=0;
    }
    saveCredential(token){this.credential=token;this.storage.setItem(KEY+'ownerCredential',token);this.tabStorage.setItem(KEY+'session',token)}
    rejectCredential(){this.credential='';this.storage.removeItem(KEY+'ownerCredential');this.tabStorage.removeItem(KEY+'session')}
    remember(value){if(!value?.id||!value.publicKey||value.discoveryUrl!==DISCOVERY)return;this.descriptor=value;this.storage.setItem(KEY+'connection',JSON.stringify(value))}
    async rediscover(){
      if(this.discoveryPending)return this.discoveryPending;
      this.discoveryPending=this.discover().finally(()=>{this.discoveryPending=null});return this.discoveryPending;
    }
    async discover(){
      if(this.network.onLine===false)throw failure('network-offline','Your phone is offline. Retrying when the network returns.');
      let record;
      try{const r=await this.fetch(DISCOVERY+'?refresh='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(6000)});if(!r.ok)throw new Error('Discovery HTTP '+r.status);record=await r.json()}
      catch{throw failure('tunnel-unavailable','The current PC address is temporarily unavailable. Your phone remains trusted.')}
      let payload;try{payload=JSON.parse(record.payload)}catch{throw failure('tunnel-unavailable','The connection record is invalid.')}
      const known=this.descriptor;
      if(known&&payload.id!==known.id)throw failure('tunnel-unavailable','The saved owner PC does not match the connection record.');
      try{
        const key=await this.crypto.subtle.importKey('jwk',known?.publicKey||record.publicKey,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
        const signature=Uint8Array.from(atob(record.signature),ch=>ch.charCodeAt(0));
        if(!await this.crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,signature,new TextEncoder().encode(record.payload)))throw new Error('Invalid signature');
      }catch{throw failure('tunnel-unavailable','The owner PC address could not be verified.')}
      if(!valid(payload.url))throw failure(payload.availability==='offline'?'pc-offline':'tunnel-unavailable','Your PC has no active remote tunnel. It will reconnect automatically.');
      let health;
      try{
        const r=await this.fetch(payload.url+'/api/remote/health',{cache:'no-store',signal:AbortSignal.timeout(6000)});
        if(!r.ok)throw failure([502,530].includes(r.status)?'tunnel-unavailable':'api-unreachable','The remote tunnel or PC service is temporarily unavailable.');
        health=await r.json();
      }catch(error){throw error.kind?error:failure(payload.availability==='offline'?'pc-offline':'api-unreachable',payload.availability==='offline'?'Your Yardmaster PC service is offline.':'The tunnel address is known, but the PC API is not reachable yet.')}
      if(!health.ok||health.connectionId!==payload.id)throw failure('api-unreachable','The current tunnel has not reached your owner PC yet.');
      this.remember({id:payload.id,publicKey:known?.publicKey||record.publicKey,discoveryUrl:DISCOVERY});
      this.base=payload.url;this.storage.setItem(KEY+'url',this.base);return this.base;
    }
    async request(path,opt={}){
      this.base=this.storage.getItem(KEY+'url')||this.base;
      const send=async()=>{
        if(this.network.onLine===false)throw failure('network-offline','Your phone is offline. Retrying automatically.');
        if(!valid(this.base))throw failure('tunnel-unavailable','Your saved PC address is unavailable.');
        let r;try{r=await this.fetch(this.base+path,{...opt,cache:'no-store',signal:opt.signal||AbortSignal.timeout(12000),headers:{'Content-Type':'application/json',...(this.credential?{Authorization:'Bearer '+this.credential}:{}),...(opt.headers||{})}})}
        catch{throw failure('api-unreachable','The PC API is temporarily unreachable. Your saved sign-in is retained.')}
        if(r.status===401)throw failure('authentication-rejected','Your owner credential was rejected. Unlock with your saved passkey.');
        if(!r.ok)throw failure([502,530].includes(r.status)?'tunnel-unavailable':'api-unreachable','Remote service HTTP '+r.status+'. Retrying automatically.');
        try{return await r.json()}catch{throw failure('api-unreachable','The tunnel did not return a Yardmaster API response.')}
      };
      try{return await send()}catch(error){
        if(error.kind==='network-offline')throw error;
        const previous=this.base;
        try{await this.rediscover()}catch(discoveryError){throw discoveryError}
        // A POST may already have reached the PC. Never duplicate a control action.
        if((!opt.method||opt.method==='GET')&&(this.base!==previous||error.kind==='authentication-rejected')){
          try{return await send()}catch(retry){if(retry.kind==='authentication-rejected')this.rejectCredential();throw retry}
        }
        throw error;
      }
    }
  }
  globalThis.YardmasterConnection=OwnerConnection;
})();
