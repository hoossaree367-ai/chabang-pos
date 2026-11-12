// Keeps the POS page openable with no internet: always try the network first, fall back to the saved copy.
const CACHE='chabang-pos-v3';
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./','manifest.webmanifest','icon-192.png'])))});
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);if(e.request.method!=='GET')return;
  const font=u.host==='fonts.googleapis.com'||u.host==='fonts.gstatic.com';
  if(u.origin!==location.origin&&!font)return;
  e.respondWith(fetch(e.request).then(r=>{if(r.ok||r.type==='opaque'){const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c))}return r}).catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||(e.request.mode==='navigate'?caches.match('./'):Response.error()))));
});
// Push from the Apps Script relay (FCM data message): always show a notification, as iOS requires.
self.addEventListener('push',e=>{
  let j={};try{j=e.data?e.data.json():{}}catch(x){j={body:e.data&&e.data.text()}}
  const d=j.data||j,n=j.notification||{};
  e.waitUntil(self.registration.showNotification(d.title||n.title||'CHABANG',{body:d.body||n.body||'',tag:d.tag||undefined,icon:'icon-192.png',badge:'icon-192.png'}));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{const c=cs.find(x=>x.url.startsWith(self.registration.scope));return c?c.focus():self.clients.openWindow('./')}));
});
