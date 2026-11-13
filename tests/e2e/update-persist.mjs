import { devices } from 'playwright';
import { addItem, checker, startServer, launch } from './helpers.mjs';

const PORT = 8736, BASE = `http://localhost:${PORT}/index.html`;
const { ok, state: result } = checker();
const server = await startServer(PORT);
const browser = await launch();

try {
  const ctx = await browser.newContext(devices['iPhone 13']);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  const wait = ms => p.waitForTimeout(ms);
  const count = () => p.locator('#board img.p').count();

  console.log('--- Version und Update-Hinweis');
  let served = null;   // null = echte version.json
  await p.route('**/version.json*', r => (served ? r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: served }) }) : r.continue()));
  await p.goto(BASE); await p.waitForSelector('html[data-ready]', { state: 'attached' });
  const ver = await p.textContent('#ver');
  ok(/^\d+\.\d+\.\d+$/.test(ver), 'Versionsnummer steht auf der Seite (' + ver + ')');
  await p.click('#updBtn'); await wait(400);
  ok(/neueste Version/.test(await p.textContent('#toasts')), 'ohne neue Version: „Du nutzt die neueste Version“');
  served = '99.0.0';
  await p.click('#updBtn'); await wait(400);
  ok(/Neue Version 99\.0\.0/.test(await p.textContent('#toasts')) && await p.locator('#toasts button', { hasText: 'Aktualisieren' }).isVisible(), 'neue Version wird angeboten');
  const nav = p.waitForNavigation({ timeout: 15000 });
  await p.click('#toasts button'); await nav;
  await p.waitForSelector('html[data-ready]', { state: 'attached' });
  ok(true, '„Aktualisieren“ lädt die Seite neu');
  served = null;

  console.log('--- Angeordnet bleibt nach dem Neuladen');
  await p.evaluate(() => indexedDB.deleteDatabase && 0);
  await addItem(p, { trigger: '#fab', name: 'Shirt', cat: 'Oberteil' });
  await addItem(p, { trigger: '#fab', name: 'Hose', cat: 'Hose/Rock' });
  const tapCard = label => p.locator('#grid .card', { hasText: label }).locator('img').first().click();
  await tapCard('Shirt'); await wait(700);
  await tapCard('Hose'); await wait(900);
  ok(await count() === 2, 'zwei Teile auf dem Board');
  const widths = async () => p.$$eval('#board img.p', els => els.map(e => Math.round(e.getBoundingClientRect().width)));
  await wait(500);
  const stored = () => p.evaluate(() => new Promise((res, rej) => { const q = indexedDB.open('anprobe'); q.onsuccess = () => { const g = q.result.transaction('kv').objectStore('kv').get('s'); g.onsuccess = () => res(g.result && g.result.fitted); g.onerror = () => rej(g.error); }; q.onerror = () => rej(q.error); }));
  ok(await stored() === true, 'der Zustand „angeordnet“ ist gespeichert');
  await p.reload(); await p.waitForSelector('html[data-ready]', { state: 'attached' }); await wait(500);
  await addItem(p, { trigger: '#fab', name: 'Schuhe', cat: 'Schuhe' });
  await tapCard('Schuhe'); await wait(900);
  ok(await count() === 3, 'nach dem Neuladen lässt sich ein drittes Teil hinzufügen');
  const rects = async () => p.$$eval('#board img.p', els => { const b = document.getElementById('board').getBoundingClientRect(); return els.map(e => { const r = e.getBoundingClientRect(); return [r.x - b.x, r.y - b.y, r.width, r.height].map(Math.round); }); });
  const auto = await rects();
  await p.click('#fit'); await wait(900);
  const manual = await rects();
  const same = auto.every((r, i) => r.every((v, k) => Math.abs(v - manual[i][k]) <= 1));
  ok(same, 'nach dem Neuladen ordnet sich das neue Teil von selbst passend ein (wie „Passend anordnen“) ' + JSON.stringify(auto) + ' / ' + JSON.stringify(manual));
  const bd = await p.locator('#board').boundingBox();
  ok(auto.every(([x, y, w, h]) => x >= -1 && y >= -1 && x + w <= bd.width + 1 && y + h <= bd.height + 1), 'alle drei Teile liegen im Board');

  console.log('--- Doppeltipp mit echten Fingern (leichtes Wandern, langsamer zweiter Tipp)');
  await p.locator('#board').scrollIntoViewIfNeeded();
  const top = await p.locator('#board img.p').last().boundingBox();
  const cx = top.x + top.width / 2, cy = top.y + top.height / 2;
  const before = await count();
  // Ablaufprotokoll der Berührungen: bei einem Fehlschlag steht in der Meldung, ob der Abstand zu groß war oder eine Berührung abgebrochen wurde
  await p.evaluate(() => {
    window.__ev = [];
    for (const t of ['pointerdown', 'pointerup', 'pointercancel', 'focusin', 'focusout']) {
      addEventListener(t, e => { const n = e.target; window.__ev.push(t + '@' + Math.round(performance.now()) + ':' + (n && (n.id || n.tagName || 'doc'))); }, true);
    }
  });
  await p.touchscreen.tap(cx, cy); await wait(250); await p.touchscreen.tap(cx + 12, cy + 6); await wait(400);
  const trace = await p.evaluate(() => window.__ev.join(' '));
  console.log('INFO Ablauf: ' + trace);
  ok(await count() === before - 1, 'zwei Tipps mit 12 px Versatz und 250 ms Pause nehmen das Teil vom Board [' + trace + ']');
  ok(await p.locator('#toasts button', { hasText: 'Rückgängig' }).isVisible(), 'Hinweis mit „Rückgängig“');

  ok(errors.length === 0, 'keine Skriptfehler ' + errors.join(' | '));
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}
console.log(result.fails ? result.fails + ' FEHLER' : 'ALLES OK');
process.exit(result.fails ? 1 : 0);
