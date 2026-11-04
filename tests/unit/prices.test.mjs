// Unit-Tests für js/prices.js.  Start:  node --test tests/unit/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as p from '../../js/prices.js';

test('recordPrice: neuer Preis wird festgehalten, gleicher nicht', () => {
  let h = p.recordPrice([], 49.99, 1000);
  assert.deepEqual(h, [{ t: 1000, v: 49.99 }]);
  assert.equal(p.recordPrice(h, 49.99, 2000), h);        // unverändert: dasselbe Objekt
  h = p.recordPrice(h, 39.99, 3000);
  assert.deepEqual(h, [{ t: 1000, v: 49.99 }, { t: 3000, v: 39.99 }]);
  assert.equal(p.recordPrice(h, null, 4000), h);
  assert.equal(p.recordPrice(h, NaN, 4000), h);
  assert.equal(p.recordPrice(h, -1, 4000), h);
});

test('recordPrice: verändert das Original nicht und begrenzt die Länge', () => {
  const h0 = [{ t: 1, v: 1 }];
  p.recordPrice(h0, 2, 2);
  assert.equal(h0.length, 1);
  let h = [];
  for (let i = 1; i <= p.MAX_POINTS + 10; i++) h = p.recordPrice(h, i, i);
  assert.equal(h.length, p.MAX_POINTS);
  assert.equal(h[h.length - 1].v, p.MAX_POINTS + 10);
});

test('priceChange: Senkung, Erhöhung, keine Änderung', () => {
  assert.equal(p.priceChange([]), null);
  assert.equal(p.priceChange([{ t: 1, v: 10 }]), null);
  assert.deepEqual(p.priceChange([{ t: 1, v: 50 }, { t: 2, v: 40 }]), { prev: 50, now: 40, pct: 20, dir: 'down' });
  assert.deepEqual(p.priceChange([{ t: 1, v: 40 }, { t: 2, v: 50 }]), { prev: 40, now: 50, pct: 25, dir: 'up' });
  assert.equal(p.priceChange([{ t: 1, v: 40 }, { t: 2, v: 40 }]), null);
  // nur die letzte Änderung zählt
  assert.equal(p.priceChange([{ t: 1, v: 100 }, { t: 2, v: 50 }, { t: 3, v: 45 }]).pct, 10);
  assert.equal(p.priceChange([{ t: 1, v: 0 }, { t: 2, v: 5 }]).pct, 100);
});

test('sanitizeHistory: bereinigt unsichere Daten', () => {
  assert.deepEqual(p.sanitizeHistory('x'), []);
  assert.deepEqual(p.sanitizeHistory(null), []);
  const out = p.sanitizeHistory([{ t: 3, v: 1.006 }, { t: 1, v: 5 }, { t: 0, v: 1 }, { t: 2, v: -1 }, { t: 2, v: 1e9 }, { t: Infinity, v: 1 }, 'a', { t: 4 }]);
  assert.deepEqual(out, [{ t: 1, v: 5 }, { t: 3, v: 1.01 }]);
  const many = Array.from({ length: 80 }, (_, i) => ({ t: i + 1, v: i }));
  assert.equal(p.sanitizeHistory(many).length, p.MAX_POINTS);
  assert.equal(p.sanitizeHistory(many)[0].t, 31);
});

test('sumPrices: Summe je Währung, fehlende Preise zählen', () => {
  const r = p.sumPrices([{ price: 10.1, cur: 'EUR' }, { price: 0.2 }, { price: null }, { price: 5, cur: 'USD' }]);
  assert.deepEqual(r, { by: { EUR: 10.3, USD: 5 }, missing: 1 });
  assert.deepEqual(p.sumPrices([]), { by: {}, missing: 0 });
});

test('baseHistory: Altbestand bekommt den bisherigen Preis als Ausgangspunkt', () => {
  assert.deepEqual(p.baseHistory([], 50), [{ t: p.LEGACY_T, v: 50 }]);
  assert.deepEqual(p.baseHistory([], null), []);
  assert.deepEqual(p.baseHistory([], undefined), []);
  const h = [{ t: 5, v: 9 }];
  assert.equal(p.baseHistory(h, 50), h);                  // vorhandener Verlauf bleibt
  const chg = p.priceChange(p.recordPrice(p.baseHistory([], 50), 40, 1000));
  assert.deepEqual(chg, { prev: 50, now: 40, pct: 20, dir: 'down' });
});
