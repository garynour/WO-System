// Service worker: يفتح التطبيق بسرعة حتى لو النت ضعيف. البيانات نفسها دايمًا من الإنترنت.
const V = "wo-v3", SHELL = ["./", "index.html", "manifest.webmanifest", "icons/icon-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET") return;
  if (u.origin === location.origin) {            // ملفات التطبيق: الأحدث أولًا، والكاش لو مفيش نت
    e.respondWith(fetch(r).then(res => { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); return res; }).catch(() => caches.match(r)));
  } else if ((u.hostname === "www.gstatic.com" || u.hostname === "cdnjs.cloudflare.com")) { // مكتبات Firebase: من الكاش بعد أول مرة
    e.respondWith(caches.match(r).then(m => m || fetch(r).then(res => { const cp = res.clone(); caches.open(V).then(c => c.put(r, cp)); return res; })));
  }
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: "window" }).then(cs => cs.length ? cs[0].focus() : clients.openWindow("./")));
});
