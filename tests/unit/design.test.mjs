import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const raw = readFileSync(new URL('../../css/styles.css', import.meta.url), 'utf8');
const css = raw.replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length));
const sheet = readFileSync(new URL('../../js/sheet.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

/** Verschachtelte Blöcke, in denen die Stelle `at` steht (äußerster zuerst, ohne den Block der Stelle selbst). */
function enclosing(at) {
  const stack = []; let start = 0;
  for (let i = 0; i < at; i++) {
    const c = css[i];
    if (c === '{') { stack.push(css.slice(start, i).trim()); start = i + 1; }
    else if (c === '}') { stack.pop(); start = i + 1; }
    else if (c === ';') start = i + 1;
  }
  return stack;
}
const inside = (at, re) => enclosing(at).some(b => re.test(b));
const lineOf = at => css.slice(0, at).split('\n').length;

test('Jeder :hover-Stil steht hinter (hover: hover) and (pointer: fine), damit auf dem Handy nichts hängen bleibt', () => {
  const bad = [];
  for (const m of css.matchAll(/:hover\b/g)) {
    if (!inside(m.index, /^@media[^{]*\(hover:\s*hover\)[^{]*\(pointer:\s*fine\)/)) bad.push('Zeile ' + lineOf(m.index));
  }
  assert.deepEqual(bad, [], 'ungeschützter :hover');
});

test('Jede Schaltfläche mit Hover hat auch einen :active-Zustand (Druck-Rückmeldung für Touch)', () => {
  assert.match(css, /button:active:not\(:disabled\)/);
  assert.match(css, /button\.pri:active:not\(:disabled\)/);
  assert.match(css, /\.x button:active:not\(:disabled\)/);
  assert.match(css, /\.toast button:active:not\(:disabled\)/);
});

test('Animationen und Übergänge stehen nur in prefers-reduced-motion-Blöcken', () => {
  const bad = [];
  for (const m of css.matchAll(/(?<![-\w@])(transition|animation)(-[a-z]+)?\s*:/g)) {
    if (!inside(m.index, /prefers-reduced-motion/)) bad.push(m[0] + ' in Zeile ' + lineOf(m.index));
  }
  assert.deepEqual(bad, []);
});

test('Kein transition: all, kein scale(0), keine eigenen Kurven außerhalb der Tokens', () => {
  assert.doesNotMatch(css, /transition(-property)?\s*:\s*all\b/);
  assert.doesNotMatch(css, /scale\(\s*0\s*[,)]/);
  const tokensEnd = css.indexOf('@layer base {');
  assert.doesNotMatch(css.slice(tokensEnd), /cubic-bezier\(/, 'Kurven als Token (--ease-*) verwenden');
});

test('Bewegungs-Tokens: ease-out ist stark, Zeiten bleiben unter 300 ms', () => {
  const tok = name => css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim();
  for (const n of ['ease-out', 'ease-in-out', 'ease-sheet']) assert.match(tok(n) ?? '', /^cubic-bezier\(/, n);
  const x2 = +tok('ease-out').match(/cubic-bezier\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)/)[1];
  assert.ok(x2 >= 1, 'ease-out startet schnell (y2 ≥ 1)');
  for (const n of ['t-press', 't-fade', 't-sheet', 't-sheet-exit', 't-exit']) {
    const ms = parseFloat(tok(n));
    assert.ok(ms > 0 && ms <= 300, `${n} = ${tok(n)}`);
  }
  assert.ok(parseFloat(tok('t-exit')) < parseFloat(tok('t-fade')), 'Ausblenden ist schneller als Einblenden');
  for (const m of css.matchAll(/(?<![-\w])(?:transition|animation)\s*:[^;{}]*?(\d*\.?\d+)(ms|s)\b/g)) {
    const ms = m[2] === 's' ? +m[1] * 1000 : +m[1];
    assert.ok(ms <= 300, `Dauer ${m[1]}${m[2]} in Zeile ${lineOf(m.index)}`);
  }
});

test('Zeit zum Schließen in sheet.js deckt die Ausblend-Animationen ab', () => {
  const ms = name => parseFloat(css.match(new RegExp(`--${name}:\\s*([\\d.]+)ms`))[1]);
  const exit = +sheet.match(/EXIT_MS\s*=\s*(\d+)/)[1];
  assert.ok(exit >= Math.max(ms('t-exit'), ms('t-sheet-exit')), 'EXIT_MS zu kurz');
});

test('Press-Feedback: Skalierung bleibt dezent (0,9 bis 0,98) und nur mit erlaubter Bewegung', () => {
  const scales = [...css.matchAll(/:active[^{]*\{[^}]*scale\(([\d.]+)\)/g)].map(m => +m[1]);
  assert.ok(scales.length >= 3, 'Skalierung auf :active vorhanden');
  for (const s of scales) assert.ok(s >= 0.9 && s <= 0.98, 'scale ' + s);
  for (const m of css.matchAll(/:active[^{]*\{[^}]*scale\(/g)) assert.ok(inside(m.index, /no-preference/), 'ohne Bewegungs-Schutz in Zeile ' + lineOf(m.index));
});

test('Mobile Grundlagen: Tippfarbe, touch-action, dvh, Scrollsperre, Safe-Area', () => {
  assert.match(css, /-webkit-tap-highlight-color:\s*transparent/);
  assert.match(css, /touch-action:\s*manipulation/);
  assert.match(css, /max-height:\s*92dvh/);
  assert.match(css, /html:has\(dialog\[open\]\)\s*\{\s*overflow:\s*hidden/);
  assert.match(css, /overscroll-behavior:\s*contain/);
  assert.match(html, /viewport-fit=cover/);
  assert.doesNotMatch(html, /user-scalable\s*=\s*no|maximum-scale/, 'Zoom darf nicht gesperrt werden');
});

test('Jeder Dialog hat den Wisch-Griff und wird von sheet.js geöffnet und geschlossen', () => {
  const dialogs = [...html.matchAll(/<dialog id="(\w+)"[^>]*>\s*<div class="grab" aria-hidden="true"><\/div>/g)].map(m => m[1]);
  const all = [...html.matchAll(/<dialog id="(\w+)"/g)].map(m => m[1]);
  assert.deepEqual(dialogs.sort(), all.sort(), 'Griff fehlt');
  for (const f of ['ui', 'dialog', 'wardrobe']) {
    const src = readFileSync(new URL(`../../js/${f}.js`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /\.showModal\(\)|\.close\(\)/, `${f}.js ruft showModal/close direkt auf`);
  }
});

test('Dialoge sperren Interaktion während des Ausblendens', () => {
  assert.match(css, /dialog\[data-closing\]\s*\{\s*pointer-events:\s*none/);
});
