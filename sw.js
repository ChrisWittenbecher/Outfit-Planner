const VERSION = '1.8.0';
const CACHE = 'anprobe-' + VERSION;
const HOME = new URL('index.html', self.registration.scope).href;

async function appFiles() {
  const page = await fetch(HOME, { cache: 'reload', credentials: 'omit' });
  const html = (await page.text()).slice(0, 200000);
  const found = [...html.matchAll(/<(?:link|script)\b[^>]*?\s(?:href|src)="([^"]+)"/gi)].map(m => m[1]);
  const extra = ['manifest.webmanifest', 'version.json', 'assets/icons/icon192.png', 'assets/icons/icon512.png', 'assets/icons/apple-touch-180.png'];
  const urls = new Set([HOME]);
  for (const h of [...found, ...extra]) {
    let u;
    try { u = new URL(h, HOME); } catch { continue; }
    if (u.origin === location.origin && u.href.startsWith(self.registration.scope) && !u.search) urls.add(u.href);
  }
  return [...urls].slice(0, 80);
}

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const urls = await appFiles();
    await Promise.all(urls.map(async u => {
      const r = await fetch(u, { cache: 'reload', credentials: 'omit' });
      if (!r.ok) throw new Error(u + ' ' + r.status);
      await cache.put(u, r);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('anprobe-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function fresh(req) {
  try {
    const r = await fetch(req);
    if (r.ok) await (await caches.open(CACHE)).put(req.url.split('?')[0], r.clone());
    return r;
  } catch (err) {
    const hit = await caches.match(req.url.split('?')[0]);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || !url.href.startsWith(self.registration.scope)) return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.match(HOME).then(hit => hit || fetch(req)));
    return;
  }
  if (url.pathname.endsWith('/version.json') || req.cache === 'reload' || req.cache === 'no-store') {
    e.respondWith(fresh(req));
    return;
  }
  e.respondWith(caches.match(url.href.split('?')[0]).then(hit => hit || fresh(req)));
});
