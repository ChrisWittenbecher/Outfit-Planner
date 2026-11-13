import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../css/styles.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

const tokensLayer = css.slice(css.indexOf('@layer tokens {'), css.indexOf('@layer base {'));
const rootBlock = tokensLayer.slice(tokensLayer.indexOf(':root {'), tokensLayer.indexOf('}', tokensLayer.indexOf(':root {')));
const pairs = {};   // name -> [hell, dunkel]
for (const m of rootBlock.matchAll(/--([\w-]+):\s*light-dark\(\s*(#[0-9a-fA-F]+)\s*,\s*(#[0-9a-fA-F]+)\s*\)/g)) pairs[m[1]] = [m[2], m[3]];
const stageVariants = {};
for (const m of tokensLayer.matchAll(/:root\[data-stage="(\w+)"\]\s*\{([^}]*)\}/g)) {
  stageVariants[m[1]] = Object.fromEntries([...m[2].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]+)/g)].map(x => [x[1], x[2]]));
}

const rgb = hex => { let h = hex.slice(1); if (h.length <= 4) h = [...h].map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const alpha = hex => { let h = hex.slice(1); if (h.length <= 4) h = [...h].map(c => c + c).join(''); return h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1; };
const over = (fg, bg) => { const a = alpha(fg), f = rgb(fg), b = rgb(bg); return '#' + f.map((c, i) => Math.round(c * a + b[i] * (1 - a)).toString(16).padStart(2, '0')).join(''); };
const lum = hex => { const [r, g, b] = rgb(hex).map(c => { c /= 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }); return .2126 * r + .7152 * g + .0722 * b; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
const tok = (name, theme) => pairs[name][theme === 'dark' ? 1 : 0];

// [Vordergrund, Hintergrund, Mindestwert, Beschreibung]
const CHECKS = [
  ['ink', 'bg', 4.5, 'Text auf Seite'], ['ink', 'panel', 4.5, 'Text auf Bereich'], ['ink', 'raised', 4.5, 'Text auf Karte'], ['ink', 'overlay', 4.5, 'Text im Dialog'], ['ink', 'canvas', 4.5, 'Text auf Arbeitsplatz'],
  ['mute', 'bg', 4.5, 'Nebentext auf Seite'], ['mute', 'panel', 4.5, 'Nebentext auf Bereich'], ['mute', 'raised', 4.5, 'Nebentext auf Karte'], ['mute', 'overlay', 4.5, 'Nebentext im Dialog'], ['mute', 'canvas', 4.5, 'Nebentext auf Arbeitsplatz'],
  ['on-ink', 'ink', 4.5, 'Schrift auf Schaltfläche (Hover)'],
  ['on-acc', 'acc', 4.5, 'Schrift auf Akzent-Schaltfläche'], ['on-acc', 'acc-strong', 4.5, 'Schrift auf Akzent (Hover)'],
  ['acc', 'panel', 4.5, 'Akzent-Link auf Bereich'], ['acc', 'raised', 4.5, 'Akzent-Link auf Karte'], ['acc', 'overlay', 4.5, 'Akzent im Dialog (Kalendermarkierung)'], ['sel-fg', 'sel-bg', 3, 'Markierung im gewählten Kalendertag'], ['acc-strong', 'acc-soft', 4.5, 'Akzentschrift auf Akzentfläche'],
  ['sel-fg', 'sel-bg', 4.5, 'gewählter Chip'],
  ['danger', 'panel', 4.5, 'Fehlerschrift'], ['danger', 'overlay', 4.5, 'Fehlerschrift im Dialog'], ['danger', 'danger-soft', 4.5, 'Fehlerschrift auf Fehlerfläche'], ['on-danger', 'danger', 4.5, 'Schrift auf Gefahr-Schaltfläche'],
  ['ok', 'panel', 4.5, 'Erfolgsschrift'], ['ok', 'ok-soft', 4.5, 'Erfolgsschrift auf Fläche'],
  ['field-line', 'field', 3, 'Rand der Eingabefelder (nicht-textlicher Kontrast)'], ['field-line', 'panel', 3, 'Rand der Eingabefelder auf Bereich'], ['field-line', 'overlay', 3, 'Rand der Eingabefelder im Dialog'],
  ['ink', 'field', 4.5, 'Text im Eingabefeld'],
  ['stage-ink', 'stage', 4.5, 'Beschriftung auf der Bühne'], ['stage-acc', 'stage', 3, 'Auswahl auf der Bühne'],
];
for (const theme of ['light', 'dark']) {
  for (const [fg, bg, min, what] of CHECKS) {
    test(`Kontrast ${theme}: ${what} (${fg} auf ${bg} ≥ ${min}:1)`, () => {
      const r = ratio(over(tok(fg, theme), over(tok(bg, theme), tok('bg', theme))), over(tok(bg, theme), tok('bg', theme)));
      assert.ok(r >= min, `${fg} ${tok(fg, theme)} auf ${bg} ${tok(bg, theme)}: ${r.toFixed(2)}:1 < ${min}:1`);
    });
  }
}
test('Bühnen-Varianten Hell, Mittel und Dunkel erreichen Lesbarkeit', () => {
  for (const [name, v] of Object.entries(stageVariants)) {
    assert.ok(ratio(v['stage-ink'], v.stage) >= 4.5, `${name}: Beschriftung ${ratio(v['stage-ink'], v.stage).toFixed(2)}:1`);
    assert.ok(ratio(v['stage-acc'], v.stage) >= 3, `${name}: Auswahl ${ratio(v['stage-acc'], v.stage).toFixed(2)}:1`);
  }
  assert.deepEqual(Object.keys(stageVariants).sort(), ['dark', 'light', 'mid']);
});
test('Kachel-Bühne bleibt auch im Dunkeln hell (Kleidungsstücke bleiben erkennbar)', () => {
  assert.ok(lum(tok('tile', 'dark')) > .75, `tile dunkel: ${tok('tile', 'dark')}`);
});
test('Ebenen im Dunkeln werden nach oben heller (Bereich < Karte < Dialog)', () => {
  assert.ok(lum(tok('bg', 'dark')) < lum(tok('panel', 'dark')) && lum(tok('panel', 'dark')) < lum(tok('raised', 'dark')) && lum(tok('raised', 'dark')) < lum(tok('overlay', 'dark')));
});

test('Rückfallblock stimmt für jedes Token mit dem Hell-Wert überein', () => {
  const fb = tokensLayer.slice(tokensLayer.indexOf('@supports not'));
  const fall = Object.fromEntries([...fb.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]+)/g)].map(m => [m[1], m[2]]));
  assert.deepEqual(Object.keys(fall).sort(), Object.keys(pairs).sort(), 'gleiche Tokens im Rückfall');
  for (const [k, [light]] of Object.entries(pairs)) assert.equal(fall[k].toLowerCase(), light.toLowerCase(), `--${k}`);
});

test('Farbwerte stehen nur in @layer tokens', () => {
  const rest = css.replace(tokensLayer, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const hits = [...rest.matchAll(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(|(?<![\w-])(?:white|black|red|blue|green|gray|grey)(?![\w-])/g)]
    .map(m => m[0]);
  assert.deepEqual(hits, [], 'Farbliterale außerhalb der Tokens: ' + hits.join(' '));
});
test('Jedes verwendete var(--token) ist definiert', () => {
  const defined = new Set([...Object.keys(pairs), 'radius', 'radius-sm', 'tap', 'font', 'serif']);
  const used = new Set([...css.matchAll(/var\(--([\w-]+)/g)].map(m => m[1]));
  const undef = [...used].filter(u => !defined.has(u) && !new RegExp(`--${u}\\s*:`).test(css));
  assert.deepEqual(undef, [], 'nicht definiert: ' + undef.join(', '));
});

test('theme-init.js ist ein blockierendes Skript im Kopf (kein defer, async, module)', () => {
  const head = html.slice(0, html.indexOf('</head>'));
  const tag = head.match(/<script[^>]*theme-init\.js[^>]*>/)?.[0];
  assert.ok(tag, 'theme-init.js im head');
  assert.ok(!/defer|async|type="module"/.test(tag), tag);
});
test('color-scheme ist als Meta und im CSS auf hell und dunkel gesetzt', () => {
  assert.match(html, /<meta name="color-scheme" content="light dark">/);
  assert.match(css, /color-scheme:\s*light dark/);
  assert.match(css, /:root\[data-theme="light"\]\s*\{\s*color-scheme:\s*light/);
  assert.match(css, /:root\[data-theme="dark"\]\s*\{\s*color-scheme:\s*dark/);
});
const CLASSIC = ['theme-init.js', 'fallback.js', 'recover.js'];
test('Jedes Modul in js/ wird vorab geladen (modulepreload), klassische Skripte ausgenommen', async () => {
  const { readdirSync } = await import('node:fs');
  const files = readdirSync(new URL('../../js/', import.meta.url)).filter(f => f.endsWith('.js') && !CLASSIC.includes(f));
  const pre = new Set([...html.matchAll(/rel="modulepreload"\s+href="js\/([\w-]+\.js)"/g)].map(m => m[1]));
  assert.deepEqual(files.filter(f => !pre.has(f)), [], 'nicht vorgeladen');
  assert.deepEqual([...pre].filter(f => !files.includes(f)), [], 'Vorladen ohne Datei');
});
