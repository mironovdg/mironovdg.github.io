// Книга без сети (решение ученика, 25.09.2026): страница и шрифты сохраняются на устройстве.
// Сеть — первой, чтобы новая глава была видна сразу, но не дольше 4 с: в поезде с плохой связью
// книга открывается из сохранённой копии, а свежая докачивается в фоне и пригодится в следующий раз.
// Запросы к таблице (синхронизация, отчёты) сюда не попадают — их книга копит сама и досылает.
// Сборка сайта ставит в BUILD время выпуска: новый файл — новая установка и свежая копия книги.
const BUILD = "2026-09-25T21:22:45";
const PAGE_CACHE = "bs-book";
const FONT_CACHE = "bs-fonts";
const WAIT_MS = 4000;

function pageKey() { return new URL("./", self.registration.scope).href; }

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(PAGE_CACHE)
      .then(function (c) {
        return fetch(new Request(pageKey(), { cache: "reload" })).then(function (r) {
          if (r.ok) return c.put(pageKey(), r);
        });
      })
      .catch(function () {})
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(self.clients.claim().then(notify));
});

function notify() {
  return self.clients.matchAll({ includeUncontrolled: true }).then(function (list) {
    list.forEach(function (c) { c.postMessage({ type: "bs-cached", build: BUILD }); });
  });
}

function isBookPage(url) {
  const scope = new URL(self.registration.scope);
  return url.origin === scope.origin && (url.pathname === scope.pathname || url.pathname === scope.pathname + "index.html");
}

self.addEventListener("fetch", function (e) {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (req.mode === "navigate" && isBookPage(url)) { e.respondWith(page(e)); return; }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") e.respondWith(font(req));
});

function page(e) {
  const key = pageKey();
  const net = fetch(e.request).then(function (r) {
    if (r.ok) {
      const copy = r.clone();
      e.waitUntil(caches.open(PAGE_CACHE).then(function (c) { return c.put(key, copy); }).then(notify));
    }
    return r;
  });
  e.waitUntil(net.then(function () {}, function () {}));
  const timer = new Promise(function (res) { setTimeout(function () { res(null); }, WAIT_MS); });
  return Promise.race([net.catch(function () { return null; }), timer]).then(function (first) {
    if (first && first.ok) return first;
    return caches.match(key).then(function (hit) {
      if (hit) return hit;
      return first || net;           // копии ещё нет — ждём сеть до конца
    });
  });
}

function font(req) {
  return caches.open(FONT_CACHE).then(function (c) {
    return c.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (r) {
        if (r.ok || r.type === "opaque") c.put(req, r.clone());
        return r;
      }).catch(function () { return Response.error(); });
    });
  });
}
