import test from 'node:test';
import assert from 'node:assert/strict';
import { TAG_LIMITS, fold, sanitizeTags, parseTags, matchItem, allTags, hasTag } from '../../js/search.js';
import { sanitizeText, sanitizeItem, parseBackup } from '../../js/scraper.js';

const clean = sanitizeText;
const CATS = ['Oberteil', 'Jacke', 'Hose/Rock', 'Schuhe', 'Accessoire'];

test('fold macht Groß- und Kleinschreibung, Akzente und ß gleich', () => {
  assert.equal(fold('Weiß'), 'weiss');
  assert.equal(fold('WEISS'), 'weiss');
  assert.equal(fold('Café Crème'), 'cafe creme');
  assert.equal(fold('Größe'), 'grosse');
  assert.equal(fold(null), '');
  assert.equal(fold(undefined), '');
  assert.equal(fold(42), '42');
});

test('parseTags trennt an Komma, Semikolon und Zeilenumbruch, entfernt # und Doppelte', () => {
  assert.deepEqual(parseTags('Büro, Sommer; #Leinen\nbüro,  ,SOMMER', clean), ['Büro', 'Sommer', 'Leinen']);
  assert.deepEqual(parseTags('', clean), []);
  assert.deepEqual(parseTags(',,,;;', clean), []);
});

test('sanitizeTags begrenzt Anzahl und Länge und reinigt Markup', () => {
  const many = Array.from({ length: 50 }, (_, i) => 'tag' + i);
  assert.equal(sanitizeTags(many, clean).length, TAG_LIMITS.count);
  assert.equal(sanitizeTags(['x'.repeat(200)], clean)[0].length, TAG_LIMITS.length);
  assert.deepEqual(sanitizeTags(['<img src=x onerror=alert(1)>Fest', '‮RTL'], clean), ['Fest', 'RTL']);
  for (const bad of [null, undefined, 5, 'text', {}, [null, 3, {}, []]]) assert.deepEqual(sanitizeTags(bad, clean), []);
});

const item = { name: 'Beiges Leinenhemd', cat: 'Oberteil', color: 'Beige', tags: ['Sommer', 'Büro'], status: 'own' };

test('matchItem: leere Suche passt immer, alle Wörter müssen vorkommen', () => {
  assert.equal(matchItem(item, ''), true);
  assert.equal(matchItem(item, '   '), true);
  assert.equal(matchItem(item, 'leinen'), true);
  assert.equal(matchItem(item, 'leinen sommer'), true);
  assert.equal(matchItem(item, 'leinen winter'), false);
});

test('matchItem findet Name, Kategorie, Farbe, Tag, Status und Shop', () => {
  assert.equal(matchItem(item, 'oberteil'), true);
  assert.equal(matchItem(item, 'beige'), true);
  assert.equal(matchItem(item, 'buero'), false, 'ü ist nicht u');
  assert.equal(matchItem(item, 'büro'), true);
  assert.equal(matchItem(item, 'besitze'), true);
  assert.equal(matchItem(item, 'wunschliste'), false);
  assert.equal(matchItem({ ...item, status: 'wish' }, 'wunschliste'), true);
  assert.equal(matchItem({ ...item, link: 'https://www.zara.com/x' }, 'zara', 'zara.com'), true);
});

test('matchItem: ß, Großschreibung und Teilwörter', () => {
  assert.equal(matchItem({ name: 'Weißes Hemd' }, 'WEISS'), true);
  assert.equal(matchItem({ name: 'Weisses Hemd' }, 'weiß'), true);
  assert.equal(matchItem({ name: 'Hemd' }, 'hem'), true);
});

test('matchItem verträgt fehlende und kaputte Felder', () => {
  assert.equal(matchItem({}, 'x'), false);
  assert.equal(matchItem({}, ''), true);
  assert.equal(matchItem({ name: 'A', tags: 'kein array' }, 'a'), true);
  assert.equal(matchItem({ name: 'A', tags: [null, 5, 'Gut'] }, 'gut'), true);
});

test('matchItem: Suchbegriffe mit Sonderzeichen werden nicht als Muster gedeutet', () => {
  for (const q of ['.*', '(', '[a-z]+', '\\', '$^', 'a|b']) assert.doesNotThrow(() => matchItem(item, q));
  assert.equal(matchItem(item, '.*'), false);
});

test('allTags zählt, fasst Schreibweisen zusammen und sortiert nach Häufigkeit', () => {
  const t = allTags([{ tags: ['Sommer', 'Büro'] }, { tags: ['sommer'] }, { tags: ['Alpha'] }, {}, { tags: 'x' }, { tags: [null, 3] }]);
  assert.deepEqual(t, [{ tag: 'Sommer', count: 2 }, { tag: 'Alpha', count: 1 }, { tag: 'Büro', count: 1 }]);
});

test('hasTag ignoriert Groß-/Kleinschreibung', () => {
  assert.equal(hasTag({ tags: ['Büro'] }, 'BÜRO'), true);
  assert.equal(hasTag({ tags: ['Büro'] }, 'Sport'), false);
  assert.equal(hasTag({}, 'x'), false);
});

const IMG = 'data:image/png;base64,iVBORw0KGgo=';
const base = { id: 'a', name: 'Hemd', cat: 'Oberteil', img: IMG };

test('sanitizeItem übernimmt Tags und Farbe, aber nur gültige', () => {
  const ok = sanitizeItem({ ...base, tags: ['Büro', 'büro', '<b>Sommer</b>'], color: 'Blau' }, CATS);
  assert.deepEqual(ok.tags, ['Büro', 'Sommer']);
  assert.equal(ok.color, 'Blau');
  const bad = sanitizeItem({ ...base, tags: 'x', color: 'Neonpink<script>' }, CATS);
  assert.deepEqual(bad.tags, []);
  assert.equal('color' in bad, false);
  assert.equal('color' in sanitizeItem({ ...base, color: 5 }, CATS), false);
});

test('parseBackup: ältere Backups ohne Tags und Farbe bleiben gültig', () => {
  const r = parseBackup(JSON.stringify({ items: [base] }), CATS);
  assert.equal(r.ok, true);
  assert.deepEqual(r.items[0].tags, []);
  assert.equal('color' in r.items[0], false);
});
