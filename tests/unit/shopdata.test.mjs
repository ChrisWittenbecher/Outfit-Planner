import test from 'node:test';
import assert from 'node:assert/strict';
import { guessCat, guessColor, normalizeShop } from '../../js/shopdata.js';

const full = { name: 'Wollmantel Oslo', price: '189.90', currency: 'EUR', url: 'https://www.shop.example/p/1#x', image: 'https://cdn.shop.example/a.jpg', color: 'Dark Navy', brand: 'Nordlys' };

test('Vollständige Daten werden übernommen und geprüft', () => {
  const d = normalizeShop(full);
  assert.equal(d.ok, true);
  assert.equal(d.name, 'Wollmantel Oslo');
  assert.equal(d.price, 189.9);
  assert.equal(d.cur, 'EUR');
  assert.equal(d.link, 'https://www.shop.example/p/1');
  assert.equal(d.imageUrl, 'https://cdn.shop.example/a.jpg');
  assert.equal(d.color, 'Blau');
  assert.equal(d.cat, 'Jacke');
  assert.equal(d.brand, 'Nordlys');
});

test('Bilderliste: nur sichere Adressen, Hauptbild vorn, höchstens acht', () => {
  const d = normalizeShop({ ...full, images: ['https://cdn.shop.example/b.jpg', 'http://cdn.shop.example/c.jpg', 'javascript:1', 'https://cdn.shop.example/a.jpg', ...Array.from({ length: 20 }, (_, i) => `https://cdn.shop.example/x${i}.jpg`)] });
  assert.equal(d.images[0], 'https://cdn.shop.example/a.jpg');
  assert.ok(d.images.length <= 9 && d.images.every(u => u.startsWith('https://')));
  assert.equal(new Set(d.images).size, d.images.length);
  assert.deepEqual(normalizeShop({ ...full, images: 'kein array' }).images, ['https://cdn.shop.example/a.jpg']);
});

test('Kein Objekt: abgelehnt', () => {
  for (const bad of [null, undefined, 'text', 5, [1, 2]]) {
    const d = normalizeShop(bad);
    assert.equal(d.ok, false);
    assert.ok(d.error.length > 10);
  }
});

test('Gefährliche Links werden verworfen, der Rest bleibt', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd', 'http://localhost/x', 'http://192.168.1.1/', 'https://user:pw@shop.example/', 'ftp://x.example/']) {
    const d = normalizeShop({ ...full, url, image: url });
    assert.equal(d.ok, true);
    assert.equal(d.link, '', url);
    assert.equal(d.imageUrl, '', url);
    assert.equal(d.name, 'Wollmantel Oslo');
  }
  assert.equal(normalizeShop({ ...full, image: 'http://cdn.shop.example/a.jpg' }).imageUrl, '', 'Bilder nur über https');
});

test('Texte werden gesäubert und begrenzt', () => {
  const d = normalizeShop({ name: '<img src=x onerror=alert(1)>\u0000‮  Mantel   ' + 'x'.repeat(500), brand: 'B'.repeat(200), color: {}, price: {}, currency: 'XXX' });
  assert.equal(d.ok, true);
  assert.ok(d.name.length <= 120);
  assert.ok(!/[\u0000‮]/.test(d.name));
  assert.ok(d.brand.length <= 30);
  assert.equal(d.price, null);
  assert.equal(d.cur, 'EUR');
  assert.equal(d.color, '');
});

test('Kategorie aus dem Namen', () => {
  const cases = { 'Wollmantel Oslo': 'Jacke', 'Jeansjacke': 'Jacke', 'Slim Fit Jeans': 'Hose/Rock', 'Sweathose': 'Hose/Rock', 'Minirock': 'Hose/Rock', 'Weiße Sneaker': 'Schuhe', 'Chelsea Boots': 'Schuhe', 'T-Shirt Basic': 'Oberteil', 'Strickpullover': 'Oberteil', 'Sommerkleid': 'Oberteil', 'Ledergürtel': 'Accessoire', 'Wollmütze': 'Accessoire', 'Gutschein': '' };
  for (const [name, cat] of Object.entries(cases)) assert.equal(guessCat(name), cat, name);
});

test('Farbe aus der Shop-Angabe, sonst aus dem Namen', () => {
  const cases = { 'Dark Navy': 'Blau', 'schwarz': 'Schwarz', 'Off-White': 'Weiß', 'Weiß': 'Weiß', 'Olivgrün': 'Grün', 'Bordeaux': 'Rot', 'Camel': 'Beige', 'Anthrazit': 'Schwarz', 'Altrosa': 'Rosa', 'Sandalen': '', 'Muster 7': '', '': '' };
  for (const [text, color] of Object.entries(cases)) assert.equal(guessColor(text), color, text);
  assert.equal(normalizeShop({ name: 'Hemd in Grün' }).color, 'Grün');
  assert.equal(normalizeShop({ name: 'Hemd in Grün', color: 'Black' }).color, 'Schwarz', 'die Shop-Angabe geht vor');
});

test('Leeres Objekt ist gültig, liefert aber nichts', () => {
  assert.deepEqual({ ...normalizeShop({}) }, { ok: true, name: '', brand: '', price: null, cur: 'EUR', link: '', imageUrl: '', images: [], color: '', cat: '' });
});
