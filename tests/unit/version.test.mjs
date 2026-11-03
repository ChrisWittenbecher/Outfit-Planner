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
