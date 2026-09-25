const CACHE="tarot-images-v255";
self.addEventListener("fetch",e=>{
  const u=e.request.url;
  if(u.includes("raw.githubusercontent.com/sixseeds/tarot-api/") && u.includes("/cards/")){
    e.respondWith(caches.open(CACHE).then(async c=>{
      const hit=await c.match(e.request);
      if(hit) return hit;
      const r=await fetch(e.request);
      if(r.ok) c.put(e.request,r.clone());
      return r;
    }));
  }
});