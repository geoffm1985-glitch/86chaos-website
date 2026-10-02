import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createConnectionPublisher,ownerConnectionIdentity,DISCOVERY_URL} from '../automation/owner-connection.mjs';
test('public discovery migrates only the metadata checkout from the private app to the public website repository',async()=>{
 const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'ym-public-discovery-'));fs.mkdirSync(path.join(dataDir,'connection-discovery/.git'),{recursive:true});const calls=[];
 try{const identity=ownerConnectionIdentity(dataDir),publish=createConnectionPublisher({dataDir,identity,run:async(exe,args)=>{calls.push(args);if(args[0]==='fetch')throw Object.assign(new Error("couldn't find remote ref"),{stderr:"couldn't find remote ref"});return {stdout:''}}});
 await publish('https://owner-fixture.trycloudflare.com');assert.deepEqual(calls[0],['remote','set-url','origin','https://github.com/geoffm1985-glitch/86chaos-website.git']);assert.match(DISCOVERY_URL,/86chaos-website\/yardmaster-connections\/connection.json$/);assert.ok(calls.some(c=>c[0]==='push'&&c[2]==='HEAD:yardmaster-connections'));
 }finally{fs.rmSync(dataDir,{recursive:true,force:true})}
});
