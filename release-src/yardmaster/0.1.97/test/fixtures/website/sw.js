const CACHE='yardmaster-pwa-v0.1.97';
const ASSETS=['/yardmaster','/yardmaster/yardmaster-logo.svg','/yardmaster/yardmaster-icon.svg','/yardmaster/manifest.webmanifest'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener('activate',e=>e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))])));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>r).catch(()=>caches.match(e.request)))});
self.addEventListener('push',e=>{let d={title:'Yardmaster',body:'Yardmaster has an update for you.',url:'/yardmaster'};try{d={...d,...e.data.json()}}catch{}e.waitUntil(self.registration.showNotification(d.title,{body:d.body,icon:'/yardmaster/yardmaster-icon.svg',badge:'/yardmaster/yardmaster-icon.svg',data:{url:d.url||'/yardmaster'}}))});
self.addEventListener('notificationclick',e=>{e.notification.close();const u=e.notification.data?.url||'/yardmaster';e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{const found=list.find(c=>c.url.includes('/yardmaster'));if(found){found.focus();found.navigate(u);return}return clients.openWindow(u)}))});

