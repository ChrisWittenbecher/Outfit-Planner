import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

// Der Service Worker legt nur Dateien in den Cache, die in index.html verlinkt sind (siehe sw.js, appFiles).
// Eine Moduldatei ohne <link rel="modulepreload"> würde offline fehlen. Dieser Test sorgt dafür, dass keine vergessen wird.
const read = f => readFile(new URL('../../' + f, import.meta.url), 'utf8');

test('Jedes Modul, das von der App geladen wird, steht als modulepreload in index.html', async () => {
  const html = await read('index.html');
  const linked = new Set([...html.matchAll(/<(?:link|script)\b[^>]*?\s(?:href|src)="([^"]+)"/gi)].map(m => m[1]));
  const reach = new Set();
  const walk = async file => {
    if (reach.has(file)) return;
    reach.add(file);
    const src = await read(file);
    for (const m of src.matchAll(/(?:^|[\s;}])(?:import|export)\b[^'"`;]*?\bfrom\s*['"](\.[^'"]+)['"]|(?:^|[\s;}])import\s*['"](\.[^'"]+)['"]/gm)) {
      const rel = m[1] || m[2];
      const target = new URL(rel, 'http://x/' + file).pathname.slice(1);
      await walk(target);
    }
  };
  await walk('js/main.js');
  const missing = [...reach].filter(f => !linked.has(f));
  assert.deepEqual(missing, [], 'nicht vorgeladen, daher offline nicht im Cache: ' + missing.join(', '));
  assert.ok(reach.size > 30, 'der Import-Graph wurde gelesen (' + reach.size + ' Dateien)');
});

test('Jedes modulepreload in index.html verweist auf eine vorhandene Datei', async () => {
  const html = await read('index.html');
  const files = new Set(await readdir(new URL('../../js/', import.meta.url)));
  for (const m of html.matchAll(/<link rel="modulepreload" href="js\/([^"]+)"/g)) assert.ok(files.has(m[1]), 'fehlt: js/' + m[1]);
});

test('Keine Moduldatei liegt ungenutzt herum', async () => {
  const html = await read('index.html');
  const used = new Set([...html.matchAll(/(?:href|src)="js\/([^"]+)"/g)].map(m => m[1]));
  const files = (await readdir(new URL('../../js/', import.meta.url))).filter(f => f.endsWith('.js'));
  const unused = files.filter(f => !used.has(f));
  assert.deepEqual(unused, [], 'nicht eingebunden: ' + unused.join(', '));
});
