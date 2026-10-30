// Service worker: يفتح التطبيق بسرعة حتى لو النت ضعيف. البيانات نفسها دايمًا من الإنترنت.
const V = "wo-v19", SHELL = ["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/splash-logo.png", "icons/app-logo.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET") return;
  if (u.origin === location.origin) {
    e.respondWith(fetch(r).then(res => { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); return res; }).catch(() => caches.match(r)));
  } else if ((u.hostname === "www.gstatic.com" || u.hostname === "cdnjs.cloudflare.com")) {
    e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); return res; })));
  }
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: "window" }).then(cs => cs.length ? cs[0].focus() : clients.openWindow("./")));
});
