import { checker, launch, startServer } from './helpers.mjs';

// Notbremse beim Start (js/recover.js): Startet die App nicht, lädt die Seite einmal von selbst neu, höchstens zweimal pro Minute.
// Hintergrund siehe js/recover.js (Safari-Engine liefert nach einem Update beim Neuladen manchmal noch alte Module zur neuen Seite).
const PORT = 8767, BASE = `http://localhost:${PORT}/index.html`;
const { ok, state: result } = checker();
const server = await startServer(PORT);
const browser = await launch();
const wait = async (cond, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await cond()) return true; await new Promise(r => setTimeout(r, 60)); } return false; };
// Die ersetzten Antworten dürfen nicht zwischengespeichert werden, sonst reicht die Safari-Engine sie je nach Zustand ihres Arbeitsspeichers auch beim
// zweiten Neuladen weiter, und der Test prüfte die Zwischenspeicherung der Engine statt der Notbremse (das echte Verhalten deckt upgrade.mjs ab).
const NOSTORE = { 'cache-control': 'no-store' };
const isReady = p => p.evaluate(() => !!document.documentElement.dataset.ready).catch(() => false);
const flag = p => p.evaluate(() => sessionStorage.getItem('anprobe-recover')).catch(() => null);

/** Neue Seite; die Navigationen zu index.html werden gezählt, js/ui.js lässt sich durch ein fehlerhaftes Modul ersetzen, js/main.js abbrechen. */
async function open(fake = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const seen = { nav: 0, ui: 0, main: 0 };
  p.on('request', r => { if (r.isNavigationRequest() && new URL(r.url()).pathname === '/index.html') seen.nav++; });
  await p.route('**/js/ui.js', r => { seen.ui++; return fake.ui?.(seen.ui) ? r.fulfill({ contentType: 'text/javascript', headers: NOSTORE, body: "throw new TypeError('altes Modul passt nicht zur Seite');" }) : r.continue(); });
  await p.route('**/js/main.js', r => { seen.main++; return fake.main?.(seen.main) ? r.abort() : r.continue(); });   // Laden schlägt fehl: kein Skriptfehler im Fenster, die App startet einfach nicht
  return { ctx, p, seen };
}

try {
  console.log('--- Normaler Start');
  {
    const { ctx, p, seen } = await open();
    await p.goto(BASE);
    ok(await wait(() => isReady(p)), 'App startet');
    await p.waitForTimeout(3000);
    ok(seen.nav === 1 && await flag(p) === null, `kein Neuladen, kein Merker (Navigationen: ${seen.nav})`);
    await p.evaluate(() => { setTimeout(() => { throw new Error('später, nach dem Start'); }, 0); });
    await p.waitForTimeout(2500);
    ok(seen.nav === 1, 'ein Fehler nach dem Start löst kein Neuladen aus');
    await ctx.close();
  }

  console.log('--- Modul passt nicht zur Seite (einmal), danach alles in Ordnung');
  {
    const { ctx, p, seen } = await open({ ui: n => n === 1 });
    await p.goto(BASE);
    ok(await wait(() => isReady(p), 25000), 'App startet nach dem selbsttätigen Neuladen');
    ok(seen.nav >= 2 && seen.nav <= 3, `ein oder zwei Neuladen (Navigationen: ${seen.nav})`);
    ok(await flag(p) !== null, 'Merker für die Minute ist gesetzt');
    await ctx.close();
  }

  console.log('--- Modul bleibt kaputt: kein Schleifenlauf');
  {
    const { ctx, p, seen } = await open({ ui: () => true });
    await p.goto(BASE);
    ok(await wait(() => seen.nav >= 3, 20000), 'zwei Neuladen finden statt');
    await p.waitForTimeout(6000);
    ok(seen.nav === 3, `und nicht mehr (Navigationen: ${seen.nav})`);
    ok(!await isReady(p), 'die App bleibt dann stehen');
    ok(/konnte nicht starten/.test(await p.textContent('#saveState')), 'mit dem Hinweis aus fallback.js');
    await ctx.close();
  }

  console.log('--- Start bleibt aus, ohne Skriptfehler (main.js lässt sich einmal nicht laden)');
  {
    const { ctx, p, seen } = await open({ main: n => n === 1 });
    await p.goto(BASE);
    await p.waitForTimeout(3000);
    ok(!await isReady(p) && seen.nav === 1, 'zunächst steht die App und lädt nicht neu');
    ok(await wait(() => isReady(p), 40000), 'nach dem Warten startet sie nach einem Neuladen');
    ok(seen.nav >= 2 && seen.nav <= 3, `ein oder zwei Neuladen (Navigationen: ${seen.nav})`);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(result.fails ? result.fails + ' FEHLER' : 'ALLES OK');
process.exit(result.fails ? 1 : 0);
