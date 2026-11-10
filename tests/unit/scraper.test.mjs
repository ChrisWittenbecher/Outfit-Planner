import test from 'node:test';
import assert from 'node:assert/strict';
import * as s from '../../js/scraper.js';

test('validateUrl: akzeptiert normale Shop-Links und normalisiert sie', () => {
  assert.deepEqual(s.validateUrl('  https://www.zalando.de/herren/?q=a b#top '), { ok: true, url: 'https://www.zalando.de/herren/?q=a%20b' });
  assert.equal(s.validateUrl('http://shop.example.com:8080/p').ok, true);
});

test('validateUrl: lehnt gefährliche und unsinnige Eingaben ab', () => {
  const bad = ['', '   ', 'kein link', 'javascript:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd', 'ftp://x.de/a',
    'https://user:pw@shop.de/', 'https://shop.de:22/', 'https://shop.de:3306/', 'https://localhost/', 'https://a.localhost/',
    'http://127.0.0.1/', 'http://0.0.0.0/', 'http://10.0.0.5/', 'http://192.168.1.1/', 'http://172.20.1.1/', 'http://169.254.169.254/latest/meta-data',
    'http://100.64.0.1/', 'http://[::1]/', 'http://[fd00::1]/', 'http://[::ffff:127.0.0.1]/', 'http://2130706433/', 'http://intranet/', 'https://drucker.local/', 'https://x.internal/',
    'https://shop.de/\u0000', 'https://shop.de/\u202etxt', 'x'.repeat(3000), 'https://' + 'a'.repeat(2100) + '.de', null, undefined, 42, {}];
  for (const u of bad) assert.equal(s.validateUrl(u).ok, false, String(u).slice(0, 50));
});

test('validateUrl: allowLocal erlaubt lokale Ziele (nur für die Entwicklung)', () => {
  assert.equal(s.validateUrl('http://127.0.0.1:8001/p', { allowLocal: true }).ok, true);
  assert.equal(s.validateUrl('http://localhost:3000/', { allowLocal: true }).ok, true);
  assert.equal(s.validateUrl('javascript:alert(1)', { allowLocal: true }).ok, false); // Schema bleibt verboten
  assert.equal(s.validateUrl('https://u:p@x.de/', { allowLocal: true }).ok, false);
});

test('sanitizeText: Tags, Steuer- und Richtungszeichen, Länge', () => {
  assert.equal(s.sanitizeText('  Rotes   Shirt \n\t Basic '), 'Rotes Shirt Basic');
  assert.equal(s.sanitizeText('<b>Hose</b><script>alert(1)</script> blau'), 'Hose alert(1) blau');
  assert.equal(s.sanitizeText('a\u0000b\u202ec\u200bd'), 'a b c d');
  assert.equal(s.sanitizeText('Tom &amp; Jerry &quot;Mix&quot; l&#39;été'), `Tom & Jerry "Mix" l'été`);
  assert.equal(s.sanitizeText('x'.repeat(500)).length, 120);
  assert.equal(s.sanitizeText('x'.repeat(500), 10).length, 10);
  for (const v of [null, undefined, {}, [], true]) assert.equal(s.sanitizeText(v), '');
  assert.equal(s.sanitizeText(42), '42');
});

test('parsePrice: gängige Schreibweisen', () => {
  const cases = { '49,99': 49.99, '1.299,00': 1299, '1,299.00': 1299, '€ 49.95': 49.95, '1.299': 1299, '12': 12, '49,99 €': 49.99, 'ab 19,90 EUR': 19.9 };
  for (const [k, v] of Object.entries(cases)) assert.equal(s.parsePrice(k), v, k);
  assert.equal(s.parsePrice('1 299,00 €'), 1299);
  assert.equal(s.parsePrice('1\u00a0299,00'), 1299);
  assert.equal(s.parsePrice('19,90 - 29,90'), 19.9);   // Preisspanne: erster Wert
  assert.equal(s.parsePrice('49,99.'), 49.99);
  for (const bad of ['abc', '', null, undefined, NaN, Infinity, '-5', '€ -5,00', '\u22125', '–7']) assert.equal(s.parsePrice(bad), null, String(bad));
  assert.equal(s.parsePrice(35.5), 35.5);
});

test('sanitizePrice: Bereich und Rundung', () => {
  assert.equal(s.sanitizePrice(49.999), 50);
  assert.equal(s.sanitizePrice(0), 0);
  for (const bad of [-1, 100001, NaN, Infinity, '5', null, undefined]) assert.equal(s.sanitizePrice(bad), null);
});

test('normalizeCurrency: nur bekannte Codes', () => {
  assert.equal(s.normalizeCurrency(' eur '), 'EUR');
  assert.equal(s.normalizeCurrency('XXX', 'EUR'), 'EUR');
  assert.equal(s.normalizeCurrency('<script>'), '');
  assert.equal(s.normalizeCurrency(5, 'CHF'), 'CHF');
});

test('sanitizeImageSrc: nur eingebettete Raster-Bilder (data:image), keine entfernten Adressen', () => {
  assert.ok(s.sanitizeImageSrc('data:image/png;base64,AAAA'));
  for (const bad of ['https://cdn.de/a.png', 'data:image/svg+xml;base64,AAAA', 'data:text/html;base64,AAAA', 'javascript:alert(1)', 'http://a.de/a.png', '', null, 3]) assert.equal(s.sanitizeImageSrc(bad), '');
});

test('sanitizeItem: bereinigt Backup-Einträge', () => {
  const cats = ['Oberteil', 'Jacke', 'Hose/Rock', 'Schuhe', 'Accessoire'];
  const ok = s.sanitizeItem({ id: 'i1', name: '<b>Shirt</b>', cat: 'Jacke', img: 'data:image/png;base64,AAAA', link: 'https://a.de/x#h', price: 19.999, cur: 'usd', ean: '4006381333931', evil: 'x', cut: 1 }, cats);
  assert.deepEqual(ok, { id: 'i1', name: 'Shirt', cat: 'Jacke', img: 'data:image/png;base64,AAAA', alpha: false, cut: true, mirror: false, link: 'https://a.de/x', price: 20, cur: 'USD', status: 'own', priceHistory: [], tags: [], ean: '4006381333931' });
  const odd = s.sanitizeItem({ id: 'i2', cat: 'Hacker', img: 'data:image/png;base64,AAAA', link: 'javascript:alert(1)', price: 'viel', ean: '12' }, cats);
  assert.equal(odd.cat, 'Oberteil'); assert.equal(odd.link, ''); assert.equal(odd.price, null); assert.equal(odd.name, 'Ohne Namen'); assert.equal('ean' in odd, false);
  for (const bad of [null, 1, 'x', {}, { id: '', img: 'https://a.de/a.png' }, { id: 'a' }, { id: 'a', img: 'javascript:alert(1)' }, { id: 'x'.repeat(65), img: 'https://a.de/a.png' }]) assert.equal(s.sanitizeItem(bad, cats), null);
});

test('sanitizeItem: Status und Preisverlauf', () => {
  const base = { id: 'a', img: 'data:image/png;base64,AAAA', name: 'x', cat: 'Oberteil' };
  assert.equal(s.sanitizeItem(base, ['Oberteil']).status, 'own');
  assert.equal(s.sanitizeItem({ ...base, status: 'wish' }, ['Oberteil']).status, 'wish');
  assert.equal(s.sanitizeItem({ ...base, status: '<script>' }, ['Oberteil']).status, 'own');
  assert.deepEqual(s.sanitizeItem(base, ['Oberteil']).priceHistory, []);
  const it = s.sanitizeItem({ ...base, priceHistory: [{ t: 2, v: 10 }, { t: 1, v: 20 }, { t: 'x', v: 1 }, null] }, ['Oberteil']);
  assert.deepEqual(it.priceHistory, [{ t: 1, v: 20 }, { t: 2, v: 10 }]);
});

test('normalizeLinkInput: ergänzt https:// bei Domain-Eingaben, lässt alles andere unverändert', () => {
  assert.equal(s.normalizeLinkInput('www.zalando.de/herren/hemd'), 'https://www.zalando.de/herren/hemd');
  assert.equal(s.normalizeLinkInput('  shop.de  '), 'https://shop.de');
  assert.equal(s.normalizeLinkInput('shop.de:8080/p?x=1'), 'https://shop.de:8080/p?x=1');
  assert.equal(s.normalizeLinkInput('https://shop.de/p'), 'https://shop.de/p');
  assert.equal(s.normalizeLinkInput('http://shop.de/p'), 'http://shop.de/p');
  for (const keep of ['javascript:alert(1)', 'data:text/html,x', 'localhost:8080', '192.168.1.1/x', 'kein link', 'evil.com:foo', 'file:///etc/passwd', '']) {
    assert.equal(s.normalizeLinkInput(keep), keep, keep);
  }
  assert.equal(s.normalizeLinkInput(null), '');
  assert.equal(s.normalizeLinkInput(42), '');
});

test('normalizeLinkInput + validateUrl: unsichere Eingaben werden auch nach der Ergänzung abgelehnt', () => {
  const good = s.validateUrl(s.normalizeLinkInput('www.shop.de/hemd'));
  assert.deepEqual(good, { ok: true, url: 'https://www.shop.de/hemd' });
  for (const bad of ['javascript:alert(1)', 'localhost/x', 'intranet.local/x', '127.0.0.1/a', 'user:pw@shop.de/x']) {
    assert.equal(s.validateUrl(s.normalizeLinkInput(bad)).ok, false, bad);
  }
});

test('looksLikeImageUrl: erkennt Bildendungen und Format-Parameter, sonst nein', () => {
  for (const yes of ['https://cdn.shop.de/img/hemd.jpg', 'https://cdn.shop.de/a/b.JPEG?w=400', 'https://x.de/p.webp', 'https://x.de/p.avif', 'https://x.de/img?id=3&format=webp', 'https://x.de/i?fm=png'])
    assert.equal(s.looksLikeImageUrl(yes), true, yes);
  for (const no of ['https://www.zalando.de/herren/hemd', 'https://shop.de/produkt/123?color=blue', 'https://x.de/a.html', 'https://x.de/i?format=html', 'kein link', ''])
    assert.equal(s.looksLikeImageUrl(no), false, no);
});

const CATS = ['Oberteil', 'Hose/Rock', 'Schuhe', 'Jacke', 'Accessoire'];
const PNG1 = 'data:image/png;base64,iVBORw0KGgo=';
const good = (id, extra = {}) => ({ id, name: 'Shirt', cat: 'Oberteil', img: PNG1, ...extra });

test('sanitizeImageSrc: nur eingebettete Bilder, keine entfernten Adressen', () => {
  assert.equal(s.sanitizeImageSrc(PNG1), PNG1);
  assert.equal(s.sanitizeImageSrc('https://tracker.example/pixel.png'), '');
  assert.equal(s.sanitizeImageSrc('http://x.example/a.png'), '');
  assert.equal(s.sanitizeImageSrc('data:image/svg+xml;base64,PHN2Zz4='), '');
  assert.equal(s.sanitizeImageSrc('data:text/html;base64,PGgxPg=='), '');
  assert.equal(s.sanitizeImageSrc('javascript:alert(1)'), '');
  assert.equal(s.sanitizeImageSrc('x'.repeat(14_000_001)), '');
  assert.equal(s.sanitizeImageSrc(null), '');
});

test('parseBackup: gültiges Backup wird bereinigt übernommen', () => {
  const r = s.parseBackup(JSON.stringify({ items: [good('a', { name: '<b>Hemd</b>‮', link: 'https://shop.example/x#frag' })], outfits: [{ id: 'o1', name: 'Büro <i>', pieces: [{ id: 'a', x: 1, y: 2, w: 100, r: 0 }], evil: 1 }], board: [{ id: 'a', x: 5, y: 5, w: 90, r: 0 }] }), CATS);
  assert.equal(r.ok, true);
  assert.equal(r.items.length, 1);
  assert.equal(r.items[0].name, 'Hemd');
  assert.equal(r.items[0].link, 'https://shop.example/x');
  assert.deepEqual(Object.keys(r.outfits[0]).sort(), ['id', 'name', 'pieces']);
  assert.equal(r.outfits[0].name, 'Büro');
  assert.equal(r.board.length, 1);
  assert.equal(r.skipped, 0);
});

test('parseBackup: gefährliche Teile werden übersprungen und gezählt', () => {
  const items = [
    good('ok'),
    good('remote', { img: 'https://tracker.example/p.png' }),
    good('svg', { img: 'data:image/svg+xml;base64,PHN2Zz4=' }),
    good('ok', { name: 'doppelt' }),
    { name: 'ohne id', cat: 'Oberteil', img: PNG1 },
    'kein Objekt', null, 42,
  ];
  const r = s.parseBackup(JSON.stringify({ items }), CATS);
  assert.equal(r.ok, true);
  assert.deepEqual(r.items.map(i => i.id), ['ok']);
  assert.equal(r.skipped, 7);
});

test('parseBackup: gefährliche Links werden geleert, Felder auf Whitelist beschränkt', () => {
  const r = s.parseBackup(JSON.stringify({ items: [good('a', { link: 'javascript:alert(1)', price: '1e999', cur: 'XXX', status: 'evil', __extra: '<script>' })] }), CATS);
  assert.equal(r.ok, true);
  const it = r.items[0];
  assert.equal(it.link, '');
  assert.equal(it.status, 'own');
  assert.equal('__extra' in it, false);
  assert.ok(Number.isFinite(it.price) || it.price === null);
});

test('parseBackup: __proto__-Schlüssel verändern keine Objekte', () => {
  const text = '{"items":[{"id":"a","name":"x","cat":"Oberteil","img":"' + PNG1 + '","__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}}}],"__proto__":{"polluted":true}}';
  const r = s.parseBackup(text, CATS);
  assert.equal(r.ok, true);
  assert.equal(({}).polluted, undefined);
  assert.equal(r.items[0].polluted, undefined);
});

test('parseBackup: Größen- und Mengengrenzen, kaputte Daten', () => {
  assert.equal(s.parseBackup('{kaputt', CATS).ok, false);
  assert.equal(s.parseBackup('[]', CATS).ok, false);
  assert.equal(s.parseBackup('null', CATS).ok, false);
  assert.equal(s.parseBackup('{"items":"x"}', CATS).ok, false);
  assert.equal(s.parseBackup(JSON.stringify({ items: Array.from({ length: s.BACKUP_LIMITS.items + 1 }, (_, i) => good('i' + i)) }), CATS).ok, false);
  assert.equal(s.parseBackup('x'.repeat(s.BACKUP_LIMITS.bytes + 1), CATS).ok, false);
  const many = s.parseBackup(JSON.stringify({ items: [], outfits: Array.from({ length: s.BACKUP_LIMITS.outfits + 50 }, (_, i) => ({ name: 'o' + i, pieces: [] })), board: Array.from({ length: 999 }, (_, i) => ({ id: 'p' + i, x: 0, y: 0, w: 100, r: 0 })) }), CATS);
  assert.equal(many.ok, true);
  assert.equal(many.outfits.length, s.BACKUP_LIMITS.outfits);
  assert.ok(many.board.length <= s.BACKUP_LIMITS.pieces);
});

test('sanitizeOutfit: Name als Text, feste Felder', () => {
  assert.equal(s.sanitizeOutfit(null), null);
  assert.equal(s.sanitizeOutfit('x'), null);
  const o = s.sanitizeOutfit({ id: 'x'.repeat(100), name: '<img src=x onerror=alert(1)>Look', pieces: 'kaputt', extra: 1 });
  assert.equal(o.name, 'Look');
  assert.deepEqual(o.pieces, []);
  assert.ok(o.id.length <= 64);
});
