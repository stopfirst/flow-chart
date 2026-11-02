/* 앱 셸만 캐시 (API 응답은 캐시하지 않음 → 항상 최신 데이터) */
const CACHE = 'fc-shell-v11';
const V = '?v=11'; // index.html의 스크립트 버전과 맞춤 (구버전 JS 캐시 방지)
const SHELL = ['./', 'index.html', 'css/style.css' + V, ...['calc', 'ca', 'data', 'render', 'picker', 'app'].map(f => `js/${f}.js${V}`), 'manifest.webmanifest', 'icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return; // 외부 API는 그대로 네트워크
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request)));
});
