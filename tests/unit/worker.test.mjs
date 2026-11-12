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
  assert.deepEqual(a, { name: 'Wollmantel Oslo', price: '189.90', currency: 'EUR', url: 'https://www.shop.example/p/wollmantel-123', image: 'https://www.shop.example/img/mantel.jpg', images: ['https://www.shop.example/img/mantel.jpg', 'https://cdn.shop.example/2.jpg'], color: 'Dark Navy', brand: 'Nordlys' });
  const b = extractProduct(await readFile(new URL('../fixtures/shop-meta.html', import.meta.url), 'utf8'), 'https://shop.example/s');
  assert.equal(b.name, 'Sneaker Court'); assert.equal(b.currency, 'CHF'); assert.equal(b.brand, 'Läufer');
  const c = extractProduct(await readFile(new URL('../fixtures/shop-leer.html', import.meta.url), 'utf8'), 'https://shop.example/e');
  assert.equal(c.name, 'Nur ein Titel'); assert.equal(c.price, ''); assert.equal(c.image, '');
});

test('Alle Produktbilder werden gesammelt: einmalig, https, höchstens acht', () => {
  const ld = JSON.stringify({ '@type': 'Product', name: 'X', image: ['/a.jpg', { url: 'https://c.example/b.jpg' }, 'http://unsicher.example/c.jpg', '/a.jpg', 'javascript:alert(1)'] });
  const metas = Array.from({ length: 12 }, (_, i) => `<meta property="og:image" content="/m${i}.jpg">`).join('');
  const o = extractProduct(`<script type="application/ld+json">${ld}</script>${metas}`, 'https://s.example/p');
  assert.equal(o.image, 'https://s.example/a.jpg');
  assert.equal(o.images.length, 8);
  assert.equal(new Set(o.images).size, 8);
  assert.ok(o.images.every(u => u.startsWith('https://')));
  assert.deepEqual(o.images.slice(0, 2), ['https://s.example/a.jpg', 'https://c.example/b.jpg']);
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
  assert.equal((await handle(req('/product?u=https://s.example/a', 'https://outfit-planner.org.boese.example'), {}, f)).status, 403);
  for (const o of ['https://outfit-planner.org', 'https://www.outfit-planner.org']) assert.equal((await handle(req('/product?u=https://s.example/a', o), {}, f)).status, 200, o);
  assert.equal((await handle(req('/product?u=https://s.example/a', 'http://outfit-planner.org'), {}, f)).status, 403);
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

// ---- Google-Anmeldung ----
const ENV = { GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'geheim-geheim' };
const VERIFIER = 'a'.repeat(43), CODE = '4/0AbCdEfGhIj-klmno';
const post = (path, body, { origin = 'https://outfit-planner.org', type = 'application/json' } = {}) =>
  new Request('https://w.example' + path, { method: 'POST', headers: { origin, 'content-type': type }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const google = (data, status = 200) => { const calls = []; const f = async (url, init) => { calls.push({ url, body: init.body.toString(), redirect: init.redirect }); return new Response(JSON.stringify(data), { status }); }; f.calls = calls; return f; };

test('Anmeldung: Code wird gegen Tokens getauscht, nur Nötiges kommt zurück', async () => {
  const f = google({ access_token: 'ya29.token-1234567', expires_in: 3599, refresh_token: '1//refresh-token-123', scope: 'https://www.googleapis.com/auth/drive.appdata', id_token: 'GEHEIM', extra: 1 });
  const r = await handle(post('/auth/token', { code: CODE, verifier: VERIFIER, redirect: 'https://outfit-planner.org/' }), ENV, f);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { access_token: 'ya29.token-1234567', expires_in: 3599, refresh_token: '1//refresh-token-123', scope: 'https://www.googleapis.com/auth/drive.appdata' });
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('access-control-allow-origin'), 'https://outfit-planner.org');
  const sent = new URLSearchParams(f.calls[0].body);
  assert.equal(f.calls[0].url, 'https://oauth2.googleapis.com/token');
  assert.equal(sent.get('grant_type'), 'authorization_code'); assert.equal(sent.get('client_secret'), 'geheim-geheim'); assert.equal(sent.get('code_verifier'), VERIFIER);
  assert.equal(sent.get('redirect_uri'), 'https://outfit-planner.org/');
  assert.equal(f.calls[0].redirect, 'manual', 'Cloudflare kennt nur follow und manual (error wirft einen Fehler)');
});

test('Anmeldung: Fehlercode von Google erscheint kurz in der Antwort, Texte nie', async () => {
  const f = async () => new Response(JSON.stringify({ error: 'invalid_client', error_description: 'GEHEIM client_secret=abc' }), { status: 401 });
  const r = await handle(post('/auth/refresh', { refresh_token: 'x'.repeat(40) }), ENV, f);
  assert.equal(r.status, 502);
  const t = await r.text();
  assert.deepEqual(JSON.parse(t), { error: 'upstream', detail: 'invalid_client' });
  assert.ok(!/GEHEIM|abc/.test(t));
  const g = async () => new Response(JSON.stringify({ error: '<script>alert(1)</script>' }), { status: 400 });
  assert.deepEqual(await (await handle(post('/auth/refresh', { refresh_token: 'x'.repeat(40) }), ENV, g)).json(), { error: 'upstream' });
});

test('Anmeldung: Weiterleitung von Google wird nicht verfolgt und gilt als Fehler', async () => {
  const f = async () => new Response(null, { status: 302, headers: { location: 'https://evil.example/' } });
  const r = await handle(post('/auth/refresh', { refresh_token: 'x'.repeat(40) }), ENV, f);
  assert.equal(r.status, 502);
  assert.deepEqual(await r.json(), { error: 'unreachable' });
});

test('Anmeldung: Auffrischen und Abmelden', async () => {
  let f = google({ access_token: 'ya29.neu-12345678', expires_in: 7200 });
  let r = await handle(post('/auth/refresh', { refresh_token: '1//refresh-token-123' }), ENV, f);
  assert.deepEqual(await r.json(), { access_token: 'ya29.neu-12345678', expires_in: 3600 });   // höchstens eine Stunde
  assert.equal(new URLSearchParams(f.calls[0].body).get('grant_type'), 'refresh_token');
  f = google({});
  r = await handle(post('/auth/revoke', { token: '1//refresh-token-123' }), ENV, f);
  assert.deepEqual(await r.json(), { ok: true }); assert.equal(f.calls[0].url, 'https://oauth2.googleapis.com/revoke');
});

test('Anmeldung: unbrauchbare Eingaben werden abgewiesen, bevor Google gefragt wird', async () => {
  const f = google({ access_token: 'x' });
  const cases = [
    ['/auth/token', { code: CODE, verifier: 'kurz', redirect: 'https://outfit-planner.org/' }],
    ['/auth/token', { code: '<script>', verifier: VERIFIER, redirect: 'https://outfit-planner.org/' }],
    ['/auth/token', { code: CODE, verifier: VERIFIER, redirect: 'https://evil.example/' }],
    ['/auth/token', { code: CODE, verifier: VERIFIER, redirect: 'https://outfit-planner.org' }],
    ['/auth/token', { code: CODE, verifier: VERIFIER }],
    ['/auth/refresh', { refresh_token: 'a b' }], ['/auth/refresh', {}], ['/auth/revoke', { token: 5 }],
  ];
  for (const [path, body] of cases) assert.equal((await handle(post(path, body), ENV, f)).status, 400, path + JSON.stringify(body));
  assert.equal((await handle(post('/auth/refresh', '[1]'), ENV, f)).status, 400);
  assert.equal((await handle(post('/auth/refresh', 'kein json'), ENV, f)).status, 400);
  assert.equal((await handle(post('/auth/refresh', { refresh_token: '1//refresh-token-123' }, { type: 'text/plain' }), ENV, f)).status, 400);
  assert.equal((await handle(post('/auth/refresh', 'x'.repeat(5000)), ENV, f)).status, 413);
  assert.equal(f.calls.length, 0);
});

test('Anmeldung: Herkunft, Methode und Einrichtung', async () => {
  const f = google({ access_token: 'x' });
  assert.equal((await handle(post('/auth/refresh', { refresh_token: '1//refresh-token-123' }, { origin: 'https://evil.example' }), ENV, f)).status, 403);
  assert.equal((await handle(req('/auth/refresh', 'https://outfit-planner.org'), ENV, f)).status, 405);   // GET nicht erlaubt
  assert.equal((await handle(post('/product?u=https://a.de/', {}), ENV, f)).status, 405);                    // POST nur für /auth
  const pre = await handle(new Request('https://w.example/auth/token', { method: 'OPTIONS', headers: { origin: 'https://outfit-planner.org' } }), ENV, f);
  assert.equal(pre.status, 204); assert.match(pre.headers.get('access-control-allow-methods'), /POST/); assert.match(pre.headers.get('access-control-allow-headers'), /content-type/i);
  const none = await handle(post('/auth/refresh', { refresh_token: '1//refresh-token-123' }), {}, f);
  assert.equal(none.status, 503); assert.deepEqual(await none.json(), { error: 'not_configured' });
  assert.equal((await handle(post('/auth/unbekannt', {}), ENV, f)).status, 404);
  assert.equal(f.calls.length, 0);
});

test('Anmeldung: Fehler von Google werden eingeordnet, Geheimnisse tauchen nicht auf', async () => {
  let r = await handle(post('/auth/refresh', { refresh_token: '1//refresh-token-123' }), ENV, google({ error: 'invalid_grant', error_description: 'Token has been revoked' }, 400));
  assert.equal(r.status, 400); assert.deepEqual(await r.json(), { error: 'invalid_grant' });
  r = await handle(post('/auth/refresh', { refresh_token: '1//refresh-token-123' }), ENV, google({ error: 'server_error' }, 500));
  assert.equal(r.status, 502); assert.deepEqual(await r.json(), { error: 'upstream', detail: 'server_error' });
  r = await handle(post('/auth/token', { code: CODE, verifier: VERIFIER, redirect: 'https://outfit-planner.org/' }), ENV, google({ access_token: 'ya29.token-1234567', scope: 'https://www.googleapis.com/auth/drive' }));
  assert.equal(r.status, 403); assert.deepEqual(await r.json(), { error: 'scope' });   // nur der App-Ordner ist erlaubt
  r = await handle(post('/auth/refresh', { refresh_token: '1//refresh-token-123' }), ENV, async () => { throw new Error('offline geheim-geheim'); });
  assert.equal(r.status, 502); assert.doesNotMatch(await r.text(), /geheim/);
});
