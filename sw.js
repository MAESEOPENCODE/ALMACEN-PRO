const CACHE_PREFIX = "salsalog-pwa-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./manus-routes.json",
  "./salsa-log-mark.svg",
  "./icon-180.png",
  "./icon-192.png",
  "./icon-512.png",
];

async function cacheUrl(cache, url) {
  try {
    const response = await fetch(url, { cache: "reload" });
    if (response.ok) await cache.put(url, response);
  } catch {
    // Los recursos se volverán a solicitar cuando haya conexión.
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    const shellUrls = APP_SHELL.map((path) => new URL(path, self.registration.scope).href);
    await Promise.all(shellUrls.map((url) => cacheUrl(cache, url)));

    // El HTML publicado contiene los nombres hash actuales de CSS y JavaScript.
    // Precargarlos evita que la primera apertura instalada dependa de una segunda visita online.
    try {
      const appUrl = new URL("./", self.registration.scope).href;
      const response = await fetch(appUrl, { cache: "reload" });
      if (response.ok) {
        const html = await response.clone().text();
        await cache.put(appUrl, response);
        const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)]
          .map((match) => new URL(match[1], appUrl).href)
          .filter((url) => new URL(url).origin === self.location.origin);
        await Promise.all(assets.map((url) => cacheUrl(cache, url)));
      }
    } catch {
      // La navegación online volverá a poblar el caché del shell.
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key === "almacen-v4" || (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME))
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  const appDocument = request.mode === "navigate" || ["index.html", "manifest.webmanifest", "manus-routes.json"].includes(requestUrl.pathname.split("/").pop());
  if (appDocument) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request))
          || (await caches.match(new URL("./", self.registration.scope).href))
          || new Response("SalsaLog está sin conexión. Vuelve a intentarlo cuando haya red.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      return new Response("Recurso no disponible sin conexión.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
  })());
});
