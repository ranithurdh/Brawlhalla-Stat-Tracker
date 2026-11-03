// Service worker: makes the app installable and lets the app shell open offline.
// - /api/* is never cached (match data and admin actions must always be live).
// - Page navigations: network first, falling back to the cached app shell.
// - Built assets (/assets/*, icons) and Google Fonts: cached after first use.
// Bump VERSION to force old caches to be cleared.
const VERSION = "v1";
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const FONTS = `fonts-${VERSION}`;
const KEEP = [SHELL, ASSETS, FONTS];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(["/", "/manifest.webmanifest", "/icons/icon-192.png"]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirstPage(request) {
  const cache = await caches.open(SHELL);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) cache.put("/", fresh.clone());
    return fresh;
  } catch {
    return (await cache.match("/")) || Response.error();
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === "opaque") cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const update = fetch(request)
    .then((res) => {
      if (res.ok || res.type === "opaque") cache.put(request, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || update;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/api/")) return; // always live
    if (request.mode === "navigate") {
      event.respondWith(networkFirstPage(request));
      return;
    }
    if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
      event.respondWith(cacheFirst(request, ASSETS));
      return;
    }
    if (url.pathname === "/manifest.webmanifest") {
      event.respondWith(staleWhileRevalidate(request, SHELL));
    }
    return;
  }

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(request, FONTS));
  }
});
