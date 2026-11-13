import { devices } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PNG, checker, closed, engine, launch, persisted, reload, root, startServer } from './helpers.mjs';
import { fakeGoogle } from './fakegoogle.mjs';
import { DATA, IMG, offset } from './fixtures.mjs';

// Update von der letzten 1.15.x-Version auf den aktuellen Stand, mit echten Daten: Die alte Version kommt aus dem Git-Verlauf und läuft in
// derselben Browser-Umgebung (gleicher Ursprung, gleiche IndexedDB, gleicher Service Worker), dann wird wie bei der Person aktualisiert.
// Dieser Test gilt für Updates auf 2.0.x. Sind alle Geräte auf 2.x, kann er auf neuere Ausgangsversionen umgestellt werden.
// Geprüft: nichts geht verloren, alle Seiten rechnen mit den alten Daten richtig, Offline-Start jeder Seite, Google-Sicherung läuft weiter.
const PORT = 8766, ORIGIN = `http://localhost:${PORT}`, BASE = `${ORIGIN}/index.html`;
const WORKER = 'https://anprobe.chris-wittenbecher.workers.dev';   // wie in js/config.js (die echten Adressen werden nachgestellt)
// Ausgangsversionen: die letzte vor 2.0 und die Etappen 4 und 5 (Merge von Pull Request 45, 50 und 51)
const OLDS = { '1.15.15': 'd7dc596', '1.19.0': 'f0dcd8e', '1.20.0': '92aa111' };
const { ok, state: result } = checker();
// Google-Anmeldung und -Sicherung brauchen das nachgestellte Google (page.route). In der Safari-Engine greift page.route bei Seiten, die ein Service Worker
// steuert, nicht für fremde Adressen (die Anfrage geht am Test vorbei ins echte Netz). Dort läuft der Update-Weg ohne Google; Anmeldung und Sicherung
// prüfen cloud.mjs (ohne Service Worker, beide Engines) und dieser Test in Chromium.
const GOOGLE = engine === 'chromium' && !process.env.NO_GOOGLE;   // NO_GOOGLE=1 probiert den Weg der Safari-Engine auch in Chromium
const seen = new WeakMap();   // Seite → Fehlermeldungen, für die Diagnose, wenn die App nicht startet
const ready = async p => {
  try { await p.waitForSelector('html[data-ready]', { state: 'attached', timeout: 20000 }); }
  catch (e) {
    console.log('INFO  App wurde nicht bereit: ' + JSON.stringify(await p.evaluate(() => ({ url: location.href, ver: document.getElementById('ver')?.textContent, body: document.body.innerText.slice(0, 160), state: document.readyState })).catch(x => String(x))) + ' Fehler: ' + (seen.get(p) || []).join(' | '));
    throw e;
  }
};
const wait = async (cond, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await cond()) return true; await new Promise(r => setTimeout(r, 60)); } return false; };
const txt = async (p, sel) => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
const only = k => !process.env.ONLY || process.env.ONLY.split(',').includes(k);   // ONLY=A,B,C,D für einzelne Abschnitte
const NEW = JSON.parse(await readFile(path.join(root, 'version.json'), 'utf8')).version;

// ---- die alten Versionen aus dem Verlauf holen ----
const git = (...args) => execFileSync('git', ['-C', root, ...args], { maxBuffer: 400e6 });
const dirs = {};   // Version → entpackter Ordner
const tmp = await mkdtemp(path.join(tmpdir(), 'outfit-old-'));
for (const [label, rev] of Object.entries(OLDS)) {
  try { git('cat-file', '-e', rev + '^{commit}'); }
  catch {
    if (process.env.CI) { ok(false, `Der Verlauf enthält ${rev} (${label}) nicht (Checkout mit fetch-depth: 0 nötig)`); await rm(tmp, { recursive: true, force: true }); process.exit(1); }
    console.log(`INFO  ${label} (${rev}) ist in diesem Verlauf nicht vorhanden, Update-Test übersprungen`);
    await rm(tmp, { recursive: true, force: true }); process.exit(0);
  }
  dirs[label] = path.join(tmp, label); await mkdir(dirs[label]);
  execFileSync('tar', ['-x', '-C', dirs[label]], { input: git('archive', '--format=tar', rev), maxBuffer: 400e6 });
  const v = JSON.parse(await readFile(path.join(dirs[label], 'version.json'), 'utf8')).version;
  ok(v === label && v !== NEW, `alte Version ${v} (${rev}) und neue Version ${NEW} sind verschieden`);
}

let current = root;   // welche Dateien der Server gerade ausliefert
const server = await startServer(PORT, () => current);
const browser = await launch();
const { fake, setup } = fakeGoogle({ ORIGIN, W: WORKER, ok });

// ---- Bestand im Format von 1.15.x: Beispieldaten der Auswertung, ergänzt um alles, was ein Backup enthalten kann ----
const DAY = 86400000;
const EXTRA = {
  a1: { link: 'https://example.com/hemd', tags: ['Büro'], cut: true, orig: IMG, priceHistory: [{ t: Date.now() - 40 * DAY, v: 70 }, { t: Date.now() - 10 * DAY, v: 60 }] },
  a2: { tags: ['Büro', 'Alltag'], cut: true },
  a4: { mirror: true, cut: true },
  a5: { tags: ['Sport'], alpha: true },
  a7: { link: 'https://example.org/kleid', price: 49.9, cur: 'USD' },
};
const OLD_DATA = {
  ...DATA,
  items: DATA.items.map(i => ({ ...i, ...(EXTRA[i.id] || {}) })),
  outfits: [...DATA.outfits, { id: 'o2', name: 'Wochenende', pieces: [{ id: 'a1', x: 20, y: 20, w: 120, r: 0 }, { id: 'a8', x: 30, y: 200, w: 150, r: 5 }] }],
  board: [{ id: 'a1', x: 100, y: 30, w: 200, r: 0 }, { id: 'a2', x: 110, y: 230, w: 180, r: 12 }],
  plans: { [offset(2)]: 'o1' },
};
const N_ITEMS = OLD_DATA.items.length, N_WEARS = OLD_DATA.wears.length;

// Tiefer Vergleich ohne Rücksicht auf die Reihenfolge der Schlüssel; gibt den ersten Unterschied zurück
const diff = (a, b, at = '') => {
  if (a === b) return '';
  if (Array.isArray(a) && Array.isArray(b)) { if (a.length !== b.length) return `${at}: Länge ${a.length} ≠ ${b.length}`; for (let i = 0; i < a.length; i++) { const d = diff(a[i], b[i], `${at}[${i}]`); if (d) return d; } return ''; }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of [...keys].sort()) { const d = diff(a[k], b[k], `${at}.${k}`); if (d) return d; }
    return '';
  }
  return `${at}: ${JSON.stringify(a)?.slice(0, 60)} ≠ ${JSON.stringify(b)?.slice(0, 60)}`;
};
const sameData = (a, b) => diff({ items: a.items, outfits: a.outfits, wears: a.wears, plans: a.plans, board: a.board }, { items: b.items, outfits: b.outfits, wears: b.wears, plans: b.plans, board: b.board });

const exportJson = async p => {
  const dl = p.waitForEvent('download');
  await p.evaluate(() => document.getElementById('exp').click());
  return JSON.parse(await readFile(await (await dl).path(), 'utf8'));
};
const importJson = async (p, data, count) => {
  await p.setInputFiles('#impf', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
  await p.waitForFunction(() => document.getElementById('uiDlg').open);
  await p.click('#uiOk'); await closed(p, 'uiDlg');
  await p.waitForFunction(n => document.querySelectorAll('#grid .card').length === n, count);
};
const cards = p => p.locator('#grid .card').count();
const menuOpen = p => p.waitForFunction(() => document.getElementById('acctMenu').matches(':popover-open'));
const login = async p => { await p.click('#cloudBtn'); await menuOpen(p); await p.click('#cloudIn'); await ready(p); };
const remote = () => { const f = [...fake.files.values()][0]; return f ? JSON.parse(f.text) : null; };
const goTab = async (p, id) => { await p.click('#tab-' + id); await p.waitForFunction(i => !document.getElementById('view-' + i).hidden, id); };

/** Fehlermeldungen der Seite für die Diagnose sammeln (Skriptfehler kommen schon aus setup, hier kommen Konsolenfehler dazu). */
const track = g => { seen.set(g.p, g.errors); g.p.on('console', m => { if (m.type() === 'error') g.errors.push('console: ' + m.text().slice(0, 160)); }); return g; };
const cachesNow = p => p.evaluate(async () => {
  const out = {};
  for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).length;
  const r = await navigator.serviceWorker.getRegistration();
  out.sw = r ? ['installing', 'waiting', 'active'].map(k => k + ':' + (r[k] ? r[k].state : '-')).join(' ') : 'keine';
  return out;
});

/**
 * Nur der Cache der neuen Version enthält Dateien. Ein leerer Cache der alten Version darf übrig sein: Die alte App hat beim Aktualisieren noch
 * Dateien nachgeladen und dabei ihren Cache kurz nach dem Löschen durch den neuen Service Worker leer neu angelegt (harmlos, wird beim nächsten Update gelöscht).
 */
const onlyNewCache = c => (c['anprobe-' + NEW] || 0) > 0 && Object.entries(c).every(([k, n]) => k === 'sw' || k === 'anprobe-' + NEW || n === 0);

/** Älteren Stand starten: Seite laden, Service Worker abwarten, Bestand per Backup einlesen. */
async function startOld(ctx, { google, from }) {
  current = dirs[from];
  const g = await setup(ctx, { patchPage: false });
  const p = track(g).p;
  await p.goto(BASE); await ready(p);
  await p.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 20000 });
  ok(await txt(p, '#ver') === from, `alte Version läuft: ${await txt(p, '#ver')}`);
  await importJson(p, OLD_DATA, N_ITEMS);
  ok(await persisted(p, N_ITEMS, N_WEARS), 'Bestand liegt in IndexedDB (' + N_ITEMS + ' Teile, ' + N_WEARS + ' Einträge)');
  const before = await exportJson(p);
  ok(before.items.length === N_ITEMS && before.outfits.length === 2 && before.wears.length === N_WEARS && Object.keys(before.plans).length === 1 && before.board.length === 2, 'altes Backup (von der alten Version erzeugt): Teile, Outfits, Einträge, Plan, Board');
  if (google) {
    await login(p);
    ok(await wait(async () => remote()?.items.length === N_ITEMS, 30000), 'alte Version sichert alle Teile in Google Drive');
    ok(await wait(() => p.evaluate(() => document.getElementById('cloudBtn').hasAttribute('data-on'))), 'angemeldet');
  }
  return { p, g, before };
}

/** Wie bei der Person: entweder „Nach Update suchen“ und „Aktualisieren“, oder einfach die App neu öffnen. */
async function update(p, how) {
  current = root;
  let tries = 0;
  if (how === 'button') {
    await p.evaluate(() => document.getElementById('updBtn').click());
    await p.waitForSelector('#toasts button:has-text("Aktualisieren")', { timeout: 10000 });
    ok((await txt(p, '#toasts')).includes('Neue Version ' + NEW), 'alte Version bietet ' + NEW + ' an');
    const nav = p.waitForNavigation({ timeout: 20000 });
    await p.click('#toasts button:has-text("Aktualisieren")'); await nav; await ready(p); tries = 1;
  } else {
    for (; tries < 6; ) {
      tries++;
      try { await p.reload(); } catch { await p.waitForTimeout(500); }   // die Selbstheilung kann das Neuladen unterbrechen
      await ready(p);
      if (await txt(p, '#ver') === NEW && !await p.evaluate(() => sessionStorage.getItem('anprobe-heal'))) break;
      if (await txt(p, '#ver') === NEW) { await p.waitForTimeout(1500); if (await txt(p, '#ver') === NEW) break; }
      await p.waitForTimeout(1200);
    }
    ok(tries <= 3, `einfach neu öffnen genügt: neue Version nach ${tries} Mal neu laden`);
  }
  ok(await txt(p, '#ver') === NEW, 'neue Version läuft: ' + await txt(p, '#ver'));
  // Zwischen „Aktualisieren“ und dem Wechsel des Service Workers kann kurz ein Mischstand entstehen (alte Seite, neue Module, besonders wenn die App
  // über „/“ geöffnet war). js/guard.js repariert ihn mit einem Neuladen. Fehlermeldungen aus dieser Zeit sind nur dann in Ordnung, wenn das geschah.
  const healed = await p.evaluate(() => sessionStorage.getItem('anprobe-heal'));
  const early = (seen.get(p) || []).splice(0);
  ok(!early.length || !!healed, 'Fehlermeldungen beim Wechsel nur mit Selbstheilung (' + (healed ? 'Selbstheilung lief' : 'kein Mischstand') + (early.length ? ', ' + early.length + ' Meldung(en)' : '') + ')');
  if (early.length) console.log('INFO  ' + early.join(' | ').slice(0, 300));
  // Der neue Service Worker übernimmt, sobald der alte nichts mehr zu tun hat oder die App geschlossen wird (siehe settle).
  const swDone = await wait(async () => { const c = await cachesNow(p); return onlyNewCache(c) && /waiting:-/.test(c.sw); }, 12000);
  console.log('INFO  Service Worker nach dem Update: ' + (swDone ? 'neu aktiv, alter Cache gelöscht' : 'wartet noch, bis die App geschlossen wird ' + JSON.stringify(await cachesNow(p))));

}

/** App schließen und wieder öffnen, wie die Person es später tut: Jetzt muss der neue Service Worker übernommen haben. */
async function settle(ctx, p, label) {
  await p.close();
  const g = track(await setup(ctx, { patchPage: false })), q = g.p;
  await q.goto(BASE); await ready(q);
  const done = await wait(async () => { const c = await cachesNow(q); return onlyNewCache(c) && /waiting:-/.test(c.sw) && /active:activated/.test(c.sw); }, 20000);
  ok(done, `${label}: nach Schließen und Öffnen ist der neue Service Worker aktiv, nur der neue Cache liegt da ` + JSON.stringify(await cachesNow(q)));
  ok(await wait(() => q.evaluate(() => !!navigator.serviceWorker.controller)) && await txt(q, '#ver') === NEW, `${label}: er steuert die Seite (Version ${await txt(q, '#ver')})`);
  return { p: q, g };
}

/** Alles, was mit den alten Daten stimmen muss. */
async function verifyOldData(p, before, label) {
  const after = await exportJson(p);
  const d = sameData(before, after);
  ok(!d, `${label}: Backup nach dem Update ist inhaltlich gleich dem Backup davor ${d}`);
  ok(await cards(p) === N_ITEMS, `${label}: alle ${N_ITEMS} Teile im Schrank`);
  ok(await p.locator('#board img.p').count() === 2, `${label}: das Board hat seine zwei Teile behalten`);
  ok((await p.locator('#outs .out b').allTextContents()).join('|') === 'Büro|Wochenende', `${label}: beide Outfits unter „Gespeichert“`);
  ok(await p.locator('#grid .card', { hasText: 'Lila Kleid' }).count() === 1 && await p.locator('#statusChips button').count() > 0, `${label}: Wunschliste ist noch da`);

  await goTab(p, 'auswertung');
  ok(await txt(p, '#statSub') === 'Die letzten 90 Tage · 6 eingetragene Outfits', `${label}: Auswertung rechnet mit den alten Einträgen: ` + await txt(p, '#statSub'));
  ok(await txt(p, '#kWorn') === '3 von 7' && /^20,00\s€$/.test(await txt(p, '#kCost')) && await txt(p, '#kColor') === 'Blau', `${label}: Kennzahlen ${await txt(p, '#kWorn')} | ${await txt(p, '#kCost')} | ${await txt(p, '#kColor')}`);
  ok((await p.locator('#statTop .stat-name b').allTextContents()).join() === 'Blaues Hemd,Graue Hose,Rote Jacke', `${label}: Rangliste stimmt`);
  ok((await p.locator('#idleList .idle b').allTextContents()).join() === 'Weißer Schuh,Alte Hose,Alter Schal', `${label}: „Aussortieren?“ stimmt`);

  await goTab(p, 'vorschlaege');
  ok(await wait(async () => await p.locator('#sugCards .sug').count() >= 1), `${label}: Vorschläge entstehen aus den alten Teilen (${await p.locator('#sugCards .sug').count()} Karten)`);
  ok(await p.locator('#sugCards .sug img').evaluateAll(l => l.length > 0 && l.every(i => i.complete && i.naturalWidth > 0)), `${label}: Bilder der Vorschläge laden`);
  await goTab(p, 'schrank');
}

/** Neues benutzen, ohne dass das Alte darunter leidet. */
async function useNew(p, before, label) {
  const one = { name: 'tee.png', mimeType: 'image/png', buffer: PNG };
  await p.click('#addBtn'); await p.waitForFunction(() => document.getElementById('addDlg').open);
  ok(await p.isVisible('#wayPhotos') && await p.isVisible('#wayLink'), `${label}: „Hinzufügen“ öffnet das neue Blatt`);
  await p.setInputFiles('#file', one);
  await p.waitForSelector('#res img', { timeout: 15000 });
  await p.fill('#name', 'Neues Hemd'); await p.selectOption('#cat', 'Oberteil'); await p.click('#ok');
  await p.waitForFunction(n => document.querySelectorAll('#grid .card').length === n, N_ITEMS + 1);
  await p.click('#addBtn');
  await p.setInputFiles('#file', [{ ...one, name: 'zwei.png' }, { ...one, name: 'drei.png' }]);
  await p.waitForFunction(() => document.getElementById('queueDlg').open);
  await wait(() => p.evaluate(() => !document.querySelector('#queueList .q--wait, #queueList .q--work') && document.querySelectorAll('#queueList .q--done').length === 2), 30000);
  await p.click('#queueAdd'); await closed(p, 'queueDlg');
  ok(await wait(async () => await cards(p) === N_ITEMS + 3), `${label}: neue Teile (einzeln und mehrere) kommen zu den alten dazu`);
  ok(await persisted(p, N_ITEMS + 3, N_WEARS), `${label}: alles gespeichert`);
  const now = await exportJson(p);
  const keptOld = now.items.filter(i => before.items.some(o => o.id === i.id));
  ok(!diff(before.items, keptOld) && !diff(before.outfits, now.outfits) && !diff(before.wears, now.wears) && !diff(before.plans, now.plans) && !diff(before.board, now.board), `${label}: die alten Teile, Outfits, Einträge, Pläne und das Board sind unverändert ${diff(before.items, keptOld)}`);
  ok(now.items.length === N_ITEMS + 3, `${label}: Backup enthält alte und neue Teile (${now.items.length})`);

  // Bild vom Outfit (aus den alten Teilen auf dem Board)
  const dl = p.waitForEvent('download'); await p.evaluate(() => document.getElementById('png').click());
  const png = await readFile(await (await dl).path());
  ok(png.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' && png.readUInt32BE(16) === 800 && png.readUInt32BE(20) === 1200, `${label}: „Als Bild laden“ liefert ein 800 × 1200 PNG`);

  // Backup einlesen und wieder ausgeben: gleicher Inhalt
  await importJson(p, now, N_ITEMS + 3);
  const again = await exportJson(p);
  ok(!sameData(now, again), `${label}: Backup einlesen und wieder ausgeben gibt denselben Inhalt (${sameData(now, again)})`);
  return again;
}

// =====================================================================================================================
try {
  if (only('A')) {
    console.log('--- A: Desktop, „Nach Update suchen“, mit Google-Sicherung');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'allow', acceptDownloads: true });
    let { p, g, before } = await startOld(ctx, { google: GOOGLE, from: '1.15.15' });
    const uploadsBefore = fake.uploads;
    await update(p, 'button');
    await verifyOldData(p, before, 'A');
    if (GOOGLE) {
      ok(await wait(() => p.evaluate(() => document.getElementById('cloudBtn').hasAttribute('data-on') && !document.getElementById('cloudAvatar').hidden)), 'A: noch bei Google angemeldet, ohne neue Anmeldung');
      ok(!await p.evaluate(() => document.getElementById('cloudConflict').open), 'A: keine Rückfrage zu einem Konflikt');
      await p.waitForTimeout(1500);
      ok(remote().items.length === N_ITEMS && remote().items.map(i => i.id).sort().join() === before.items.map(i => i.id).sort().join(), 'A: Google Drive hat weiter alle alten Teile (' + remote().items.length + ')');
    } else console.log('INFO  Safari-Engine: Google-Teile dieses Tests übersprungen (siehe Kommentar oben)');
    ok(g.errors.length === 0, 'A: keine Skriptfehler beim Update ' + g.errors.join(' | '));
    ok((await p.evaluate(() => window.__csp)).length === 0, 'A: keine CSP-Verstöße');
    ({ p, g } = await settle(ctx, p, 'A'));
    if (GOOGLE) ok(await wait(() => p.evaluate(() => document.getElementById('cloudBtn').hasAttribute('data-on'))), 'A: nach dem Neuöffnen weiter bei Google angemeldet');

    const final = await useNew(p, before, 'A');
    if (GOOGLE) {
      ok(await wait(async () => remote()?.items.length === N_ITEMS + 3, 45000), 'A: neue Teile landen von selbst in Google Drive (' + remote()?.items.length + ')');
      ok(fake.uploads > uploadsBefore, 'A: es wurde wirklich hochgeladen');
    }

    if (GOOGLE) {
      console.log('--- A: neues Gerät holt alles aus Google Drive');
      const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'allow', acceptDownloads: true });
      const B = await setup(ctxB, { patchPage: false });
      await B.p.goto(BASE); await ready(B.p);
      ok(await cards(B.p) === 0 && await txt(B.p, '#ver') === NEW, 'B: neue Installation startet leer');
      await login(B.p);
      ok(await wait(async () => await cards(B.p) === N_ITEMS + 3, 30000), 'B: holt alle ' + (N_ITEMS + 3) + ' Teile (alte und neue) von Google');
      const fromB = await exportJson(B.p);
      ok(!sameData({ ...final, board: [] }, { ...fromB, board: [] }), 'B: Teile, Outfits, Einträge und Pläne sind gleich ' + sameData({ ...final, board: [] }, { ...fromB, board: [] }));
      ok(await wait(async () => { await goTab(B.p, 'auswertung'); return await txt(B.p, '#kWorn') === '3 von 10'; }, 8000), 'B: Auswertung zeigt dieselben Zahlen (' + await txt(B.p, '#kWorn') + ')');
      ok(B.errors.length === 0, 'B: keine Skriptfehler ' + B.errors.join(' | '));
      await ctxB.close();

    }

    console.log('--- A: Offline-Start jeder Seite');
    await reload(p); await ready(p);
    await p.waitForFunction(() => navigator.serviceWorker.controller);
    await ctx.setOffline(true);
    const pages = [['', '#view-schrank', 'Schrank'], ['#vorschlaege', '#view-vorschlaege', 'Vorschläge'], ['#auswertung', '#view-auswertung', 'Auswertung']];
    for (const [hash, view, name] of pages) {
      await p.evaluate(h => { history.replaceState(null, '', location.pathname + h); }, hash);
      await reload(p); await ready(p);
      ok(await p.isVisible(view) && await txt(p, '#ver') === NEW, `offline gestartet: ${name} ist da (Version ${await txt(p, '#ver')})`);
      ok(await cards(p) === N_ITEMS + 3, `offline gestartet: ${name}: Daten sind da`);
    }
    await p.evaluate(() => history.replaceState(null, '', location.pathname));
    await reload(p); await ready(p);
    const offlineName = 'Offline-Hemd';
    await p.click('#addBtn'); await p.setInputFiles('#file', { name: 'tee.png', mimeType: 'image/png', buffer: PNG });
    await p.waitForSelector('#res img', { timeout: 15000 });
    await p.fill('#name', offlineName); await p.click('#ok');
    await p.waitForFunction(n => document.querySelectorAll('#grid .card').length === n, N_ITEMS + 4);
    ok(await persisted(p, N_ITEMS + 4, N_WEARS), 'offline: Hinzufügen funktioniert und wird gespeichert');
    await ctx.setOffline(false);
    if (GOOGLE) ok(await wait(async () => remote()?.items.some(i => i.name === offlineName), 60000), 'wieder online: die Änderung von offline wird nachgeholt und gesichert');
    ok(g.errors.length === 0, 'A: keine Skriptfehler im ganzen Lauf ' + g.errors.join(' | '));
    ok((await p.evaluate(() => window.__csp)).length === 0, 'A: keine CSP-Verstöße im ganzen Lauf');
    await ctx.close();
  }

  if (only('B')) {
    console.log('--- B: iPhone, App einfach neu öffnen');
    const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'allow', acceptDownloads: true });
    let { p, g, before } = await startOld(ctx, { google: false, from: '1.15.15' });
    await update(p, 'natural');
    await verifyOldData(p, before, 'B');
    ({ p, g } = await settle(ctx, p, 'B'));
    await verifyOldData(p, before, 'B nach dem Neuöffnen');
    ok(g.errors.length === 0, 'B: keine Skriptfehler beim Update ' + g.errors.join(' | '));
    ok((await p.evaluate(() => window.__csp)).length === 0, 'B: keine CSP-Verstöße');
    await ctx.close();
  }

  for (const from of only('D') ? ['1.19.0', '1.20.0'] : []) {
    console.log(`--- D: Desktop, „Nach Update suchen“ von ${from} (ohne Google)`);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'allow', acceptDownloads: true });
    let { p, g, before } = await startOld(ctx, { google: false, from });
    await update(p, 'button');
    await verifyOldData(p, before, 'D ' + from);
    ({ p, g } = await settle(ctx, p, 'D ' + from));
    await verifyOldData(p, before, `D ${from} nach dem Neuöffnen`);
    ok(g.errors.length === 0, `D ${from}: keine Skriptfehler beim Update ` + g.errors.join(' | '));
    ok((await p.evaluate(() => window.__csp)).length === 0, `D ${from}: keine CSP-Verstöße`);
    await ctx.close();
  }

  if (only('C')) {
    console.log('--- C: Backup-Datei der alten Version in einer frischen neuen Installation');
    // Die Datei kommt aus dem Export der alten Version (nicht aus einem Entwurf): neue Version, leerer Speicher.
    current = dirs['1.15.15'];
    const ctxOld = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
    const po = (await setup(ctxOld, { patchPage: false })).p;
    await po.goto(BASE); await ready(po);
    await importJson(po, OLD_DATA, N_ITEMS);
    const oldFile = await exportJson(po);
    await ctxOld.close();

    current = root;
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', acceptDownloads: true });
    const g = await setup(ctx, { patchPage: false }); const p = g.p;
    await p.goto(BASE); await ready(p);
    ok(await cards(p) === 0, 'C: neue Installation ist leer');
    await importJson(p, oldFile, N_ITEMS);
    const got = await exportJson(p);
    ok(!sameData(oldFile, got), 'C: altes Backup lässt sich laden, danach ist der Export inhaltlich gleich ' + sameData(oldFile, got));
    ok(await persisted(p, N_ITEMS, N_WEARS), 'C: gespeichert');
    await reload(p); await ready(p);
    ok(await cards(p) === N_ITEMS && !sameData(oldFile, await exportJson(p)), 'C: nach dem Neuladen noch alles da');
    ok(await p.isDisabled('#undo'), 'C: nach dem Neuladen gibt es nichts rückgängig zu machen');
    ok(g.errors.length === 0 && (await p.evaluate(() => window.__csp)).length === 0, 'C: keine Skriptfehler, keine CSP-Verstöße');
    await ctx.close();
  }
} finally {
  await browser.close(); server.close();
  await rm(tmp, { recursive: true, force: true });
}
console.log(result.fails ? result.fails + ' FEHLER' : 'ALLES OK');
process.exit(result.fails ? 1 : 0);
