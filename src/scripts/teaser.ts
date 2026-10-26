interface TurnstileAPI {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
}
declare global { interface Window { turnstile?: TurnstileAPI; } }
const form = document.querySelector<HTMLFormElement>('#launch-form');
const fields = document.querySelector<HTMLFieldSetElement>('#signup-fields');
const status = document.querySelector<HTMLElement>('#form-status');
const submit = document.querySelector<HTMLButtonElement>('#signup-submit');
const widget = document.querySelector<HTMLElement>('#turnstile-widget');
let token = ''; let widgetId = ''; let busy = false; let available = false;
function message(text: string, state = '', focus = false) {
  if (!status) return;
  status.textContent = text; status.dataset.state = state;
  if (focus) status.focus();
}
async function initSignup() {
  if (!fields || !widget || !submit) return;
  try {
    const response = await fetch('/api/launch-signup', {cache:'no-store'});
    if (!response.ok) throw new Error();
    const config = await response.json();
    // Until signup delivery is configured and verified, say so plainly instead of looking like an outage.
    if (!config.available || !config.siteKey) {
      available=false; fields.disabled=true;
      message('Online signup opens soon. For launch updates now, email Geoffrey@86chaos.com.');
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true; script.defer = true;
    await new Promise<void>((resolve,reject) => {
      const timer = window.setTimeout(() => reject(new Error()),15000);
      script.onload = () => { clearTimeout(timer); resolve(); };
      script.onerror = () => { clearTimeout(timer); reject(new Error()); };
      document.head.append(script);
    });
    if (!window.turnstile) throw new Error();
    widgetId = window.turnstile.render(widget, {sitekey:config.siteKey,action:'launch_signup',theme:'dark',size:'flexible',callback:(value: string) => {token=value; if (status?.dataset.state !== 'error') message('Ready when you are.');},'expired-callback':() => {token='';message('Security check expired. Please complete it again.');},'error-callback':() => {token='';message('The security check is unavailable. Please try again later or contact us by email.','error');}});
    fields.disabled = false; available = true;
    message('Complete the form and security check to join.');
  } catch {
    available=false; fields.disabled=true;
    message('Launch signup is temporarily unavailable. Please email Geoffrey@86chaos.com for launch information.');
  }
}
form?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!form || !fields || !submit || busy || !available || !form.reportValidity()) return;
  if (!token) {message('Please complete the security check.','error',true); return;}
  const data = new FormData(form);
  busy=true; submit.disabled=true; form.setAttribute('aria-busy','true');
  message('Sending your request…');
  try {
    const response = await fetch('/api/launch-signup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:data.get('email'),name:data.get('name'),restaurant:data.get('restaurant'),consent:data.get('consent')==='on',website:data.get('website'),token}),signal:AbortSignal.timeout(40000)});
    const result = await response.json();
    if (!response.ok || result.ok !== true) {message(result.message || 'We couldn’t send your request. Please try again.','error',true); return;}
    form.reset(); fields.disabled=true; available=false;
    message(result.message,'success',true);
  } catch {
    message('We couldn’t confirm your request. Please try again; duplicate requests are handled safely.','error',true);
  } finally {
    busy=false; submit.disabled=false; form.removeAttribute('aria-busy'); token='';
    if (available && window.turnstile && widgetId) window.turnstile.reset(widgetId);
  }
});
if (form) {
  const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) {observer.disconnect(); void initSignup();} },{rootMargin:'250px'});
  observer.observe(form);
}
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}}),{threshold:0.08});
  document.querySelectorAll('.feature,.team-art,.promises article').forEach(element => {element.classList.add('reveal-ready');observer.observe(element);});
}
export {};
