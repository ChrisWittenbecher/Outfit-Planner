import test from 'node:test';
import assert from 'node:assert/strict';
import { ISSUE_URL, KINDS, LIMITS, buildBody, buildIssue, cleanText, infoBlock, isKind, plainText, problem } from '../../js/feedback.js';

const params = url => new URL(url).searchParams;

test('Issue-Adresse: fester Host und Pfad, nur kodierte Werte in der Abfrage', () => {
  const r = buildIssue({ kind: 'bug', title: 'Knopf tut nichts', text: 'Beim Tippen auf Speichern passiert nichts, sonst alles gut.', info: '- Version: 2.1.0' });
  const u = new URL(r.url);
  assert.equal(u.origin + u.pathname, ISSUE_URL);
  assert.equal(u.origin, 'https://github.com');
  assert.deepEqual([...u.searchParams.keys()].sort(), ['body', 'labels', 'title']);
  assert.equal(u.searchParams.get('labels'), 'bug');
  assert.equal(u.searchParams.get('title'), 'Knopf tut nichts');
  assert.match(u.searchParams.get('body'), /### Fehler\n\nBeim Tippen/);
  assert.match(u.searchParams.get('body'), /### Angaben aus der App\n\n- Version: 2\.1\.0/);
  assert.equal(r.trimmed, false);
});

test('Wunsch: Label enhancement und eigene Überschrift', () => {
  const r = buildIssue({ kind: 'idea', title: 'Mehr Farben', text: 'Ich wünsche mir weitere Farben für die Teile.' });
  assert.equal(params(r.url).get('labels'), 'enhancement');
  assert.match(params(r.url).get('body'), /### Wunsch/);
  assert.doesNotMatch(params(r.url).get('body'), /Angaben aus der App/);
});

test('Unbekannte Art fällt auf Fehler zurück, nie auf ein fremdes Label', () => {
  for (const kind of ['', 'admin', '__proto__', 'constructor', null, 5]) {
    const r = buildIssue({ kind, title: 'Titel', text: 'Beschreibung mit genug Zeichen' });
    assert.equal(params(r.url).get('labels'), 'bug', String(kind));
    assert.equal(isKind(kind), false);
  }
  assert.equal(isKind('bug') && isKind('idea'), true);
});

test('Eingaben können Host, Pfad und weitere Parameter nicht verändern', () => {
  const evil = 'x&labels=security&assignees=evil#frag?a=b/../../..%00%0d%0aHost: evil.example\\ \u202E';
  const r = buildIssue({ kind: 'bug', title: evil, text: evil + '\njavascript:alert(1)\n<script>x</script>', info: evil });
  const u = new URL(r.url);
  assert.equal(u.origin + u.pathname, ISSUE_URL);
  assert.equal(u.hash, '');
  assert.deepEqual([...u.searchParams.keys()].sort(), ['body', 'labels', 'title']);
  assert.equal(u.searchParams.get('labels'), 'bug');
  assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u202E]/.test(u.searchParams.get('body') + u.searchParams.get('title')));
  assert.ok(!u.searchParams.get('title').includes('\n'), 'Titel nur eine Zeile');
});

test('cleanText: Zeilenenden, Steuerzeichen, Länge, Typ', () => {
  assert.equal(cleanText('a\r\nb\rc', 50, true), 'a\nb\nc');
  assert.equal(cleanText('a\n\n\n\nb', 50, true), 'a\n\nb');
  assert.equal(cleanText('  zu   viel \n Platz ', 50), 'zu viel Platz');
  assert.equal(cleanText('a\u0000b\u0007c', 50), 'abc');
  assert.equal(cleanText('x'.repeat(500), 20).length, 20);
  assert.equal(cleanText('😀'.repeat(30), 10), '😀'.repeat(10), 'zählt Zeichen, nicht UTF-16-Einheiten');
  for (const v of [undefined, null, 5, {}, []]) assert.equal(cleanText(v, 10), '');
});

test('infoBlock: nur Zeichenketten, leere Felder fallen weg, Länge begrenzt', () => {
  assert.equal(infoBlock({ version: '2.1.0', mode: 'Browser', screen: '390×844', device: '' }), '- Version: 2.1.0\n- Anzeige: Browser\n- Bildschirm: 390×844');
  assert.equal(infoBlock({}), '');
  assert.ok(infoBlock({ device: 'x'.repeat(5000) }).length <= LIMITS.info * 4);
  assert.equal(infoBlock({ version: { toString() { return 'x'; } } }), '', 'Nicht-Zeichenketten werden ignoriert');
});

test('buildBody: ohne Beschreibung ein Hinweis, mit Angaben ein eigener Abschnitt', () => {
  assert.match(buildBody('bug', '', ''), /_\(keine Beschreibung\)_/);
  assert.match(buildBody('idea', 'Text', '- Version: 1'), /### Wunsch\n\nText\n\n### Angaben aus der App\n\n- Version: 1\n\n_Gesendet/);
  assert.doesNotMatch(buildBody('bug', 'Text', ''), /Angaben/);
});

test('Zu lange Eingaben: Adresse bleibt unter der Grenze, Text wird gekürzt und gemeldet', () => {
  for (const ch of ['a', 'ä', '😀', '漢']) {
    const r = buildIssue({ kind: 'bug', title: ch.repeat(LIMITS.title), text: (ch + ' ').repeat(LIMITS.text), info: '- Version: 2.1.0' });
    assert.ok(r.url.length <= LIMITS.url, `${ch}: ${r.url.length}`);
    assert.equal(r.trimmed, ch !== 'a', ch);
    if (r.trimmed) assert.match(params(r.url).get('body'), / …\n/);
    assert.equal(new URL(r.url).origin, 'https://github.com');
  }
});

test('Normaler Text wird nicht gekürzt', () => {
  const r = buildIssue({ kind: 'idea', title: 'Titel', text: 'Ein ganz normaler Satz. '.repeat(40) });
  assert.equal(r.trimmed, false);
  assert.ok(r.url.length < LIMITS.url);
});

test('problem: Titel und Beschreibung brauchen Mindestlängen, Leerraum zählt nicht', () => {
  assert.equal(problem({ title: 'ab', text: 'lange genug für eine Beschreibung' }).field, 'title');
  assert.equal(problem({ title: '   ab   ', text: 'x' }).field, 'title');
  assert.equal(problem({ title: 'Titel', text: '          ' }).field, 'text');
  assert.equal(problem({ title: 'Titel', text: 'kurz' }).field, 'text');
  assert.equal(problem({ title: 'Titel', text: 'zehn Zeichen' }), null);
  assert.ok(problem({ title: '', text: '' }).message.length > 10);
});

test('Arten: Beschriftung, Frage und Label vorhanden, Objekt eingefroren', () => {
  for (const k of Object.values(KINDS)) for (const f of ['label', 'ask', 'gh', 'prefix']) assert.ok(k[f] && typeof k[f] === 'string');
  assert.ok(Object.isFrozen(KINDS) && Object.isFrozen(LIMITS));
});

test('plainText: vollständiger Text zum Kopieren, auch wenn die Adresse kürzen müsste', () => {
  const text = ('漢 ').repeat(LIMITS.text);
  const full = plainText({ kind: 'idea', title: '  Titel  ', text, info: '- Version: 2.1.0' });
  assert.ok(full.startsWith('Titel\n\n### Wunsch\n\n'));
  assert.ok(full.includes('- Version: 2.1.0'));
  assert.ok(full.length > buildIssue({ kind: 'idea', title: 'Titel', text, info: '' }).body.length, 'länger als der für GitHub gekürzte Text');
  assert.equal(plainText({ kind: 'x', title: 'T', text: '' }).includes('### Fehler'), true);
});
