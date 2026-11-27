/* BETX service worker — generated at build time (build dzrNYY5JY-ndHhoO6wGSE) */
const VERSION = "betx-dzrNYY5JY-ndHhoO6wGSE-r2";
const SHELL = ["/","/en","/en/install","/offline.html","/manifest.webmanifest","/icons/icon-192.png","/icons/icon-512.png","/icons/maskable-512.png","/icons/apple-touch-icon.png","/og.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL).catch(() => undefined)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // never cache money: API, wallet, cron, admin and RSC/payload requests stay network-only
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/admin") || url.searchParams.has("_rsc")) return;

  // app bundles: network-first so dev/HMR and new builds never serve stale chunks
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => undefined);
        return res;
      }).catch(async () => (await caches.match(req)) || Response.error())
    );
    return;
  }

  // immutable brand assets: cache-first
  if (url.pathname.startsWith("/icons/") || url.pathname === "/og.png") {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => undefined);
        return res;
      }))
    );
    return;
  }

  // navigations: network-first, fall back to the cached shell, then to /offline.html
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/offline.html")))
    );
  }
});
