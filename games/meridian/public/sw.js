// Offline support: cache the game's files the first time they load, then serve them from cache.
// Bump the number when this file changes, so phones drop the old cache.
const CACHE = "meridian-v5"; // v5: re-rendered panoramas and new terrain

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "./index.html", "./manifest.webmanifest", "./icon.svg", "./icon-192.png", "./icon-512.png", "./backgrounds/key-art-sm.webp"])));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

// Pages and the install file go to the network first, so a new version reaches players on their
// next visit. If the network is down, the cached copy is used (offline play still works).
// Everything else (scripts and styles have a content hash in their name, so a new build has new
// names) is served from the cache first, which is fast and also works offline. Chapter
// backdrops (backgrounds/*.webp) are cached the first time each chapter is played.
const isPage = (request) => request.mode === "navigate" || /\/(index\.html|manifest\.webmanifest)$/.test(new URL(request.url).pathname);

const store = (request, res) => {
  if (res.ok && new URL(request.url).origin === self.location.origin) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(request, copy));
  }
  return res;
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (isPage(request)) {
    event.respondWith(
      fetch(request)
        .then((res) => store(request, res))
        .catch(() => caches.match(request).then((hit) => hit || caches.match("./index.html"))),
    );
    return;
  }
  event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((res) => store(request, res))));
});
