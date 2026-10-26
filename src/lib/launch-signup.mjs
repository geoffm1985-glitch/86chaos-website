import { createHmac, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
export const CONSENT_VERSION = 'launch-updates-2026-10-26';
export const CONSENT_TEXT = 'I agree to receive 86 Chaos product and launch updates by email. I can unsubscribe at any time.';
const MAX_BYTES = 8192;
const RETENTION = 60 * 60 * 24 * 180;
const UNAVAILABLE = 'Launch signup is temporarily unavailable. Please try again later or email Geoffrey@86chaos.com.';
const SUCCESS = 'You’re on the list. We’ll email you with 86 Chaos product and launch updates.';
const RATE_SCRIPT = "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n";
const UNLOCK_SCRIPT = "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end";
export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function validEmail(value) {
  if (typeof value !== 'string' || value.length > 254 || /[\s\x00-\x1f\x7f]/.test(value)) return false;
  const parts = value.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  return !!local && local.length <= 64 && !local.startsWith('.') && !local.endsWith('.') && !local.includes('..') && /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) && !!domain && domain.length <= 253 && domain.includes('.') && domain.split('.').every(label => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label)) && /^[a-zA-Z]{2,63}$/.test(domain.split('.').at(-1));
}
function config(env) {
  const from = env.LAUNCH_FROM_EMAIL || env.BETA_FROM_EMAIL || '';
  const address = from.match(/<([^<>]+)>$/)?.[1] || from;
  const origins = (env.LAUNCH_ALLOWED_ORIGINS || 'https://86chaos.com,https://www.86chaos.com').split(',').map(x => x.trim());
  const hosts = (env.TURNSTILE_HOSTNAMES || '86chaos.com,www.86chaos.com').split(',').map(x => x.trim());
  const siteKey = env.PUBLIC_TURNSTILE_SITE_KEY || '';
  const ready = env.LAUNCH_FORM_ENABLED === 'true' && !!env.RESEND_API_KEY && validEmail(address) && address.toLowerCase().endsWith('@86chaos.com') && !/[\r\n]/.test(from) && !!env.TURNSTILE_SECRET_KEY && !/^[123]x000/.test(env.TURNSTILE_SECRET_KEY) && !!siteKey && !/^[123]x000/.test(siteKey) && /^https:\/\/[^/]+\.upstash\.io\/?$/.test(env.UPSTASH_REDIS_REST_URL || '') && !!env.UPSTASH_REDIS_REST_TOKEN && (env.LAUNCH_HASH_SECRET || '').length >= 32;
  return { from, origins, hosts, siteKey, ready };
}
export function createRedisStore(env, fetcher = fetch) {
  async function command(...args) {
    const response = await fetcher(env.UPSTASH_REDIS_REST_URL, { method:'POST', headers:{ Authorization:`Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type':'application/json' }, body:JSON.stringify(args), signal:AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error('Store unavailable');
    const data = await response.json();
    if (data.error) throw new Error('Store unavailable');
    return data.result;
  }
  return {
    rate: (key, seconds) => command('EVAL', RATE_SCRIPT, 1, key, seconds),
    get: async key => { const raw = await command('GET',key); return raw ? JSON.parse(raw) : null; },
    create: async (key, value) => (await command('SET',key,JSON.stringify(value),'EX',RETENTION,'NX')) === 'OK',
    save: async (key, value) => { if (await command('SET',key,JSON.stringify(value),'EX',RETENTION) !== 'OK') throw new Error('Store unavailable'); },
    lock: async (key, token) => (await command('SET',key,token,'EX',60,'NX')) === 'OK',
    unlock: (key, token) => command('EVAL',UNLOCK_SCRIPT,1,key,token)
  };
}
export async function readBody(req) {
  const declared = Number(req.headers['content-length'] || 0);
  if (!Number.isFinite(declared) || declared < 0 || declared > MAX_BYTES) throw Object.assign(new Error(),{status:413});
  let raw;
  if (req.body !== undefined) raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  else {
    const chunks = []; let size = 0;
    for await (const chunk of req) {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BYTES) throw Object.assign(new Error(),{status:413});
      chunks.push(Buffer.from(chunk));
    }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.byteLength(raw || '') > MAX_BYTES) throw Object.assign(new Error(),{status:413});
  try { return JSON.parse(raw); } catch { throw Object.assign(new Error(),{status:400}); }
}
function validate(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Please check the form and try again.';
  if (typeof body.email !== 'string' || !validEmail(body.email.trim())) return 'Enter a valid email address.';
  if (body.consent !== true) return 'Please agree to receive product and launch updates.';
  for (const [key, max] of [['name',80],['restaurant',160]]) {
    if (body[key] !== undefined && (typeof body[key] !== 'string' || body[key].length > max || /[\x00-\x1f\x7f]/.test(body[key]))) return 'Check the name and business fields and try again.';
  }
  if (body.website) return 'We couldn’t verify this request. Please try again.';
  if (typeof body.token !== 'string' || !body.token || body.token.length > 2048) return 'Please complete the security check.';
  return null;
}
export function buildEmail(record, from) {
  const fields = [['First name',record.name || 'Not supplied'],['Email',record.email],['Restaurant / business',record.restaurant || 'Not supplied'],['Submitted (UTC)',record.submittedAt],['Consent','Explicitly agreed'],['Consent wording',CONSENT_TEXT],['Consent version',record.consentVersion],['Record ID',record.id]];
  return {from, to:['Geoffrey@86chaos.com'], reply_to:record.email, subject:'86 Chaos — New Launch Interest Signup', text:fields.map(([k,v]) => `${k}: ${v}`).join('\n'), html:`<h1>New 86 Chaos launch interest signup</h1>${fields.map(([k,v]) => `<p><strong>${escapeHtml(k)}:</strong> ${escapeHtml(v)}</p>`).join('')}`};
}
export function createSignupHandler({env = process.env, fetcher = fetch, store, now = () => Date.now(), uuid = randomUUID} = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    const send = (status, message, extra = {}) => res.status(status).json({ok:status === 200, message, ...extra});
    const cfg = config(env);
    if (req.method === 'GET') return res.status(200).json({available:cfg.ready, siteKey:cfg.ready ? cfg.siteKey : null});
    if (req.method !== 'POST') { res.setHeader('Allow','GET, POST'); return send(405,'Method not allowed.'); }
    if (!cfg.ready) return send(503,UNAVAILABLE);
    if (!cfg.origins.includes(req.headers.origin) || req.headers['sec-fetch-site'] === 'cross-site') return send(403,'This request could not be verified.');
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return send(415,'Please submit using the signup form.');
    const hash = value => createHmac('sha256',env.LAUNCH_HASH_SECRET).update(value).digest('hex');
    // Vercel overwrites this header at its edge. Never trust visitor x-forwarded-for.
    const ip = env.VERCEL === '1' ? req.headers['x-vercel-forwarded-for']?.split(',')[0]?.trim() : req.socket?.remoteAddress;
    if (!ip || !isIP(ip)) return send(503,UNAVAILABLE);
    const db = store || createRedisStore(env,fetcher);
    let lockKey; let lockToken;
    try {
      if (await db.rate(`launch:rate:ip:${hash(ip)}`,600) > 5) { res.setHeader('Retry-After','600'); return send(429,'Too many attempts. Please wait ten minutes and try again.'); }
      const body = await readBody(req);
      const invalid = validate(body);
      if (invalid) return send(400,invalid);
      const verify = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:env.TURNSTILE_SECRET_KEY,response:body.token,remoteip:ip}),signal:AbortSignal.timeout(6000)});
      if (!verify.ok) return send(503,'The security check is unavailable. Please try again shortly.');
      const bot = await verify.json();
      if (bot.success !== true || bot.action !== 'launch_signup' || !cfg.hosts.includes(bot.hostname)) return send(403,'The security check expired or failed. Please try again.');
      const email = body.email.trim().toLowerCase();
      const key = `launch:signup:${hash(email)}`;
      if (await db.rate(`launch:rate:email:${hash(email)}`,3600) > 5) { res.setHeader('Retry-After','3600'); return send(429,'Too many attempts for this email. Please try again later.'); }
      lockKey = `${key}:lock`; lockToken = uuid();
      if (!await db.lock(lockKey,lockToken)) { lockToken = null; res.setHeader('Retry-After','60'); return send(409,'A request is already being processed. Please wait a minute before trying again.'); }
      let record = await db.get(key);
      if (record?.status === 'accepted') return send(200,SUCCESS);
      if (record && now() - Date.parse(record.submittedAt) >= 23 * 60 * 60 * 1000) return send(503,'We need to check an earlier request. Please email Geoffrey@86chaos.com.');
      if (!record) {
        record = {id:uuid(),email,name:(body.name || '').trim(),restaurant:(body.restaurant || '').trim(),submittedAt:new Date(now()).toISOString(),consent:true,consentVersion:CONSENT_VERSION,consentText:CONSENT_TEXT,status:'pending'};
        record.mail = buildEmail(record,cfg.from);
        if (!await db.create(key,record)) return send(409,'A request is already being processed. Please try again shortly.');
      }
      // Stored payload + stable key make provider timeouts and storage failures safe to retry.
      const response = await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`launch-${record.id}`},body:JSON.stringify(record.mail),signal:AbortSignal.timeout(10000)});
      const result = await response.json().catch(() => ({}));
      if (!response.ok || typeof result.id !== 'string' || !result.id) return send(502,'We couldn’t send your request. Please try again shortly.');
      await db.save(key,{...record,status:'accepted',providerId:result.id,acceptedAt:new Date(now()).toISOString()});
      return send(200,SUCCESS);
    } catch (error) {
      if (error.status === 413) return send(413,'This request is too large. Please shorten the fields.');
      if (error.status === 400) return send(400,'Please check the form and try again.');
      // Deliberately no request bodies, provider responses, tokens or personal data in logs.
      return send(503,UNAVAILABLE);
    } finally {
      if (lockKey && lockToken) { try { await db.unlock(lockKey,lockToken); } catch { /* Lease expires; do not replay delivery. */ } }
    }
  };
}
