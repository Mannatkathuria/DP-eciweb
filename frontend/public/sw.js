// ECIWEB service worker: keeps the application shell available offline so the poll-day screen
// opens without a connection. API responses are never cached here: offline poll-day data lives in
// the signed, encrypted station package in IndexedDB, and offline marks in the outbox.
const CACHE = "eciweb-shell-v1";
const SHELL = ["/", "/index.html", "/favicon.svg"];

self.addEventListener("install", (event) => {
    event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
    const req = event.request;
    const url = new URL(req.url);
    if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/") || url.pathname.startsWith("/socket.io")) return;
    if (req.mode === "navigate") {
        // Network first for pages, so a deployment is picked up at once; the cached shell offline.
        event.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put("/index.html", copy)); return res; })
            .catch(() => caches.match("/index.html")));
        return;
    }
    if (url.pathname.startsWith("/assets/")) {
        // Built assets have content hashes in their names, so a cached copy is always correct.
        event.respondWith(caches.match(req).then((hit) => hit ?? fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })));
    }
});
// Background sync: wake an open poll-day screen to send its outbox (the device secret stays with the page).
self.addEventListener("sync", (event) => {
    if (event.tag !== "eciweb-outbox") return;
    event.waitUntil(self.clients.matchAll({ type: "window" }).then((clients) => clients.forEach((c) => c.postMessage({ type: "sync-outbox" }))));
});
