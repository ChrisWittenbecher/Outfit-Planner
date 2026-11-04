// Prüft, dass die Versionsnummer überall gleich ist. Wer veröffentlicht, zählt sie in allen drei Dateien hoch.
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

import { refreshTargets } from '../../js/version.js';
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
  assert.equal(refreshTargets(Array.from({ length: 200 }, (_, i) => 'js/m' + i + '.js'), base).length, 60);
  assert.deepEqual(refreshTargets(['js/a.js'], 'kein url'), []);
});
