import test from 'node:test';
import assert from 'node:assert/strict';
import { CLIP_LIMITS, MARK, guessCat, guessColor, isShopClip, parseShopClip } from '../../js/shopdata.js';

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const clip = (obj, img = '') => MARK + '\n' + JSON.stringify(obj) + (img ? '\n' + img : '');
const full = { name: 'Wollmantel Oslo', price: '189.90', currency: 'EUR', url: 'https://www.shop.example/p/1#x', image: 'https://cdn.shop.example/a.jpg', color: 'Dark Navy', brand: 'Nordlys' };

test('Vollständige Daten werden übernommen und geprüft', () => {
  const d = parseShopClip(clip(full, PNG_B64));
  assert.equal(d.ok, true);
  assert.equal(d.name, 'Wollmantel Oslo');
  assert.equal(d.price, 189.9);
  assert.equal(d.cur, 'EUR');
  assert.equal(d.link, 'https://www.shop.example/p/1');
  assert.equal(d.imageUrl, 'https://cdn.shop.example/a.jpg');
  assert.equal(d.color, 'Blau');
  assert.equal(d.cat, 'Jacke');
  assert.equal(d.brand, 'Nordlys');
  assert.equal(d.image.mime, 'image/png');
  assert.equal(d.image.bytes[1], 0x50);
});

test('Erkennung: nur Texte mit der Kennung am Anfang', () => {
  assert.equal(isShopClip(clip(full)), true);
  assert.equal(isShopClip('  \n' + clip(full)), true);
  for (const no of ['', 'Hallo ANPROBE1', null, undefined, 5, {}, 'anprobe1\n{}']) assert.equal(isShopClip(no), false);
  assert.equal(parseShopClip('irgendein Text').ok, false);
  assert.match(parseShopClip('irgendein Text').error, /keine Shop-Daten/);
});

test('Kaputtes oder fehlendes JSON wird abgelehnt', () => {
  for (const bad of [MARK, MARK + '\n', MARK + '\n{kaputt', MARK + '\n[1,2]', MARK + '\n"text"', MARK + '\nnull', MARK + '\n' + JSON.stringify({ name: 'x'.repeat(CLIP_LIMITS.json) })]) {
    const d = parseShopClip(bad);
    assert.equal(d.ok, false, bad.slice(0, 30));
    assert.ok(d.error.length > 10);
  }
});

test('Gefährliche Links werden verworfen, der Rest bleibt', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd', 'http://localhost/x', 'http://192.168.1.1/', 'https://user:pw@shop.example/', 'ftp://x.example/']) {
    const d = parseShopClip(clip({ ...full, url, image: url }));
    assert.equal(d.ok, true);
    assert.equal(d.link, '', url);
    assert.equal(d.imageUrl, '', url);
    assert.equal(d.name, 'Wollmantel Oslo');
  }
  assert.equal(parseShopClip(clip({ ...full, image: 'http://cdn.shop.example/a.jpg' })).imageUrl, '', 'Bilder nur über https');
});

test('Texte werden gesäubert und begrenzt', () => {
  const d = parseShopClip(clip({ name: '<img src=x onerror=alert(1)>\u0000‮  Mantel   ' + 'x'.repeat(500), brand: 'B'.repeat(200), color: {}, price: {}, currency: 'XXX' }));
  assert.equal(d.ok, true);
  assert.ok(d.name.length <= 120);
  assert.ok(!/[\u0000‮]/.test(d.name));
  assert.ok(d.brand.length <= 30);
  assert.equal(d.price, null);
  assert.equal(d.cur, 'EUR');
  assert.equal(d.color, '');
});

test('Preise: Zahl, Punkt, Komma; Unsinn wird zu „kein Preis“', () => {
  const p = v => parseShopClip(clip({ ...full, price: v })).price;
  assert.equal(p(49.99), 49.99);
  assert.equal(p('79,95'), 79.95);
  assert.equal(p('1.299,00'), 1299);
  for (const bad of ['gratis', -5, '', null, 1e12]) assert.equal(p(bad), null, String(bad));
  assert.equal(parseShopClip(clip({ ...full, currency: 'chf' })).cur, 'CHF');
});

test('Bild: nur echte Bilddaten, Zeilenumbrüche im Base64 stören nicht', () => {
  const wrapped = PNG_B64.replace(/(.{20})/g, '$1\r\n');
  assert.equal(parseShopClip(clip(full, wrapped)).image.mime, 'image/png');
  assert.equal(parseShopClip(clip(full, '/9j/4AAQSkZJRgABAQ==')).image.mime, 'image/jpeg');
  for (const bad of ['', 'kein base64 !!!', btoa('<html><script>alert(1)</script></html>'), btoa('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'), '====']) {
    const d = parseShopClip(clip(full, bad));
    assert.equal(d.ok, true);
    assert.equal(d.image, null, bad.slice(0, 20));
  }
});

test('Kategorie aus dem Namen', () => {
  const cases = { 'Wollmantel Oslo': 'Jacke', 'Jeansjacke': 'Jacke', 'Slim Fit Jeans': 'Hose/Rock', 'Sweathose': 'Hose/Rock', 'Minirock': 'Hose/Rock', 'Weiße Sneaker': 'Schuhe', 'Chelsea Boots': 'Schuhe', 'T-Shirt Basic': 'Oberteil', 'Strickpullover': 'Oberteil', 'Sommerkleid': 'Oberteil', 'Ledergürtel': 'Accessoire', 'Wollmütze': 'Accessoire', 'Gutschein': '' };
  for (const [name, cat] of Object.entries(cases)) assert.equal(guessCat(name), cat, name);
});

test('Farbe aus der Shop-Angabe, sonst aus dem Namen', () => {
  const cases = { 'Dark Navy': 'Blau', 'schwarz': 'Schwarz', 'Off-White': 'Weiß', 'Weiß': 'Weiß', 'Olivgrün': 'Grün', 'Bordeaux': 'Rot', 'Camel': 'Beige', 'Anthrazit': 'Schwarz', 'Altrosa': 'Rosa', 'Sandalen': '', 'Muster 7': '', '': '' };
  for (const [text, color] of Object.entries(cases)) assert.equal(guessColor(text), color, text);
  assert.equal(parseShopClip(clip({ name: 'Hemd in Grün' })).color, 'Grün');
  assert.equal(parseShopClip(clip({ name: 'Hemd in Grün', color: 'Black' })).color, 'Schwarz', 'die Shop-Angabe geht vor');
});

test('Leeres Objekt ist gültig, liefert aber nichts', () => {
  const d = parseShopClip(clip({}));
  assert.deepEqual({ ...d }, { ok: true, name: '', brand: '', price: null, cur: 'EUR', link: '', imageUrl: '', color: '', cat: '', image: null });
});

test('Zu große Eingaben werden abgelehnt, ohne sie zu verarbeiten', () => {
  const d = parseShopClip(MARK + '\n{}\n' + 'A'.repeat(CLIP_LIMITS.text));
  assert.equal(d.ok, false);
  assert.match(d.error, /zu groß/);
});
