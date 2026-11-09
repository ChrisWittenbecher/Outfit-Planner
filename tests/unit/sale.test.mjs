import test from 'node:test';
import assert from 'node:assert/strict';
import { CONDITIONS, priceIdea, roundPrice, saleDraft } from '../../js/sale.js';

const item = { name: 'Blaue Jeans', cat: 'Hose/Rock', color: 'Blau', tags: ['Denim', 'Basic'], price: 80, cur: 'EUR' };

test('roundPrice: unter 10 € auf 50 Cent, sonst ganze Euro', () => {
  assert.equal(roundPrice(4.26), 4.5);
  assert.equal(roundPrice(4.2), 4);
  assert.equal(roundPrice(9.7), 9.5);
  assert.equal(roundPrice(23.4), 23);
  assert.equal(roundPrice(23.5), 24);
});

test('Preisvorschlag folgt dem Zustand', () => {
  assert.equal(priceIdea(80, 'neu'), 56);
  assert.equal(priceIdea(80, 'sehrgut'), 44);
  assert.equal(priceIdea(80, 'gut'), 36);
  assert.equal(priceIdea(80, 'gebraucht'), 24);
  assert.ok(priceIdea(80, 'neu') > priceIdea(80, 'gut') && priceIdea(80, 'gut') > priceIdea(80, 'gebraucht'));
});

test('Ohne brauchbaren Kaufpreis gibt es keinen Preisvorschlag', () => {
  for (const p of [null, undefined, 0, -5, NaN, Infinity, '80']) assert.equal(priceIdea(p, 'gut'), null, String(p));
});

test('Mindestens ein Euro, auch bei Kleinstbeträgen', () => {
  assert.equal(priceIdea(0.5, 'gebraucht'), 1);
});

test('Unbekannter Zustand fällt auf „gut“ zurück', () => {
  assert.equal(priceIdea(80, 'kaputt'), 36);
  assert.match(saleDraft(item, { condition: 'kaputt' }).text, /Zustand: Gut\./);
});

test('Entwurf enthält Art, Farbe, Größe, Zustand, Preis und Hinweis', () => {
  const d = saleDraft(item, { condition: 'sehrgut', size: ' M ', shipping: true });
  assert.equal(d.title, 'Blaue Jeans – Gr. M');
  assert.equal(d.price, 44);
  assert.match(d.text, /Art: Hose\/Rock, Blau/);
  assert.match(d.text, /Größe: M\n/);
  assert.match(d.text, /Zustand: Sehr gut\. Sehr guter Zustand/);
  assert.match(d.text, /Stichworte: Denim, Basic/);
  assert.match(d.text, /Preis: 44,00\s€ VB/);
  assert.match(d.text, /Versand möglich/);
  assert.match(d.text, /keine Garantie und keine Rücknahme/);
});

test('Ohne Größe, ohne Versand, ohne Preis', () => {
  const d = saleDraft({ name: 'Mütze', cat: 'Accessoire' }, { condition: 'gut' });
  assert.equal(d.title, 'Mütze');
  assert.equal(d.price, null);
  assert.ok(!/Größe:/.test(d.text) && !/Stichworte:/.test(d.text));
  assert.match(d.text, /Preis: VB/);
  assert.match(d.text, /Nur Abholung/);
});

test('Der Entwurf behauptet nichts, was die App nicht weiß', () => {
  const t = saleDraft(item, { condition: 'neu' }).text.toLowerCase();
  for (const word of ['getragen', 'ungetragen', 'nie ', 'rauch', 'tierfrei', 'original']) assert.ok(!t.includes(word), word);
});

test('Titel und Größe sind begrenzt, Leerraum wird aufgeräumt', () => {
  const d = saleDraft({ ...item, name: 'x'.repeat(200) }, { condition: 'gut', size: 'y'.repeat(100) });
  assert.ok(d.title.length <= 70);
  assert.ok(/Größe: y{20}\n/.test(d.text));
  assert.equal(saleDraft(item, { condition: 'gut', size: 'W32\n  L34' }).title, 'Blaue Jeans – Gr. W32 L34');
});

test('Währung: andere als Euro wird übernommen, kaputte nicht zum Absturz', () => {
  assert.match(saleDraft({ ...item, cur: 'USD' }, { condition: 'gut' }).text, /\$/);
  assert.doesNotThrow(() => saleDraft({ ...item, cur: 'kein Code' }, { condition: 'gut' }));
});

test('Alle Zustände haben Namen und Text', () => {
  for (const [k, v] of Object.entries(CONDITIONS)) assert.ok(v.label && v.text && v.factor > 0 && v.factor < 1, k);
});

test('Tags, die keine Texte sind, werden übergangen', () => {
  const d = saleDraft({ ...item, tags: [5, null, 'Gut', ''] }, { condition: 'gut' });
  assert.match(d.text, /Stichworte: Gut\n/);
  assert.doesNotThrow(() => saleDraft({ ...item, tags: 'kein Array' }, { condition: 'gut' }));
});
