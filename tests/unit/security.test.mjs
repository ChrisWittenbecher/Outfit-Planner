import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = f => readFile(join(root, f), 'utf8');
const jsFiles = async () => (await readdir(join(root, 'js'))).filter(f => f.endsWith('.js')).map(f => 'js/' + f);
const html = await read('index.html');

function csp() {
  const m = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html);
  assert.ok(m, 'Content-Security-Policy fehlt');
  return new Map(m[1].split(';').map(s => s.trim()).filter(Boolean).map(d => { const [k, ...v] = d.split(/\s+/); return [k, v]; }));
}

test('CSP: alles gesperrt, was nicht ausdrücklich erlaubt ist', () => {
  const c = csp();
  assert.deepEqual(c.get('default-src'), ["'none'"]);
  for (const d of ['base-uri', 'form-action', 'object-src']) assert.deepEqual(c.get(d), ["'none'"], d);
  for (const [k, v] of c) {
    assert.ok(!v.includes("'unsafe-inline'"), k + ' erlaubt unsafe-inline');
    assert.ok(!v.includes("'unsafe-eval'"), k + ' erlaubt unsafe-eval');
    assert.ok(!v.includes('*') && !v.includes('http:') && !v.includes('data:') || k === 'img-src', k + ' ist zu weit offen');
  }
  assert.ok(c.get('script-src').includes("'self'"));
  assert.ok(c.get('style-src').every(s => s === "'self'"), 'style-src nur eigener Ursprung');
});

test('CSP: externe Quellen sind genau die bekannte, geprüfte Liste (jede Erweiterung braucht ein Review)', () => {
  const c = csp();
  const external = [...c].flatMap(([k, v]) => v.filter(s => /^https:\/\/[^/]+$/.test(s)).map(s => k + ' ' + s)).sort();
  assert.deepEqual(external, [
    'connect-src https://cdn.jsdelivr.net', 'connect-src https://staticimgly.com',
    'script-src https://cdn.jsdelivr.net',
  ]);
});

test('HTML: keine Inline-Skripte, keine Ereignis-Attribute, keine style-Attribute', () => {
  const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)];
  assert.ok(scripts.length > 0);
  for (const [, attrs] of scripts) assert.match(attrs, /\bsrc="[^"]+"/, 'Inline-Skript gefunden: ' + attrs);
  assert.equal(/\son[a-z]+\s*=/i.test(html), false, 'Ereignis-Attribut im HTML');
  assert.equal(/\sstyle\s*=/i.test(html), false, 'style-Attribut im HTML');
  assert.equal(/javascript:/i.test(html), false, 'javascript: im HTML');
});

test('JS: kein eval, kein Function-Konstruktor, kein document.write, kein javascript:', async () => {
  for (const f of await jsFiles()) {
    const src = (await read(f)).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    assert.equal(/\beval\s*\(|new\s+Function\s*\(|document\.write(ln)?\s*\(|javascript:/.test(src), false, f);
    assert.equal(/\bsetTimeout\s*\(\s*['"`]|\bsetInterval\s*\(\s*['"`]/.test(src), false, f + ': Zeichenkette als Zeitgeber-Code');
  }
});

test('JS: innerHTML bekommt nur feste Texte, nie Daten', async () => {
  for (const f of await jsFiles()) {
    for (const m of (await read(f)).matchAll(/\.innerHTML\s*(\+?=)\s*([^;]+);/g)) {
      const rest = m[2].replace(/'[^']*'/g, '');
      assert.match(rest, /^[\s+?:()]*(state\.data\.items\.length)?[\s+?:()]*$/, `${f}: innerHTML mit Variablen → textContent oder DOM-Aufbau nutzen: ${m[0].slice(0, 80)}`);
    }
  }
});

test('Links: jedes target="_blank" hat rel mit noopener und noreferrer', async () => {
  for (const f of await jsFiles()) {
    const src = await read(f);
    const blanks = (src.match(/\.target\s*=\s*'_blank'/g) || []).length;
    const rels = (src.match(/\.rel\s*=\s*'noopener noreferrer'/g) || []).length;
    assert.equal(rels >= blanks, true, f + ': target=_blank ohne rel="noopener noreferrer"');
  }
  assert.equal(/target="_blank"(?![^>]*noopener)/.test(html), false);
});

test('Workflows: feste Commits, minimale Rechte, keine gefährlichen Auslöser', async () => {
  const dir = join(root, '.github/workflows');
  const files = (await readdir(dir)).filter(f => f.endsWith('.yml'));
  assert.ok(files.length > 0);
  for (const f of files) {
    const y = await readFile(join(dir, f), 'utf8');
    for (const m of y.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)) {
      assert.match(m[1], /@[0-9a-f]{40}$/, `${f}: Action nicht auf einen Commit gepinnt: ${m[1]}`);
    }
    assert.match(y, /^permissions:/m, f + ': „permissions“ auf oberster Ebene fehlt');
    assert.equal(/pull_request_target|workflow_run/.test(y), false, f + ': riskanter Auslöser');
    for (const m of y.matchAll(/run:\s*([\s\S]*?)(?=\n\s*-\s|\n\S|$)/g)) {
      assert.equal(/\$\{\{\s*github\.(event|head_ref)/.test(m[1]), false, f + ': Einschleusen in run: möglich');
    }
  }
});

test('Repository: Lockfile und Dependabot vorhanden, keine Geheimnisse im Code', async () => {
  const names = await readdir(root);
  assert.ok(names.includes('package-lock.json'), 'package-lock.json fehlt');
  assert.ok((await readdir(join(root, '.github'))).includes('dependabot.yml'));
  const secret = /(ghp_|gho_|ghs_|github_pat_)[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,}/;
  for (const f of [...(await jsFiles()), 'index.html', 'README.md', 'package.json']) assert.equal(secret.test(await read(f)), false, f);
});
