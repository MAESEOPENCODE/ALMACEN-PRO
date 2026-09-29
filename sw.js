var V='almacen-v4';
var ASSETS=['./','index.html','manifest.webmanifest','icon-192.png'];

self.addEventListener('install',function(e){
  e.waitUntil(caches.open(V).then(function(c){
    return Promise.all(ASSETS.map(function(a){return c.add(a).catch(function(){})}));
  }).then(function(){return self.skipWaiting()}));
});

self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.filter(function(k){return k!==V}).map(function(k){return caches.delete(k)}));
  }).then(function(){return self.clients.claim()}));
});

self.addEventListener('fetch',function(e){
  var r=e.request;
  if(r.method!=='GET'||new URL(r.url).origin!==location.origin)return;
  var html=r.mode==='navigate'||/(^|\/)(index\.html)?$/.test(new URL(r.url).pathname);
  if(html){
    // Red primero: así cada versión nueva de index.html llega sola. Sin red, usa la copia guardada.
    e.respondWith(fetch(r).then(function(res){
      var cp=res.clone();caches.open(V).then(function(c){c.put(r,cp)});return res;
    }).catch(function(){return caches.match(r).then(function(m){return m||caches.match('index.html')})}));
    return;
  }
  // Resto de archivos: primero la copia guardada, y se refresca en segundo plano.
  e.respondWith(caches.match(r).then(function(m){
    var net=fetch(r).then(function(res){
      if(res&&res.ok){var cp=res.clone();caches.open(V).then(function(c){c.put(r,cp)})}
      return res;
    }).catch(function(){return m});
    return m||net;
  }));
});
