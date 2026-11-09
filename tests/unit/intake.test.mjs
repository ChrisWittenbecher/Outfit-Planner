import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_BATCH, nameFromFile } from '../../js/intake.js';
import { sanitizeText } from '../../js/scraper.js';

const n = f => nameFromFile(f, sanitizeText);

test('nameFromFile macht aus Dateinamen brauchbare Namen', () => {
  assert.equal(n('Blaues Hemd.jpg'), 'Blaues Hemd');
  assert.equal(n('trenchcoat_beige.PNG'), 'trenchcoat beige');
  assert.equal(n('hose.final.webp'), 'hose.final');
  assert.equal(n('Jeans - Levis 501.jpeg'), 'Jeans - Levis 501');
});

test('nameFromFile: Kamera-, Screenshot- und Zahlennamen sind kein Name', () => {
  for (const f of ['IMG_1234.jpg', 'img-0042.png', 'DSC00123.JPG', 'PXL_20260101_123456789.jpg', 'Screenshot 2026-11-08 at 10.00.00.png', 'Bildschirmfoto 2026-11-08 um 10.00.png', '123456.png', '2026-11-08.png', 'image.png', 'Foto.jpg', '.png', '', null, undefined, 42])
    assert.equal(n(f), 'Neues Teil', String(f));
});

test('nameFromFile reinigt Markup und begrenzt die Länge', () => {
  assert.equal(n('<img src=x onerror=alert(1)>Hemd.png'), 'Hemd');
  assert.ok(n('a'.repeat(500) + '.png').length <= 120);
});

test('MAX_BATCH ist begrenzt', () => { assert.ok(MAX_BATCH > 1 && MAX_BATCH <= 50); });
