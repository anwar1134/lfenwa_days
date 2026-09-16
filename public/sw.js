// Lfnawa Days shell service worker — Next.js static-export edition.
//
// Cache name is namespaced (not just "v1"/"v2") so this SW's cleanup
// step only ever deletes ITS OWN old versions, never the independent
// cache the embedded Lfenwa Trades mini-app's own service worker
// (public/trades/sw.js, registered at a separate "/trades/" scope)
// keeps under the SAME per-origin Cache Storage. Bump the trailing
// number whenever the caching strategy below changes.
//
// This replaces the previous fixed-filename precache list
// ("/life-bundle.js", etc.) from the pre-Next.js build: `next build`
// produces content-hashed chunk filenames under /_next/static/ that
// change on every build, so this version caches by PATTERN instead of
// by exact filename. Content-hashed files are safe to cache
// aggressively (a new build always gets new filenames); HTML
// navigations and the one fixed-name file that matters most --
// Lfenwa Trades' bundle.js -- stay network-first, exactly like before,
// so a code update is visible on the very next load instead of
// waiting for a separate service-worker upgrade cycle.
const CACHE_NAME = "lfnawa-days-shell-v3";

const PRECACHE_URLS = [
  "/",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/capacitor-bridge.js",
  "/trades/index.html",
  "/trades/bundle.js",
  "/trades/manifest.json",
  "/trades/capacitor-bridge.js",
  "/trades/sw.js",
];

function isNextImmutableAsset(url) {
  return url.pathname.startsWith("/_next/static/");
}

function isTradesBundle(url) {
  return url.pathname.endsWith("/trades/bundle.js");
}

function isNavigation(request, url) {
  return request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html") || url.pathname.endsWith(".html");
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        // Promise.allSettled, not cache.addAll: a single missing/failing
        // resource must never fail the *entire* install and leave an old
        // service worker stuck in control indefinitely.
        Promise.allSettled(PRECACHE_URLS.map((f) => cache.add(f)))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME && k.startsWith("lfnawa-days-shell-")).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  // Next's own build assets are content-hashed and therefore immutable:
  // a given URL's bytes never change, so cache-first is both safe and
  // fast, with no staleness risk.
  if (isNextImmutableAsset(url)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((resp) => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return resp;
        });
      })
    );
    return;
  }

  // HTML navigations and Lfenwa Trades' own bundle: always prefer live
  // content when reachable, falling back to cache only when offline.
  // This is exactly how "only the old app appears after an update" bugs
  // are avoided -- see docs/ARCHITECTURE.md §10 and
  // docs/NEXTJS_MIGRATION.md.
  if (isNavigation(event.request, url) || isTradesBundle(url)) {
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return resp;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/")))
    );
    return;
  }

  // Everything else (icons, manifest, capacitor-bridge.js, trades'
  // other static files): cache-first, background-refresh.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((resp) => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return resp;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
