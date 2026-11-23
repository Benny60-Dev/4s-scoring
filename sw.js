// 4S Scoring offline helper: keeps a copy of the app on the phone so it opens with no signal.
// Scores and round data are kept separately by the app itself (saved on the phone).
const CACHE = '4s-app-v1';
const STATIC = ['./', 'index.html', 'manifest.webmanifest', 'logo-640.webp', 'mark-120.webp', 'mark-120.png', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'favicon-64.png'];

async function precache() {
  const c = await caches.open(CACHE);
  await Promise.all(STATIC.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
  // Also grab the exact app files this version uses (they have ?v= numbers in their names).
  try {
    const html = await (await fetch('index.html', { cache: 'reload' })).text();
    const files = [...html.matchAll(/(?:src|href)="([^"]+\?v=\d+)"/g)].map(m => m[1]);
    for (const f of files) {
      const r = await fetch(f, { cache: 'reload' }); if (r.ok) await c.put(f, r.clone());
      if (/app\.js/.test(f)) {
        const js = await r.text();
        for (const m of js.matchAll(/from '\.\/([^']+\?v=\d+)'/g)) { const r2 = await fetch(m[1], { cache: 'reload' }); if (r2.ok) await c.put(m[1], r2); }
      }
    }
  } catch (e) { /* offline during install: the app files get saved the next time they load */ }
}

self.addEventListener('install', e => { e.waitUntil(precache().then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function withTimeout(p, ms) { return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('slow')), ms); p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); }); }); }

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // the database is handled by the app
  if (url.pathname.endsWith('version.json') || url.pathname.endsWith('sw.js')) return;
  // Files with a version number never change: use the saved copy first.
  if (url.search.includes('v=')) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok) caches.open(CACHE).then(c => c.put(req, r.clone())); return r; })));
    return;
  }
  // The page itself and pictures: try the internet (up to 4 seconds), otherwise the saved copy.
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    try {
      const r = await withTimeout(fetch(req), 4000);
      if (r.ok) c.put(req.mode === 'navigate' ? './' : req, r.clone());
      return r;
    } catch (err) {
      return (await c.match(req, { ignoreSearch: req.mode === 'navigate' })) || (req.mode === 'navigate' ? await c.match('./') || await c.match('index.html') : undefined) || Response.error();
    }
  })());
});
