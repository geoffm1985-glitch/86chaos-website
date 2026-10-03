import {test,expect} from '@playwright/test';
import os from 'node:os';
import {__testHooks} from '../../automation/chatgpt.mjs';

async function signedInFixture(page){
  await page.route('https://chatgpt.com/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>ChatGPT dock fixture</title><button aria-label="Account menu">Signed-in account</button><form><div id="prompt-textarea" contenteditable="true">existing draft</div><button>Add files</button></form>'}));
  await page.goto('https://chatgpt.com/');
}
function factoryFor(page,clients){
  return ()=>{let session;const cdp={connect:async()=>{session=await page.context().newCDPSession(page)},send:(method,params)=>session.send(method,params),eval:async expression=>{const r=await session.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.text);return r.result?.value},close:()=>session?.detach().catch(()=>{})};clients.push(cdp);return cdp};
}

test('@chatgptDock195 embedded document target attaches to the existing signed-in composer',async({page})=>{
  await signedInFixture(page);const clients=[];
  try{
    const cdp=await __testHooks.attachResponsiveChatGPT([{type:'other',url:page.url(),webSocketDebuggerUrl:'fixture-dock'}],os.tmpdir(),{createCdp:factoryFor(page,clients)});
    expect(cdp).toBeTruthy();expect((await __testHooks.waitHandoffComposerReady(cdp,2500))?.id).toBe('prompt-textarea');
    expect(await __testHooks.manualComposerText(cdp)).toBe('existing draft');await expect(page.getByRole('button',{name:'Account menu'})).toHaveText('Signed-in account');
  }finally{for(const cdp of clients)await cdp.close()}
});

test('@chatgptDock195 restricted session storage cannot hide a usable signed-in dock',async({page})=>{
  await signedInFixture(page);
  await page.evaluate(()=>Object.defineProperty(window,'sessionStorage',{configurable:true,get(){throw new DOMException('Storage disabled','SecurityError')}}));
  const clients=[];try{
    const cdp=await __testHooks.attachResponsiveChatGPT([{type:'page',url:page.url(),webSocketDebuggerUrl:'fixture-dock'}],os.tmpdir(),{createCdp:factoryFor(page,clients)});
    expect(cdp).toBeTruthy();expect((await __testHooks.waitHandoffComposerReady(cdp,2500))?.id).toBe('prompt-textarea');
    await expect(page.locator('#prompt-textarea')).toHaveText('existing draft');
  }finally{for(const cdp of clients)await cdp.close()}
});
