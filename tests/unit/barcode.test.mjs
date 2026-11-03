// Unit-Tests für js/barcode.js.  Start:  node --test tests/unit/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as b from '../../js/barcode.js';

test('normalizeCode: nur Ziffern, Leerzeichen und Bindestriche erlaubt', () => {
  assert.equal(b.normalizeCode(' 4006381 333931 '), '4006381333931');
  assert.equal(b.normalizeCode('4006-3813-33931'), '4006381333931');
  assert.equal(b.normalizeCode(96385074), '96385074');
  for (const bad of ['', 'abc', '12a45', '1e5', '१२३', null, undefined, {}, []]) assert.equal(b.normalizeCode(bad), '');
});

test('checkDigit: bekannte Beispiele', () => {
  assert.equal(b.checkDigit('400638133393'), 1);
  assert.equal(b.checkDigit('03600029145'), 2);
  assert.equal(b.checkDigit('9638507'), 4);
});

test('parseGtin: gültige Codes aller Arten', () => {
  assert.deepEqual(b.parseGtin('4006381333931'), { ok: true, code: '4006381333931', kind: 'EAN-13' });
  assert.deepEqual(b.parseGtin('036000291452'), { ok: true, code: '036000291452', kind: 'UPC-A' });
  assert.deepEqual(b.parseGtin('96385074'), { ok: true, code: '96385074', kind: 'EAN-8' });
  assert.deepEqual(b.parseGtin('01234567890128'), { ok: true, code: '01234567890128', kind: 'GTIN-14' });
  assert.equal(b.parseGtin('4006 3813 33931').ok, true);
});

test('parseGtin: falsche Prüfziffer, Länge und Müll werden abgelehnt', () => {
  assert.match(/** @type {any} */ (b.parseGtin('4006381333932')).error, /Prüfziffer/);
  assert.match(/** @type {any} */ (b.parseGtin('12345')).error, /8, 12, 13 oder 14/);
  assert.match(/** @type {any} */ (b.parseGtin('')).error, /Ziffern/);
  assert.match(/** @type {any} */ (b.parseGtin('abc')).error, /Ziffern/);
  assert.match(/** @type {any} */ (b.parseGtin('0000000000000')).error, /kein gültiger/);
  assert.equal(b.parseGtin("4006381333931'; DROP TABLE x;--").ok, false);
  assert.equal(b.parseGtin(null).ok, false);
});

test('Jede einzelne Ziffernänderung wird erkannt (Prüfziffer fängt alle Einzelfehler)', () => {
  const good = '4006381333931';
  for (let i = 0; i < good.length; i++) {
    for (let d = 0; d <= 9; d++) {
      if (String(d) === good[i]) continue;
      assert.equal(b.parseGtin(good.slice(0, i) + d + good.slice(i + 1)).ok, false, `Position ${i} → ${d}`);
    }
  }
});

test('lookupKey: UPC-A bekommt eine führende Null', () => {
  assert.equal(b.lookupKey('036000291452'), '0036000291452');
  assert.equal(b.lookupKey('4006381333931'), '4006381333931');
  assert.equal(b.lookupKey('96385074'), '96385074');
});
