const CACHE='elitebet-v1';
const CORE=['/','/index.html','/style.css','/app.js','/manifest.json','/icon.svg'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys().then(keys=>
      Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))
    ).then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  if(e.request.method!=='GET'||url.pathname.startsWith('/api/'))return;
  if(url.pathname.endsWith('.html')||url.pathname==='/'){
    e.respondWith(
      fetch(e.request).then(r=>{
        const cp=r.clone();
        caches.open(CACHE).then(c=>c.put(e.request,cp));
        return r;
      }).catch(()=>caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(hit=>{
      const net=fetch(e.request).then(r=>{
        if(r.ok){
          const cp=r.clone();
          caches.open(CACHE).then(c=>c.put(e.request,cp));
        }
        return r;
      }).catch(()=>hit);
      return hit||net;
    })
  );
});
