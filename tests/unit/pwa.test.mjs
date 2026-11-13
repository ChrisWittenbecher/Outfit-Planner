import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { VERSION } from '../../js/version.js';

const read = f => readFile(new URL('../../' + f, import.meta.url), 'utf8');

test('sw.js nennt dieselbe Version wie die App (so erkennt der Browser jede neue Version)', async () => {
  assert.equal((await read('sw.js')).match(/const VERSION = '([^']+)'/)?.[1], VERSION);
});

test('Manifest: eigenständige App im Ordner, Symbole vorhanden und in der richtigen Größe', async () => {
  const m = JSON.parse(await read('manifest.webmanifest'));
  assert.equal(m.display, 'standalone'); assert.equal(m.lang, 'de'); assert.equal(m.scope, './'); assert.match(m.start_url, /^\.\/(index\.html)?$/);
  assert.ok(m.name && m.short_name && m.short_name.length <= 14);
  const purposes = m.icons.map(i => i.purpose);
  assert.ok(purposes.includes('any') && purposes.includes('maskable'));
  for (const i of m.icons) {
    assert.doesNotMatch(i.src, /^[a-z]+:|^\/|\.\./, 'Symbole liegen im App-Ordner');
    const png = await readFile(new URL('../../' + i.src, import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    const [w, h] = [png.readUInt32BE(16), png.readUInt32BE(20)];
    assert.equal(`${w}x${h}`, i.sizes, i.src);
  }
  assert.ok(m.icons.some(i => i.sizes === '192x192') && m.icons.some(i => i.sizes === '512x512'));
});

test('index.html verweist auf Manifest und Apple-Symbol, die CSP erlaubt nur das eigene Manifest', async () => {
  const html = await read('index.html');
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  const touch = html.match(/<link rel="apple-touch-icon" href="([^"]+)"/)?.[1];
  assert.ok(touch && (await stat(new URL('../../' + touch, import.meta.url))).size > 500);
  assert.match(html, /manifest-src 'self';/);
  assert.match(html, /name="apple-mobile-web-app-capable" content="yes"/);
  for (const f of ['js/care.js', 'js/pwa.js']) assert.ok(html.includes(`href="${f}"`), f + ' wird vorab geladen');
});

test('Service Worker: fasst nur eigene GET-Anfragen im App-Ordner an, nie fremde Adressen', async () => {
  const sw = await read('sw.js');
  assert.match(sw, /req\.method !== 'GET' \|\| url\.origin !== location\.origin \|\| !url\.href\.startsWith\(self\.registration\.scope\)\) return;/);
  assert.doesNotMatch(sw, /importScripts|eval\(|new Function|https?:\/\//, 'kein fremder Code, keine festen Adressen');
  assert.match(sw, /credentials: 'omit'/);
  assert.match(sw, /k\.startsWith\('anprobe-'\) && k !== CACHE/, 'alte Caches werden aufgeräumt');
});

test('Dependabot bündelt die CodeQL-Schritte (sonst schlagen die Einzel-PRs fehl)', async () => {
  const y = await read('.github/dependabot.yml');
  assert.match(y, /groups:\s+codeql:\s+patterns:\s+- "github\/codeql-action\/\*"/);
});
