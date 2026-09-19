/**
 * Baseline Service Worker
 * Technical Concept: Service Workers
 * A service worker runs in the background as a client-side network proxy, caching core HTML/CSS/JS assets
 * so the application loads instantly and functions reliably even during spotty connectivity or offline clinic visits.
 */

const CACHE_NAME = "baseline-cache-v3";   // bump to throw away older cached copies
const ASSETS_TO_CACHE = [
  "./",
  "app.html",
  "index.html",
  "login.html",
  "styles.css",
  "config.js",
  "i18n.js",
  "mock.js",
  "api.js",
  "mascot.js",
  "app.js",
  "manifest.json",
  "mascot/wave.svg",
  "mascot/reading.svg",
  "mascot/pointing.svg",
  "mascot/smile.svg",
  "mascot/calendar.svg",
  "mascot/shrug.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Only our own page files. API calls (another origin) go straight to the network, never cached.
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  // Network first, so updates show up immediately; the cached copy is only an offline fallback.
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        const copy = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return networkResponse;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("app.html")))
  );
});
