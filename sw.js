// Byte's AI 101 service worker: precached app shell, cache-first for everything else.
// Cache names start with `bt-` and activate only ever deletes `bt-` caches, so a sibling app on the same origin keeps its own.
// BUMP `VERSION` on every release: the old cache is deleted on activate. The shell list lives in precache.json (tools/gen_precache.mjs).
const VERSION = 'bt-v3';
const CORE = ['./', 'index.html', 'style.css', 'css/screens.css', 'manifest.webmanifest', 'js/main.js'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    let list = CORE;
    try { list = (await (await fetch('precache.json', { cache: 'no-store' })).json()).files; } catch (_) { /* fall back to CORE; the rest caches lazily */ }
    // one failing file must not abort the install: add individually, in small parallel batches
    for (let i = 0; i < list.length; i += 8) {
      await Promise.all(list.slice(i, i + 8).map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('bt-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

// Audio elements ask for byte ranges: serve them from the cached full file (Safari refuses a 200 for a Range request).
async function rangeResponse(req, full) {
  const buf = await full.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  const s = m && m[1] ? +m[1] : 0, e = m && m[2] ? Math.min(+m[2], buf.byteLength - 1) : buf.byteLength - 1;
  return new Response(buf.slice(s, e + 1), { status: 206, headers: { 'Content-Type': full.headers.get('Content-Type') || 'audio/mpeg', 'Content-Range': `bytes ${s}-${e}/${buf.byteLength}`, 'Content-Length': String(e - s + 1) } });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const key = new Request(req.url);                       // ignore Range / headers when matching
    let hit = await cache.match(key, { ignoreSearch: req.mode === 'navigate' });   // ?debug=... style navigations still hit index.html
    if (!hit) {
      try {
        const res = await fetch(req.headers.has('range') ? key : req);   // full file for range requests
        if (res.ok && res.status === 200) cache.put(key, res.clone());
        hit = res;
      } catch (err) {
        if (req.mode === 'navigate') hit = await cache.match('index.html');
        if (!hit) throw err;
      }
    }
    return req.headers.has('range') && hit.status === 200 ? rangeResponse(req, hit) : hit;
  })());
});
