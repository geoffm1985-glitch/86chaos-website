const CACHE='yardmaster-v0.1.62';
const ASSETS=['/','/styles.css','/app.js','/yardmaster-logo.svg','/yardmaster-icon.svg'];
self.addEventListener('install',event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)))});
self.addEventListener('activate',event=>event.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))])));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET')return;event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)))});
self.addEventListener('push',event=>{
  let data={};try{data=event.data?.json?.()||{}}catch{try{data={body:event.data?.text?.()||''}}catch{}}
  const title=data.title||'Yardmaster',url=data.url||'https://www.86chaos.com/yardmaster';
  event.waitUntil(self.registration.showNotification(title,{body:data.body||'',icon:data.icon||'/yardmaster-icon.svg',badge:data.badge||'/yardmaster-icon.svg',tag:data.tag||'yardmaster-status',renotify:true,requireInteraction:!!data.requireInteraction,data:{url}}))
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();const url=event.notification?.data?.url||'https://www.86chaos.com/yardmaster';
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>{for(const client of clients){try{if(new URL(client.url).origin===new URL(url).origin){client.navigate?.(url);return client.focus()}}catch{}}return self.clients.openWindow?self.clients.openWindow(url):undefined}))
});
