// Emulator test children may reach only loopback. This preload is inherited by
// Node, npm, release-gate children and Playwright's browser worker processes.
const net = require('node:net');
const fs = require('node:fs');
const Module = require('node:module');
const local = host => /^(localhost|127\.\d+\.\d+\.\d+|\[?::1\]?|::ffff:127\.\d+\.\d+\.\d+)$/i.test(String(host || 'localhost'));
if (process.env.YARDMASTER_FIREBASE_TARGET === 'emulator') {
  const denied = host => {
    const error = new Error('EMULATOR network guard blocked non-local destination: ' + host);
    error.code = 'YARDMASTER_NO_LIVE_FALLBACK';
    try { fs.appendFileSync(process.env.YARDMASTER_FIREBASE_NETWORK_LOG, JSON.stringify({at:Date.now(),host,blocked:true})+'\n'); } catch {}
    return error;
  };
  const connect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function(...args) {
    const options = Array.isArray(args[0]) ? args[0][0] : net._normalizeArgs(args)[0];
    if (!options.path && !local(options.host)) throw denied(options.host);
    return connect.apply(this,args);
  };
  const fetch = globalThis.fetch;
  globalThis.fetch = (input,...args) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (!local(url.hostname)) return Promise.reject(denied(url.hostname));
    return fetch(input,...args);
  };
  for (const name of ['node:http','node:https']) {
    const api = require(name);
    for (const key of ['request','get']) {
      const original = api[key];
      api[key] = function(input,...args) {
        const host = typeof input === 'string' || input instanceof URL ? new URL(input).hostname : input.hostname || input.host;
        if (!local(host)) throw denied(host);
        return original.call(this,input,...args);
      };
    }
  }
  const instrumentContext = async context => {
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (['http:','https:','ws:','wss:'].includes(url.protocol) && !local(url.hostname)) {
        denied(url.hostname); return route.abort('blockedbyclient');
      }
      return route.fallback();
    });
    return context;
  };
  const instrument = api => {
    for (const type of ['chromium','firefox','webkit']) {
      const engine = api?.[type];
      if (!engine || engine.__yardmasterGuard) continue;
      engine.__yardmasterGuard = true;
      const launch = engine.launch.bind(engine);
      engine.launch = async (...args) => {
        const browser = await launch(...args), create = browser.newContext.bind(browser);
        browser.newContext = async options => instrumentContext(await create({...options,serviceWorkers:'block'}));
        return browser;
      };
      const persistent = engine.launchPersistentContext.bind(engine);
      engine.launchPersistentContext = async (dir,options) => instrumentContext(await persistent(dir,{...options,serviceWorkers:'block'}));
    }
    return api;
  };
  const load = Module._load;
  Module._load = function(name,...args) {
    const api = load.call(this,name,...args);
    return /^(playwright|playwright-core|@playwright\/test)$/.test(name) ? instrument(api) : api;
  };
}
