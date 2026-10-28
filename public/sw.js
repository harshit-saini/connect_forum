/*
 * Connect service worker.
 *
 * Privacy rule: this worker never stores a page or an API response. The ONLY things it caches are
 * immutable static assets (/_next/static, /icons) and one self-contained offline page. Everything
 * else (/api/*, sign-in and other auth routes, and every page that can show a phone number
 * such as /seeker/connections/*) is not intercepted at all, so it goes straight to the network and
 * cannot end up in any cache. Navigations are network-only; when the network is down they get /offline.html.
 *
 * Bump VERSION when this file or /offline.html changes.
 */
const VERSION = "v1";
const STATIC_CACHE = `connect-static-${VERSION}`;
const PRECACHE = ["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png"];

// Only these paths may ever be cached.
const CACHEABLE = [/^\/_next\/static\//, /^\/icons\//, /^\/offline\.html$/];
// Documented explicitly (and unit-tested): these are never cached, whatever else changes.
const NEVER_CACHE = [/^\/api\//, /^\/sign-in/, /^\/seeker\/connections/, /^\/seeker\/rate/, /^\/onboarding/, /^\/profile/, /^\/admin/, /^\/settings/];

/** "static" | "navigate" | "pass" for a same-origin GET request. */
function classify(method, pathname, mode) {
  if (method !== "GET") return "pass";
  if (NEVER_CACHE.some((re) => re.test(pathname))) return mode === "navigate" ? "navigate" : "pass";
  if (CACHEABLE.some((re) => re.test(pathname))) return "static";
  return mode === "navigate" ? "navigate" : "pass";
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("connect-") && k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === "basic" && !/no-store/i.test(response.headers.get("cache-control") || "")) {
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const kind = classify(request.method, url.pathname, request.mode);
  if (kind === "static") {
    event.respondWith(cacheFirst(request));
  } else if (kind === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
  }
  // "pass": not intercepted, so the browser goes to the network and nothing is stored.
});

// Exposed for unit tests only.
if (typeof self.__SW_TEST__ !== "undefined") self.__SW_TEST__.classify = classify;
