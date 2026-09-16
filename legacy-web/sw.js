// Lfnawa Days shell service worker.
//
// Cache name is namespaced (not just "v1"/"v2") so this SW's cleanup
// step only ever deletes ITS OWN old versions, never the independent
// cache the embedded Lfenwa Trades mini-app's own service worker
// (app/trades/sw.js, registered at a separate "/trades/" scope) keeps
// under the SAME per-origin Cache Storage. Bump the trailing number
// whenever SHELL_FILES changes.
const CACHE_NAME = "lfnawa-days-shell-v2";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./life-bundle.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./trades/index.html",
  "./trades/bundle.js",
  "./trades/manifest.json",
  "./trades/capacitor-bridge.js",
];

// Requests where serving something even one build stale is worse than
// a slightly slower load: the shell's own HTML/JS entry points, plus
// the embedded Lfenwa Trades entry points. A stale copy of any of
// these is exactly how "only the old app appears" bugs happen after
// an update -- see docs/ARCHITECTURE.md §10. Everything else (icons,
// manifest) rarely changes, so cache-first there is fine and faster.
function isShellCritical(url) {
  return (
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/life-bundle.js") ||
    url.pathname.endsWith("/trades/bundle.js")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        // Promise.allSettled, not cache.addAll: a single missing/failing
        // resource (a transient network hiccup, a path that doesn't
        // resolve under some packaging edge case, etc.) must never fail
        // the *entire* install and leave an old service worker stuck in
        // control indefinitely. Whatever succeeds gets cached; whatever
        // fails just isn't precached yet and will be picked up by the
        // fetch handler's normal network-first/cache-first paths later.
        Promise.allSettled(SHELL_FILES.map((f) => cache.add(f)))
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

  if (isShellCritical(url)) {
    // Network-first: always prefer live content when reachable at all,
    // so a code update is visible on the very next load instead of
    // waiting for a separate service-worker upgrade cycle. Falls back
    // to cache only when the network genuinely fails (offline).
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          if (resp && resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return resp;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first, background-refresh for everything else (icons, manifest).
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
