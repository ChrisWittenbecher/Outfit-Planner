import test from 'node:test';
import assert from 'node:assert/strict';
import { canShareImage, classifyShareError, shareFileName } from '../../js/sharefile.js';

test('Dateiname: Umlaute, Leerzeichen und Sonderzeichen werden bereinigt', () => {
  assert.equal(shareFileName('Büro Look'), 'outfit-buero-look.png');
  assert.equal(shareFileName('Größe: Ärger & Spaß!'), 'outfit-groesse-aerger-spass.png');
  assert.equal(shareFileName('  Sommer   2026  '), 'outfit-sommer-2026.png');
  assert.equal(shareFileName('Café déjà vu'), 'outfit-cafe-deja-vu.png');
});

test('Dateiname: Standardname „Outfit 3“ wird nicht doppelt mit outfit beginnen', () => {
  assert.equal(shareFileName('Outfit 3'), 'outfit-3.png');
  assert.equal(shareFileName('Outfit'), 'outfit.png');
  assert.equal(shareFileName('OUTFIT-Party'), 'outfit-party.png');
});

test('Dateiname: ohne brauchbaren Namen heißt die Datei outfit.png', () => {
  for (const v of ['', '   ', '!!!', '---', '🙂🙂', '日本語', undefined, null, 42, {}, []]) assert.equal(shareFileName(v), 'outfit.png', String(v));
});

test('Dateiname: Pfadtrenner, Punkte und Steuerzeichen kommen nicht durch', () => {
  for (const v of ['../../etc/passwd', 'a/b\\c', 'x\u0000y.png', 'con.', 'a\nb', '<script>.png', '..', '.hidden']) {
    const f = shareFileName(v);
    assert.match(f, /^outfit(-[a-z0-9]+(-[a-z0-9]+)*)?\.png$/, v + ' → ' + f);
  }
  assert.equal(shareFileName('../../etc/passwd'), 'outfit-etc-passwd.png');
});

test('Dateiname: lange Namen werden gekürzt, ohne mit Bindestrich zu enden', () => {
  const long = shareFileName('a'.repeat(200));
  assert.equal(long, 'outfit-' + 'a'.repeat(40) + '.png');
  const cut = shareFileName('a'.repeat(39) + ' b' + 'c'.repeat(50));
  assert.ok(!/-\.png$/.test(cut), cut);
  assert.ok(cut.length <= 'outfit-'.length + 40 + '.png'.length, cut);
});

test('Unterstützung: nur mit share und canShare, und canShare muss für die Datei ja sagen', () => {
  const file = { name: 'a.png' };
  let seen;
  const yes = { share() {}, canShare(d) { seen = d; return true; } };
  assert.equal(canShareImage(yes, file), true);
  assert.deepEqual(seen, { files: [file] }, 'canShare bekommt die Datei übergeben');
  assert.equal(canShareImage({ share() {}, canShare: () => false }, file), false);
  assert.equal(canShareImage({ share() {}, canShare: () => 'yes' }, file), false, 'nur echtes true zählt');
  assert.equal(canShareImage({ share() {} }, file), false, 'ohne canShare (ältere Browser) kein Dateiversand');
  assert.equal(canShareImage({ canShare: () => true }, file), false, 'ohne share nicht');
  assert.equal(canShareImage({}, file), false);
  assert.equal(canShareImage(null, file), false);
  assert.equal(canShareImage(undefined, file), false);
});

test('Unterstützung: wirft canShare, gilt das als nicht unterstützt', () => {
  assert.equal(canShareImage({ share() {}, canShare() { throw new TypeError('x'); } }, { name: 'a.png' }), false);
});

test('Unterstützung: canShare wird als Methode des Navigators aufgerufen', () => {
  const nav = { share() {}, canShare() { return this === nav; } };
  assert.equal(canShareImage(nav, { name: 'a.png' }), true, 'sonst wirft der Browser „Illegal invocation“');
});

test('Fehlerart: Abbruch, fehlende Berührung, sonstiges', () => {
  assert.equal(classifyShareError(new DOMException('x', 'AbortError')), 'abort');
  assert.equal(classifyShareError(new DOMException('x', 'NotAllowedError')), 'denied');
  assert.equal(classifyShareError(new DOMException('x', 'DataError')), 'other');
  assert.equal(classifyShareError(new TypeError('x')), 'other');
  assert.equal(classifyShareError({ name: 'AbortError' }), 'abort');
  for (const v of [null, undefined, 'AbortError', 0, {}]) assert.equal(classifyShareError(v), 'other', String(v));
});
