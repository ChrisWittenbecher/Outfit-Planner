import test from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA, KEEP_LEGACY_DAYS, snapshotItem, sameItem, diffItems, packState, unpackState, splitLegacy, isCurrent, thumbKey, legacyExpired } from '../../js/model.js';

const it = (id, extra = {}) => ({ id, name: id, cat: 'Oberteil', img: 'data:image/png;base64,AAAA' + id, tags: [], priceHistory: [], ...extra });
let n = 0;
const newId = () => 'neu' + ++n;

test('sameItem vergleicht Werte, auch in Listen und Objekten', () => {
  assert.equal(sameItem(it('a'), it('a')), true);
  assert.equal(sameItem(it('a'), it('a', { name: 'x' })), false);
  assert.equal(sameItem(it('a', { tags: ['x'] }), it('a', { tags: ['x'] })), true, 'andere Liste, gleicher Inhalt');
  assert.equal(sameItem(it('a', { tags: ['x'] }), it('a', { tags: ['y'] })), false);
  assert.equal(sameItem(it('a'), { ...it('a'), color: 'Rot' }), false, 'zusätzliches Feld');
  assert.equal(sameItem({ id: 'a', x: 1 }, { id: 'a', y: 1 }), false, 'gleich viele Felder, andere Namen');
  assert.equal(sameItem(it('a', { color: undefined }), it('a', { color: undefined })), true);
});

test('snapshotItem trennt Listen vom Original', () => {
  const o = it('a', { tags: ['x'], priceHistory: [{ t: 1, v: 2 }] });
  const s = snapshotItem(o);
  assert.deepEqual(s, o);
  o.tags.push('y'); o.priceHistory[0].v = 99;
  assert.deepEqual(s.tags, ['x']);
  assert.equal(s.priceHistory[0].v, 2);
});

test('diffItems: nur Neues und Geändertes wird geschrieben, Entferntes gelöscht', () => {
  const stored = new Map([['a', snapshotItem(it('a'))], ['b', snapshotItem(it('b'))], ['c', snapshotItem(it('c'))]]);
  const items = [it('a'), it('b', { name: 'geändert' }), it('d')];
  const d = diffItems(stored, items);
  assert.deepEqual(d.puts.map(i => i.id), ['b', 'd']);
  assert.deepEqual(d.deletes, ['c']);
});

test('diffItems: unveränderter Bestand = nichts zu tun; leerer Speicher = alles neu', () => {
  const items = [it('a'), it('b')];
  const stored = new Map(items.map(i => [i.id, snapshotItem(i)]));
  assert.deepEqual(diffItems(stored, items), { puts: [], deletes: [] });
  assert.deepEqual(diffItems(new Map(), items).puts.length, 2);
  assert.deepEqual(diffItems(stored, []), { puts: [], deletes: ['a', 'b'] });
});

test('diffItems erkennt Änderungen in Listen, die an Ort und Stelle verändert wurden', () => {
  const live = it('a', { tags: ['x'] });
  const stored = new Map([['a', snapshotItem(live)]]);
  live.tags.push('y');
  assert.deepEqual(diffItems(stored, [live]).puts.map(i => i.id), ['a']);
});

test('diffItems überspringt Einträge ohne Kennung statt abzustürzen', () => {
  const d = diffItems(new Map(), [it('a'), null, {}, { id: 5 }]);
  assert.deepEqual(d.puts.map(i => i.id), ['a']);
});

test('packState enthält keine Bilder und merkt die Reihenfolge', () => {
  const r = packState({ items: [it('b'), it('a')], outfits: [{ id: 'o' }], wears: [1], plans: { x: 'y' }, board: [2], fitted: false });
  assert.deepEqual(r.order, ['b', 'a']);
  assert.equal(r.v, SCHEMA);
  assert.equal(JSON.stringify(r).includes('data:image'), false);
  assert.equal(r.fitted, false);
  assert.equal(packState({ items: [], outfits: [] }).fitted, true);
});

test('packState und unpackState sind zueinander passend, auch bei umsortierten Teilen', () => {
  const items = [it('c'), it('a'), it('b')];
  const rec = packState({ items, outfits: [{ id: 'o' }], wears: [], plans: {}, board: [], fitted: true });
  const back = unpackState(rec, [it('a'), it('b'), it('c')]);   // Store liefert in anderer Reihenfolge
  assert.deepEqual(back.items.map(i => i.id), ['c', 'a', 'b']);
  assert.deepEqual(back.outfits, [{ id: 'o' }]);
});

test('unpackState: fehlende Teile fallen weg, Waisen im Store werden nicht angezeigt, Doppelte nur einmal', () => {
  const rec = { v: 2, order: ['a', 'gone', 'a', 'b', 7, null], outfits: [], wears: [], plans: {}, board: [], fitted: true };
  const back = unpackState(rec, [it('a'), it('b'), it('waise')]);
  assert.deepEqual(back.items.map(i => i.id), ['a', 'b']);
});

test('unpackState verträgt kaputte Datensätze', () => {
  for (const bad of [null, undefined, 5, 'x', [], {}, { order: 'x', outfits: 'x', plans: [], board: 3 }]) {
    const r = unpackState(bad, [it('a')]);
    assert.deepEqual(r.items, []);
    assert.deepEqual(r.outfits, []); assert.deepEqual(r.wears, []); assert.deepEqual(r.plans, {}); assert.deepEqual(r.board, []);
    assert.equal(r.fitted, true);
  }
});

test('splitLegacy: übernimmt alles Gültige unverändert', () => {
  const legacy = { items: [it('a'), it('b')], outfits: [{ id: 'o', name: 'x', pieces: [] }], board: [{ id: 'a', x: 1, y: 2, w: 3, r: 0 }], fitted: false };
  const { items, record, fixed } = splitLegacy(legacy, newId);
  assert.deepEqual(items, legacy.items);
  assert.equal(fixed, 0);
  assert.deepEqual(record.order, ['a', 'b']);
  assert.deepEqual(record.outfits, legacy.outfits);
  assert.deepEqual(record.board, legacy.board);
  assert.equal(record.fitted, false);
  assert.deepEqual(record.wears, []);
  assert.deepEqual(record.plans, {});
});

test('splitLegacy: Teile ohne oder mit doppelter Kennung bekommen eine neue, Nicht-Objekte fallen weg', () => {
  const { items, record, fixed } = splitLegacy({ items: [it('a'), it('a', { name: 'zweites a' }), { name: 'ohne id', img: 'x' }, null, 5, 'text', it('x'.repeat(65))] }, newId);
  assert.equal(items.length, 4);
  assert.equal(new Set(items.map(i => i.id)).size, 4);
  assert.equal(fixed, 6, 'drei neue Kennungen und drei verworfene Einträge');
  assert.deepEqual(record.order, items.map(i => i.id));
  assert.equal(items[0].id, 'a');
  assert.equal(items[1].name, 'zweites a');
});

test('splitLegacy verträgt jede Art Eingabe', () => {
  for (const bad of [null, undefined, 0, 'x', [], {}, { items: 'x' }, { items: null, outfits: 'x' }]) {
    const r = splitLegacy(bad, newId);
    assert.deepEqual(r.items, []); assert.deepEqual(r.record.order, []); assert.deepEqual(r.record.outfits, []);
  }
});

test('splitLegacy → packState → unpackState bringt dieselben Teile in derselben Reihenfolge zurück', () => {
  const legacy = { items: [it('z'), it('y', { tags: ['a'] }), it('x')], outfits: [], wears: [{ id: 'w' }], plans: { '2026-01-01': 'o' } };
  const { items, record } = splitLegacy(legacy, newId);
  const back = unpackState(JSON.parse(JSON.stringify(record)), items.slice().reverse());
  assert.deepEqual(back.items, legacy.items);
  assert.deepEqual(back.wears, [{ id: 'w' }]);
  assert.deepEqual(back.plans, { '2026-01-01': 'o' });
});

test('isCurrent erkennt nur das neue Format', () => {
  assert.equal(isCurrent({ v: 2, order: [] }), true);
  for (const no of [null, undefined, {}, { items: [] }, { v: 1, order: [] }, { v: 2 }, [], 'x']) assert.equal(isCurrent(no), false);
});

test('thumbKey ändert sich mit dem Bild', () => {
  const a = 'data:image/png;base64,' + 'A'.repeat(100), b = 'data:image/png;base64,' + 'A'.repeat(99) + 'B', c = a + 'A';
  assert.notEqual(thumbKey(a), thumbKey(b));
  assert.notEqual(thumbKey(a), thumbKey(c));
  assert.equal(thumbKey(a), thumbKey(a.slice()));
  assert.equal(thumbKey(null), '');
  assert.equal(thumbKey(5), '');
});

test('legacyExpired: Kopie des alten Formats wird erst nach der Frist freigegeben', () => {
  const now = 10 * 86400000 * 10, day = 86400000;
  assert.equal(legacyExpired(now - (KEEP_LEGACY_DAYS - 1) * day, now), false);
  assert.equal(legacyExpired(now - (KEEP_LEGACY_DAYS + 1) * day, now), true);
  for (const bad of [undefined, null, 0, NaN, 'x', -5]) assert.equal(legacyExpired(bad, now), false, String(bad));
});
