import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { VERSION } from '../../js/version.js';

const json = async f => JSON.parse(await readFile(new URL('../../' + f, import.meta.url), 'utf8'));

test('version.json, package.json und js/version.js nennen dieselbe Version', async () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal((await json('version.json')).version, VERSION, 'version.json weicht ab');
  assert.equal((await json('package.json')).version, VERSION, 'package.json weicht ab');
});

import { isVersion } from '../../js/version.js';
test('isVersion: nur das Format 1.2.3 ist gültig', () => {
  for (const ok of ['1.2.0', '0.0.1', '12.34.56']) assert.equal(isVersion(ok), true, ok);
  for (const bad of ['', '1.2', '1.2.3.4', 'v1.2.3', '1.2.x', '<script>', '1.2.0\n', 1.2, null, undefined, {}, '9'.repeat(40)]) assert.equal(isVersion(bad), false, String(bad));
});

import { REFRESH_MAX, refreshTargets } from '../../js/version.js';
import { mismatch } from '../../js/guard.js';
test('refreshTargets: nur eigene Dateien der App, nichts von außen', () => {
  const base = 'https://nutzer.github.io/Outfit-Planner/index.html';
  const got = refreshTargets([
    'js/main.js', './css/styles.css?v=2', 'assets/icons/icon48.png', 'version.json', 'js/main.js',   // erlaubt (Doppelte nur einmal)
    'https://evil.example/x.js', '//evil.example/y.css', 'http://nutzer.github.io/Outfit-Planner/js/a.js',   // fremder Ursprung oder Protokoll
    '../outside.js', '/etc/passwd.js', '/Outfit-Planner-evil/x.js', '/Outfit-Planner/../other/x.js',   // außerhalb des Ordners
    'js/data.exe', 'index.html', 'javascript:alert(1).js', 'data:text/javascript,1.js', '', null, 'a'.repeat(400) + '.js',   // falsche Endung oder Form
  ], base);
  assert.deepEqual(got, [
    'https://nutzer.github.io/Outfit-Planner/js/main.js', 'https://nutzer.github.io/Outfit-Planner/css/styles.css',
    'https://nutzer.github.io/Outfit-Planner/assets/icons/icon48.png', 'https://nutzer.github.io/Outfit-Planner/version.json',
  ]);
  assert.equal(refreshTargets(Array.from({ length: 200 }, (_, i) => 'js/m' + i + '.js'), base).length, REFRESH_MAX);
  assert.deepEqual(refreshTargets(['js/a.js'], 'kein url'), []);
});

// Zwei Obergrenzen können eine App still kaputt machen, wenn index.html mehr Dateien verlinkt als sie zulassen: „Aktualisieren“ lädt nur
// die ersten REFRESH_MAX Dateien neu (der Rest bleibt alt, Mischstand), der Service Worker legt nur die ersten Dateien in den Cache (offline fehlt der Rest).
test('Die Obergrenzen für „Aktualisieren“ und den Offline-Cache haben genug Luft zu den verlinkten Dateien', async () => {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  const sw = await readFile(new URL('../../sw.js', import.meta.url), 'utf8');
  const links = [...html.matchAll(/<(?:link|script)\b[^>]*?\s(?:href|src)="([^"]+)"/gi)].map(m => m[1]);
  const refreshable = refreshTargets(links, 'https://example.org/index.html').length;
  const swCap = Number(sw.match(/\[\.\.\.urls\]\.slice\(0, (\d+)\)/)?.[1]);
  assert.equal(swCap, REFRESH_MAX, 'sw.js und js/version.js nennen dieselbe Obergrenze');
  assert.ok(refreshable <= REFRESH_MAX - 20, `index.html verlinkt ${refreshable} Dateien, Grenze ${REFRESH_MAX}: Grenze anheben, bevor sie erreicht ist`);
  assert.ok(refreshable > 40, 'die Links wurden gelesen (' + refreshable + ')');
});

test('index.html nennt dieselbe Version wie die Module (meta app-version, Grundlage der Selbstheilung in js/guard.js)', async () => {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  assert.equal(html.match(/<meta name="app-version" content="([^"]*)">/)?.[1], VERSION, 'meta app-version weicht von js/version.js ab');
});

test('main.js importiert guard.js als Erstes, damit die Prüfung vor allen anderen Modulen läuft', async () => {
  const main = await readFile(new URL('../../js/main.js', import.meta.url), 'utf8');
  const first = main.split('\n').find(l => /^\s*import\b/.test(l));
  assert.match(first, /import '\.\/guard\.js'/);
});

test('Seite und Module: nur gleiche Version passt, eine Seite ohne das Feld (ältere Version) passt nicht', () => {
  assert.equal(mismatch('1.20.0', '1.20.0'), false);
  assert.equal(mismatch('', '1.20.0'), true);
  assert.equal(mismatch('1.19.0', '1.20.0'), true);
  assert.equal(mismatch('1.20.1', '1.20.0'), true);
});
