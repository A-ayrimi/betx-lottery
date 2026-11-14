// Build the service worker after `next build`:
//  - precache the offline shell + icons/og image
//  - content-hash static assets (immutable cache)
//  - version the cache with the build id so every deploy invalidates itself
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const buildId = fs.readFileSync(path.join(root, ".next", "BUILD_ID"), "utf8").trim();
const shell = ["/", "/en", "/en/install", "/offline.html", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png", "/icons/apple-touch-icon.png", "/og.png"];

const sw = `/* BETX service worker — generated at build time (build ${buildId}) */
const VERSION = "betx-${buildId}";
const SHELL = ${JSON.stringify(shell)};

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

  // immutable hashed assets: cache-first
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/og.png") {
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
`;
fs.writeFileSync(path.join(root, "public", "sw.js"), sw);
console.log("service worker written for build", buildId);
