import {test,expect} from '@playwright/test';
import {__testHooks} from '../../automation/chatgpt.mjs';

async function withCdp(page,fn){
  const session=await page.context().newCDPSession(page);
  const cdp={send:(method,params={})=>session.send(method,params),eval:async expression=>{
    const result=await session.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});
    if(result.exceptionDetails)throw new Error(result.exceptionDetails.text);return result.result?.value;
  }};
  try{return await fn(cdp)}finally{await session.detach()}
}
const account='<aside><button aria-label="Account menu">G M Plus</button><button hidden>Log in</button></aside>';

test('@chatgptLogin193 hidden and pending inputs cannot shadow the signed-in composer or prompt text',async({page})=>{
  await page.setContent(account+'<textarea id="pending-home-input">pending</textarea><textarea hidden>hidden stale</textarea><textarea id="unrelated">unrelated</textarea><form><div id="prompt-textarea" contenteditable="true">correct prompt</div><button type="button">Add files</button></form>');
  await withCdp(page,async cdp=>{
    const ready=await __testHooks.waitHandoffComposerReady(cdp,2500);expect(ready?.id).toBe('prompt-textarea');
    expect(await __testHooks.manualComposerText(cdp)).toBe('correct prompt');
    await __testHooks.trustedClearComposer(cdp);expect(await __testHooks.manualComposerText(cdp)).toBe('');
  });
  await expect(page.locator('#unrelated')).toHaveValue('unrelated');await expect(page.locator('#pending-home-input')).toHaveValue('pending');
});

test('@chatgptLogin193 a signed-in page loading its composer remains a readiness problem',async({page})=>{
  await page.setContent(account+'<p>Loading conversation…</p>');
  await withCdp(page,async cdp=>{
    await expect(__testHooks.composerUnavailableResult(cdp,{docked:true})).rejects.toMatchObject({code:'CHATGPT_COMPOSER_UNAVAILABLE'});
    await page.evaluate(()=>{document.body.insertAdjacentHTML('beforeend','<form><textarea id="prompt-textarea"></textarea><button>Send</button></form>')});
    expect((await __testHooks.waitHandoffComposerReady(cdp,2500))?.id).toBe('prompt-textarea');
  });
  await expect(page.getByRole('button',{name:'Account menu'})).toBeVisible();
});

test('@chatgptLogin193 conversation text asking to sign in is not authentication evidence',async({page})=>{
  await page.setContent(account+'<div data-message-author-role="assistant"><a href="/help">Sign in</a></div>');
  await withCdp(page,async cdp=>await expect(__testHooks.composerUnavailableResult(cdp)).rejects.toMatchObject({code:'CHATGPT_COMPOSER_UNAVAILABLE'}));
});

test('@chatgptLogin193 a visible sign-in control reports the actual session needing authentication',async({page})=>{
  await page.setContent('<button aria-label="Log in">Log in</button><p>Welcome to ChatGPT</p>');
  await withCdp(page,async cdp=>{
    const result=await __testHooks.composerUnavailableResult(cdp,{purpose:'automation'});
    expect(result.state).toBe('login_required');expect(result.message).toContain('automation Yardmaster Edge profile');
  });
});

test('@chatgptLogin193 all hidden or disabled composers stay unavailable until an editable one appears',async({page})=>{
  await page.setContent(account+'<form><textarea id="prompt-textarea" disabled></textarea><textarea hidden></textarea><button>Send</button></form>');
  await withCdp(page,async cdp=>{
    expect(await cdp.eval(__testHooks.composerExpression)).toBeNull();
    await expect(__testHooks.composerUnavailableResult(cdp,{docked:true})).rejects.toMatchObject({code:'CHATGPT_COMPOSER_UNAVAILABLE'});
    await page.locator('#prompt-textarea').evaluate(e=>e.disabled=false);
    expect((await __testHooks.waitHandoffComposerReady(cdp,2500))?.id).toBe('prompt-textarea');
  });
});
