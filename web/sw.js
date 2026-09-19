/**
 * Baseline Service Worker
 * Technical Concept: Service Workers
 * A service worker runs in the background as a client-side network proxy, caching core HTML/CSS/JS assets
 * so the application loads instantly and functions reliably even during spotty connectivity or offline clinic visits.
 */

const CACHE_NAME = "baseline-cache-v1";
const ASSETS_TO_CACHE = [
  "./",
  "app.html",
  "index.html",
  "styles.css",
  "config.js",
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
  // Only handle GET requests for our origin
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        return networkResponse;
      }).catch(() => {
        // Fallback if offline
        return caches.match("app.html");
      });
    })
  );
});
