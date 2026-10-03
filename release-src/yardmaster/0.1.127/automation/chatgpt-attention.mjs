export async function chatGPTRequiredAction(cdp){
  const action=await cdp.eval(`/*YM_CHAT_REQUIRED_ACTION*/(()=>{
    const latestUser=[...document.querySelectorAll('[data-message-author-role="user"]')].at(-1);
    const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'};
    for(const e of document.querySelectorAll('h1,h2,h3,h4,button,span,div')){
      if(!visible(e)||e.closest('[data-message-author-role="user"],pre,code,blockquote'))continue;
      if(latestUser&&!(latestUser.compareDocumentPosition(e)&Node.DOCUMENT_POSITION_FOLLOWING))continue;
      const title=[...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join(' ').trim();
      const match=title.match(/^(Connect|Reconnect|Sign in to|Authenticate)(?: to)? ([A-Za-z][A-Za-z0-9 ._-]{0,59})$/i);if(!match)continue;
      for(let card=e.parentElement,i=0;card&&card!==document.body&&i<4;card=card.parentElement,i++){
        const control=[...card.querySelectorAll('button,[role="button"],a')].find(b=>visible(b)&&!b.disabled&&/^(?:connect|reconnect|sign in|log in|authenticate)(?: to)?(?: [A-Za-z][A-Za-z0-9 ._-]{0,59})?$/i.test((b.innerText||b.getAttribute('aria-label')||'').trim()));
        if(control)return {service:match[2].trim(),kind:/^reconnect$/i.test(match[1])?'connector-reconnect':/^connect$/i.test(match[1])?'connector-connect':'connector-sign-in'};
      }
    }
    return null;
  })()`,7000).catch(()=>null);
  return ['connector-connect','connector-reconnect','connector-sign-in'].includes(action?.kind)&&/^[A-Za-z][A-Za-z0-9 ._-]{0,59}$/.test(action.service||'')?action:null;
}

export function attentionMessage(action){
  const task=action.kind==='connector-connect'?'connect':action.kind==='connector-sign-in'?'sign in to':'reconnect';
  return `${action.service} needs your attention. Open ChatGPT on your PC and ${task} ${action.service}, then choose Resume Handoff. Your failed-test report is saved.`;
}
