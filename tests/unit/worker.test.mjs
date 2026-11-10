import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkTarget, extractProduct, handle, loadImage, loadProduct, sniffImage } from '../../worker/anprobe-worker.js';

const ORIGIN = 'https://chriswittenbecher.github.io';
const req = (path, origin = ORIGIN, method = 'GET') => new Request('https://w.example' + path, { method, headers: origin ? { origin } : {} });
const html = (body, type = 'text/html; charset=utf-8') => new Response(body, { headers: { 'content-type': type } });
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0]);

test('Zieladressen: nur https, nur Domainnamen', () => {
  for (const ok of ['https://www.shop.de/p/1?x=2', 'https://shop.example/a#frag']) assert.equal(checkTarget(ok).ok, true, ok);
  for (const bad of ['http://shop.de/', 'ftp://shop.de/', 'https://localhost/', 'https://127.0.0.1/', 'https://10.0.0.5/x', 'https://2130706433/', 'https://0x7f000001/', 'https://[::1]/', 'https://intern/', 'https://nas.local/', 'https://a.workers.dev/', 'https://user:pw@shop.de/', 'https://shop.de:8443/', 'https://shop.de./', '', 'kein link', 'https://' + 'a'.repeat(2100) + '.de/'])
    assert.equal(checkTarget(bad).ok, false, bad);
  assert.equal(checkTarget('https://shop.de/a#frag').url, 'https://shop.de/a');
});

test('Produktdaten aus JSON-LD und Meta', async () => {
  const a = extractProduct(await readFile(new URL('../fixtures/shop-jsonld.html', import.meta.url), 'utf8'), 'https://www.shop.example/p/x');
  assert.deepEqual(a, { name: 'Wollmantel Oslo', price: '189.90', currency: 'EUR', url: 'https://www.shop.example/p/wollmantel-123', image: 'https://www.shop.example/img/mantel.jpg', color: 'Dark Navy', brand: 'Nordlys' });
  const b = extractProduct(await readFile(new URL('../fixtures/shop-meta.html', import.meta.url), 'utf8'), 'https://shop.example/s');
  assert.equal(b.name, 'Sneaker Court'); assert.equal(b.currency, 'CHF'); assert.equal(b.brand, 'Läufer');
  const c = extractProduct(await readFile(new URL('../fixtures/shop-leer.html', import.meta.url), 'utf8'), 'https://shop.example/e');
  assert.equal(c.name, 'Nur ein Titel'); assert.equal(c.price, ''); assert.equal(c.image, '');
});

test('Texte werden bereinigt und gekürzt', () => {
  const o = extractProduct(`<title>${'x'.repeat(500)}</title><meta property="og:image" content="javascript:alert(1)">`, 'https://s.example/p');
  assert.equal(o.name.length, 200);
  const e = extractProduct('<meta property="og:title" content="Hemd &amp; Hose &#x41;">', 'https://s.example/p');
  assert.equal(e.name, 'Hemd & Hose A');
});

test('Bildformate werden an den Bytes erkannt, SVG nicht', () => {
  assert.equal(sniffImage(PNG), 'image/png');
  assert.equal(sniffImage(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), '');
});

test('Weiterleitungen werden einzeln geprüft', async () => {
  const seen = [];
  const f = async url => { seen.push(url); return url.includes('start') ? new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/geheim' } }) : html('x'); };
  await assert.rejects(loadProduct('https://shop.example/start', f), /bad_url/);
  assert.deepEqual(seen, ['https://shop.example/start']);
  const loop = async () => new Response(null, { status: 302, headers: { location: 'https://shop.example/again' } });
  await assert.rejects(loadProduct('https://shop.example/a', loop), /too_many_redirects/);
});

test('zu große oder falsche Antworten werden abgelehnt', async () => {
  await assert.rejects(loadProduct('https://s.example/a', async () => html('x'.repeat(1_600_000))), /too_large/);
  await assert.rejects(loadProduct('https://s.example/a', async () => html('{}', 'application/json')), /not_html/);
  await assert.rejects(loadImage('https://s.example/a.png', async () => new Response('<svg/>', { headers: { 'content-type': 'image/svg+xml' } })), /not_image/);
  await assert.rejects(loadProduct('https://s.example/a', async () => new Response('nein', { status: 404 })), /not_found/);
});

test('nur die eigene App darf den Dienst nutzen', async () => {
  const f = async () => html('<title>Hemd</title>');
  assert.equal((await handle(req('/product?u=https://s.example/a', ''), {}, f)).status, 403);
  assert.equal((await handle(req('/product?u=https://s.example/a', 'https://boese.example'), {}, f)).status, 403);
  const ok = await handle(req('/product?u=' + encodeURIComponent('https://s.example/a')), {}, f);
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  assert.equal((await ok.json()).name, 'Hemd');
  assert.equal((await handle(req('/product?u=x', ORIGIN, 'POST'), {}, f)).status, 405);
  assert.equal((await handle(req('/product?u=http://127.0.0.1/', ORIGIN), {}, f)).status, 400);
  assert.equal((await handle(req('/anders?u=https://s.example/a'), {}, f)).status, 404);
  assert.equal((await handle(req('/product?u=https://s.example/a', 'http://localhost:8000'), { EXTRA_ORIGIN: 'http://localhost:8000' }, f)).status, 200);
});

test('Bild wird mit geprüftem Typ ausgeliefert, Rate-Limit greift', async () => {
  const f = async () => new Response(PNG, { headers: { 'content-type': 'text/plain' } });
  const r = await handle(req('/image?u=' + encodeURIComponent('https://s.example/a')), {}, f);
  assert.equal(r.headers.get('content-type'), 'image/png');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  const limited = await handle(req('/product?u=https://s.example/a'), { LIMITER: { limit: async () => ({ success: false }) } }, f);
  assert.equal(limited.status, 429);
});

test('Adresse des Dienstes steht in der Inhaltsrichtlinie (oder die Funktion ist aus)', async () => {
  const cfg = await readFile(new URL('../../js/config.js', import.meta.url), 'utf8');
  const url = (cfg.match(/WORKER_URL = '([^']*)'/) || [])[1];
  assert.notEqual(url, undefined);
  const page = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  const connect = page.match(/connect-src ([^;"]*)/)[1].split(' ');
  if (url) { assert.match(url, /^https:\/\/[a-z0-9.-]+$/); assert.ok(connect.includes(url), 'connect-src enthält ' + url); }
  else assert.ok(!connect.some(c => c.includes('workers.dev')), 'ohne Dienst keine workers.dev-Freigabe');
  assert.ok(!connect.includes('*') && !connect.some(c => c.startsWith('https://*')), 'keine Platzhalter in connect-src');
});
