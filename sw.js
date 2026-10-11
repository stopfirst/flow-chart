/* 앱 셸만 캐시 (API 응답은 캐시하지 않음 → 항상 최신 데이터) */
const CACHE = 'fc-shell-v3';
const SHELL = ['./', 'index.html', 'css/style.css', 'js/calc.js', 'js/data.js', 'js/render.js', 'js/picker.js', 'js/app.js', 'manifest.webmanifest', 'icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return; // 외부 API는 그대로 네트워크
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});
