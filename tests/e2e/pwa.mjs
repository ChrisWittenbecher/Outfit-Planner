import { devices } from 'playwright';
import { cp, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { addItem, checker, persisted, startServer, launch, root } from './helpers.mjs';

const PORT = 8738, BASE = `http://localhost:${PORT}/index.html`;
const { ok, state: result } = checker();
const server = await startServer(PORT);
const browser = await launch();
const DAY = 86400000;
const ready = p => p.waitForSelector('html[data-ready]', { state: 'attached' });
const meta = (p, patch) => p.evaluate(async patch => {
  const db = await new Promise((res, rej) => { const q = indexedDB.open('anprobe', 2); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  const get = () => new Promise(r => { const g = db.transaction('kv').objectStore('kv').get('meta'); g.onsuccess = () => r(g.result || {}); });
  if (patch) {
    const merged = { ...(await get()), ...patch };
    await new Promise(r => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(merged, 'meta'); t.oncomplete = r; });
  }
  const m = await get(); db.close(); return m;
}, patch);

try {
  console.log('--- Manifest und Service Worker');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'allow', acceptDownloads: true });
    const p = await ctx.newPage();
    const errors = [], violations = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
    await p.goto(BASE); await ready(p);

    const href = await p.getAttribute('link[rel=manifest]', 'href');
    const res = await p.evaluate(async h => { const r = await fetch(h); return { ok: r.ok, type: r.headers.get('content-type'), j: await r.json() }; }, href);
    ok(res.ok && /manifest/.test(res.type) && res.j.display === 'standalone', 'Manifest ist erreichbar und gültig');

    await p.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 });
    ok(true, 'Service Worker ist aktiv und steuert die Seite');

    const cached = await p.evaluate(async () => { const names = await caches.keys(); const c = await caches.open(names[0]); return { names, urls: (await c.keys()).map(r => new URL(r.url).pathname) }; });
    ok(cached.names.length === 1 && /^anprobe-\d+\.\d+\.\d+$/.test(cached.names[0]), 'genau ein Cache, benannt nach der Version (' + cached.names + ')');
    const wanted = await p.$$eval('link[rel=modulepreload], link[rel=stylesheet], script[src], link[rel=manifest]', els => els.map(e => new URL(e.getAttribute('href') || e.getAttribute('src'), location.href).pathname));
    const missing = wanted.filter(w => !cached.urls.includes(w));
    ok(missing.length === 0 && wanted.length > 20, 'alle ' + wanted.length + ' Dateien der App liegen im Cache ' + missing.join(','));
    ok(!cached.urls.some(u => /\.(exe|zip)$/.test(u)) && cached.urls.length < 60, 'nur Dateien der App (' + cached.urls.length + ')');

    await addItem(p, { trigger: '#addBtn', name: 'Offline-Hemd', price: '20' });
    await persisted(p, 1);

    console.log('--- Offline');
    await ctx.setOffline(true);
    await p.reload(); await ready(p);
    ok(await p.locator('#grid .card', { hasText: 'Offline-Hemd' }).count() === 1, 'Ohne Netz startet die App und zeigt die gespeicherten Teile');
    await p.click('#updBtn'); await p.waitForTimeout(500);
    ok(!errors.length && (await p.textContent('#toasts')).length > 0, 'Update-Prüfung ohne Netz bleibt ruhig');
    await addItem(p, { trigger: '#addBtn', name: 'Zweites Hemd' });
    ok(await p.locator('#grid .card').count() === 2, 'Teile lassen sich ohne Netz hinzufügen');
    await ctx.setOffline(false);

    console.log('--- Update über den Service Worker');
    const newer = await p.evaluate(async () => { const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); return (await r.json()).version; });
    ok(/^\d+\.\d+\.\d+$/.test(newer), 'version.json kommt mit Netz frisch (' + newer + ')');

    ok(await p.evaluate(() => window.__csp.length) === 0, 'keine CSP-Verstöße durch Manifest oder Service Worker ' + JSON.stringify(await p.evaluate(() => window.__csp)));
    ok(errors.length === 0, 'keine Skriptfehler ' + errors.join(' | '));
    await ctx.close();
  }

  console.log('--- Neue Version erscheint (Service Worker darf nichts Altes festhalten)');
  {
    const dir = await mkdtemp(path.join(tmpdir(), 'anprobe-'));
    for (const f of ['index.html', 'sw.js', 'manifest.webmanifest', 'version.json', 'js', 'css', 'assets']) await cp(path.join(root, f), path.join(dir, f), { recursive: true });
    const srv = await startServer(8739, dir);
    const BASE2 = 'http://localhost:8739/index.html';
    const release = async v => {
      const old = (await readFile(path.join(dir, 'js/version.js'), 'utf8')).match(/VERSION = '([^']+)'/)[1];
      for (const f of ['js/version.js', 'sw.js', 'version.json']) await writeFile(path.join(dir, f), (await readFile(path.join(dir, f), 'utf8')).replaceAll(old, v));
    };
    const shown = p => p.textContent('#ver');
    const open = async () => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'allow' });
      const p = await ctx.newPage(); await p.goto(BASE2); await ready(p);
      await p.waitForFunction(() => navigator.serviceWorker.controller, null, { timeout: 15000 });
      return { ctx, p };
    };
    try {
      const a = await open();
      const v0 = await shown(a.p);
      await release('7.7.7');
      await a.p.click('#updBtn');
      await a.p.waitForSelector('#toasts button:has-text("Aktualisieren")', { timeout: 5000 });
      ok(/Neue Version 7\.7\.7/.test(await a.p.textContent('#toasts')), 'Neue Version wird trotz Cache erkannt');
      const nav = a.p.waitForNavigation({ timeout: 15000 });
      await a.p.click('#toasts button'); await nav; await ready(a.p);
      ok(await shown(a.p) === '7.7.7', '„Aktualisieren“ zeigt sofort die neue Version (war ' + v0 + ')');
      await a.ctx.close();

      const b = await open();
      await release('8.8.8');
      await b.p.reload(); await ready(b.p);
      ok(['7.7.7', '8.8.8'].includes(await shown(b.p)), 'beim ersten Neuladen läuft eine vollständige, in sich stimmige Version (' + await shown(b.p) + ')');
      const probe = () => b.p.evaluate(async () => {
        const ver = async init => { try { return (await (await fetch('js/version.js?p=' + Date.now(), init)).text()).match(/VERSION = '([^']+)'/)?.[1]; } catch (e) { return 'ERR ' + e.message; } };
        const reg = await navigator.serviceWorker.getRegistration();
        return { caches: await caches.keys(), controlled: !!navigator.serviceWorker.controller, active: reg?.active?.state, waiting: reg?.waiting?.state, installing: reg?.installing?.state, viaWorker: await ver(), network: await ver({ cache: 'no-store' }) };
      });
      let took = false;
      for (let i = 0; i < 60 && !took; i++) { const s = await probe(); took = s.caches.includes('anprobe-8.8.8') && !s.caches.includes('anprobe-7.7.7') && s.viaWorker === '8.8.8'; if (!took) await b.p.waitForTimeout(250); }
      ok(took, 'der neue Service Worker lädt die neue Version im Hintergrund vor, übernimmt und räumt den alten Cache auf ' + (took ? '' : JSON.stringify(await probe())));
      await b.p.reload(); await ready(b.p);
      const timing = await b.p.evaluate(() => performance.getEntriesByType('resource').filter(e => /\/version\.js/.test(e.name)).map(e => ({ worker: e.workerStart > 0, size: e.transferSize, delivery: e.deliveryType, status: e.responseStatus })));
      console.log('Hinweis: nach dem Neuladen zeigt die Seite ' + await shown(b.p) + ' ' + JSON.stringify(timing) + ' ' + JSON.stringify(await probe()));
      // „Nächster Start“ heißt: die App wird neu geöffnet (neues Dokument im selben Browserprofil), nicht per Neuladen aktualisiert
      await b.p.close();
      const next = await b.ctx.newPage(); await next.goto(BASE2); await ready(next);
      const after = await shown(next);
      ok(after === '8.8.8', 'beim nächsten Start ist die neue Version da, ohne Knopfdruck (' + after + ')' + (after === '8.8.8' ? '' : ' ' + JSON.stringify(await next.evaluate(() => caches.keys()))));
      await b.ctx.close();
    } finally { srv.close(); await rm(dir, { recursive: true, force: true }); }
  }

  console.log('--- Backup-Erinnerung');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
    const p = await ctx.newPage();
    await p.goto(BASE); await ready(p);
    ok((await p.textContent('#bk')) === '' && await p.locator('#bkSep').isHidden(), 'leerer Schrank: keine Backup-Zeile');
    await addItem(p, { trigger: '#addBtn', name: 'Hemd' });
    await persisted(p, 1);
    await p.reload(); await ready(p); await p.waitForTimeout(400);
    ok(/Noch kein Backup/.test(await p.textContent('#bk')), 'mit Teilen: „Noch kein Backup“ in der Fußzeile');
    ok(!/Backup speichern/.test(await p.textContent('#toasts')), 'am ersten Tag keine Erinnerung');
    ok(typeof (await meta(p)).since === 'number', 'Startzeitpunkt ist gemerkt');

    await meta(p, { lastBackup: Date.now() - 40 * DAY });
    await p.reload(); await ready(p); await p.waitForTimeout(500);
    ok(/vor 40 Tagen/.test(await p.textContent('#bk')), 'Fußzeile: „Letztes Backup: vor 40 Tagen“');
    ok(await p.locator('#toasts button', { hasText: 'Backup speichern' }).isVisible(), 'nach 30 Tagen erinnert ein Hinweis mit Knopf');
    const dl = p.waitForEvent('download');
    await p.click('#toasts button');
    ok(/^anprobe-backup-.*\.json$/.test((await dl).suggestedFilename()), 'der Knopf sichert direkt');
    await p.waitForTimeout(500);
    ok(/heute/.test(await p.textContent('#bk')), 'danach steht „heute“ in der Fußzeile');
    const m = await meta(p);
    ok(Math.abs(m.lastBackup - Date.now()) < 60000 && m.nagged === 0, 'Zeitpunkt ist gespeichert');

    await meta(p, { lastBackup: Date.now() - 40 * DAY, nagged: Date.now() - DAY });
    await p.reload(); await ready(p); await p.waitForTimeout(500);
    ok(!(await p.locator('#toasts button', { hasText: 'Backup speichern' }).count()), 'höchstens einmal pro Woche');
    await ctx.close();
  }

  console.log('--- iPhone: Hinweis „Zum Home-Bildschirm“');
  {
    const ctx = await browser.newContext(devices['iPhone 13']);
    const p = await ctx.newPage();
    await p.goto(BASE); await ready(p); await p.waitForTimeout(400);
    ok(!/Home-Bildschirm/.test(await p.textContent('#toasts')), 'leerer Schrank: noch kein Hinweis');
    await addItem(p, { trigger: '#fab', name: 'Hemd' });
    await persisted(p, 1);
    await p.reload(); await ready(p); await p.waitForTimeout(600);
    ok(/Home-Bildschirm/.test(await p.textContent('#toasts')), 'mit Teilen erscheint der Hinweis');
    await p.reload(); await ready(p); await p.waitForTimeout(600);
    ok(!/Home-Bildschirm/.test(await p.textContent('#toasts')), 'und nur ein einziges Mal');
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(result.fails ? result.fails + ' FEHLER' : 'ALLES OK');
process.exit(result.fails ? 1 : 0);
