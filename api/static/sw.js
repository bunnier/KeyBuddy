// sw.js —— Service Worker，提供 PWA 离线缓存。
// iPad "添加到主屏幕" 后，可全屏、可离线打开（缓存了应用外壳与静态资源）。
const CACHE = "keyboard-v1";
const ASSETS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/assets/css/style.css",
  "/assets/js/keyboard.js",
  "/assets/js/typing.js",
  "/assets/js/app.js",
  "/assets/icons/icon-180.png",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) {
        return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api/")) return; // 接口不缓存，始终走网络

  // 导航请求：网络优先，失败回退到缓存的首页（离线可用）。
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request).catch(function () { return caches.match("/index.html"); })
    );
    return;
  }

  // 其他静态资源：网络优先（保证开发时拿到最新），失败时回退到缓存（离线可用）。
  e.respondWith(
    fetch(e.request).then(function (resp) {
      const copy = resp.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return resp;
    }).catch(function () {
      return caches.match(e.request);
    })
  );
});
