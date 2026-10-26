import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
for(const file of ['src/lib/launch-signup.mjs','api/launch-signup.js','api/apply.js','api/beta-application.js','scripts/preview-website.mjs']) {
  const result = spawnSync(process.execPath,['--check',file],{stdio:'inherit'}); assert.equal(result.status,0,file);
}
const files=['dist/index.html','dist/privacy.html',...readdirSync('dist/_astro').filter(x=>/\.(js|css)$/.test(x)).map(x=>'dist/_astro/'+x)];
for(const file of files){
  const source=readFileSync(file,'utf8');
  assert(!/\$\s*\d|\b(?:USD|US\$)\s*\d|\d+\s*(?:dollars|\/mo(?:nth)?)/i.test(source),'No price amounts: '+file);
  assert(!/RESEND_API_KEY|TURNSTILE_SECRET_KEY|UPSTASH_REDIS_REST_TOKEN|LAUNCH_HASH_SECRET|cheers-34b8d|chaos-test-d1601/.test(source),'No server secrets/Firebase in marketing bundle: '+file);
  assert(!/console\.log|innerHTML\s*=/.test(source),'No public PII logging or unsafe HTML sinks: '+file);
}
const home=readFileSync('dist/index.html','utf8');
for(const expected of ['Coming soon','No hidden charges','No long-term contracts','Chilton App Works LLC','/privacy']) assert(home.includes(expected),expected);
// Owner 2026-10-26: the public site does not describe features as planned, pending or future roadmap work.
for(const page of ['dist/index.html','dist/privacy.html']){const text=readFileSync(page,'utf8').replace(/<script[\s\S]*?<\/script>/g,' ').replace(/<[^>]+>/g,' ');assert(!/\b(planned|pending|future development|in development|part of the plan|roadmap)\b/i.test(text),'No roadmap-status wording: '+page);}
assert(!/<script(?![^>]*src=)[^>]*>/.test(home),'External scripts required by strict CSP');
assert.equal((home.match(/<h1\b/g)||[]).length,1);
assert(!/checkout|Buy now|Start free trial|testimonials/i.test(home));
for(const legacy of ['pricing.html','beta.html','features.html','all-features.html']) assert(!existsSync('dist/'+legacy),'No old marketing page in deploy output: '+legacy);
console.log('PASS: syntax, public-copy policy, retired-page output and browser-bundle boundaries.');
