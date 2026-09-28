const CACHE='yardmaster-v0.1.0';
const ASSETS=['/','/styles.css','/app.js','/yardmaster-logo.svg','/yardmaster-icon.svg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));});
