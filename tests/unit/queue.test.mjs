import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_QUEUE_CHARS, addLabel, counts, headText, inBudget, needsRedo, nextRow, percent, resultText } from '../../js/queue.js';
import { MAX_BATCH, planFiles } from '../../js/intake.js';

const row = (state, cat = 'Oberteil', procCat = null) => ({ state, cat, procCat });

test('planFiles: nur Bilder, höchstens MAX_BATCH, der Rest wird gezählt', () => {
  const img = n => Array.from({ length: n }, (_, i) => ({ type: 'image/png', name: i + '.png' }));
  const a = planFiles([...img(3), { type: 'application/pdf' }, { type: '' }, null, undefined, { type: 5 }]);
  assert.equal(a.list.length, 3);
  assert.equal(a.notImage, 5);
  assert.equal(a.tooMany, 0);
  const b = planFiles(img(MAX_BATCH + 4));
  assert.equal(b.list.length, MAX_BATCH);
  assert.equal(b.tooMany, 4);
  assert.deepEqual(b.list.map(f => f.name), img(MAX_BATCH).map(f => f.name), 'die ersten bleiben, in der Reihenfolge der Auswahl');
  assert.deepEqual(planFiles([]), { list: [], notImage: 0, tooMany: 0 });
  assert.equal(planFiles(img(5), 2).list.length, 2);
});

test('counts und percent', () => {
  const rows = [row('done'), row('done'), row('fail'), row('work'), row('wait'), row('wait')];
  assert.deepEqual(counts(rows), { total: 6, wait: 2, work: 1, done: 2, fail: 1 });
  assert.equal(percent(counts(rows)), 50);
  assert.equal(percent(counts([])), 0);
  assert.equal(percent(counts([row('wait')])), 0);
  assert.equal(percent(counts([row('done'), row('fail')])), 100);
  assert.equal(percent(counts([row('done'), row('wait'), row('wait')])), 33);
});

test('nextRow: erstes wartendes Foto, sonst nichts', () => {
  const rows = [row('done'), row('work'), row('wait', 'A'), row('wait', 'B')];
  assert.equal(nextRow(rows)?.cat, 'A');
  assert.equal(nextRow([row('done'), row('fail')]), undefined);
  assert.equal(nextRow([]), undefined);
});

test('needsRedo: nur der Wechsel zwischen Schuhe und anderem Ergebnis macht eine neue Verarbeitung nötig', () => {
  assert.equal(needsRedo(row('work', 'Schuhe', 'Oberteil')), true);
  assert.equal(needsRedo(row('work', 'Oberteil', 'Schuhe')), true);
  assert.equal(needsRedo(row('work', 'Schuhe', 'Schuhe')), false);
  assert.equal(needsRedo(row('work', 'Jacke', 'Oberteil')), false, 'Oberteil → Jacke ändert das Bild nicht');
  assert.equal(needsRedo(row('wait', 'Schuhe', null)), false, 'noch nie verarbeitet');
});

test('inBudget: Obergrenze für den Speicher', () => {
  assert.equal(inBudget(0, 1000), true);
  assert.equal(inBudget(MAX_QUEUE_CHARS - 10, 10), true);
  assert.equal(inBudget(MAX_QUEUE_CHARS - 10, 11), false);
  assert.equal(inBudget(NaN, 1), false);
  assert.equal(inBudget(0, Infinity), false);
});

test('headText: Fortschritt, Ergebnis und Fehler in klaren Sätzen', () => {
  const t = rows => headText(counts(rows));
  assert.equal(t([]), '');
  assert.equal(t([row('done'), row('work'), row('wait')]), '1 von 3 fertig');
  assert.equal(t([row('done'), row('fail'), row('wait')]), '2 von 3 fertig, 1 mit Fehler');
  assert.equal(t([row('done'), row('done'), row('done')]), '3 von 3 Fotos sind bereit');
  assert.equal(t([row('done')]), '1 von 1 Foto ist bereit');
  assert.equal(t([row('done'), row('fail'), row('fail')]), '1 von 3 Fotos ist bereit, 2 mit Fehler');
  assert.equal(t([row('fail'), row('fail')]), 'Kein Foto konnte verarbeitet werden.');
});

test('addLabel: zeigt, wie viele hinzugefügt werden', () => {
  const l = rows => addLabel(counts(rows));
  assert.equal(l([row('wait'), row('work')]), 'Hinzufügen');
  assert.equal(l([row('fail')]), 'Hinzufügen');
  assert.equal(l([row('done'), row('done')]), 'Hinzufügen (2)');
  assert.equal(l([row('done'), row('wait')]), 'Fertige hinzufügen (1)', 'solange noch gearbeitet wird, werden nur die fertigen hinzugefügt');
});

test('resultText: Zusammenfassung mit allem, was übersprungen wurde', () => {
  const base = { added: 5, cats: ['Jacke'], wish: false, failed: 0, stopped: 0, notImage: 0, tooMany: 0, max: 30 };
  assert.equal(resultText(base), '5 Teile hinzugefügt (Kategorie Jacke). Namen und Angaben änderst du mit ✎.');
  assert.match(resultText({ ...base, added: 1, wish: true }), /^1 Teil hinzugefügt \(Kategorie Jacke, Wunschliste\)\./);
  assert.match(resultText({ ...base, cats: ['Jacke', 'Hose/Rock', 'Schuhe'] }), /\(3 Kategorien\)/);
  const r = resultText({ ...base, failed: 2, stopped: 3, notImage: 1, tooMany: 4 });
  assert.match(r, /Übersprungen: 2 nicht lesbar, 3 nicht mehr verarbeitet, 1 Datei ohne Bild, 4 über dem Limit von 30\./);
  assert.match(resultText({ ...base, notImage: 2 }), /Übersprungen: 2 Dateien ohne Bild\./);
});
