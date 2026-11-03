// End-to-End-Test: Sicherheit. Feindliche Backup-Dateien, zu große Bilder, Clickjacking, Update-Code, Sicherheitsrichtlinie.
// Start:  npm run test:e2e   (BROWSER=webkit für die Safari-Engine)
import { devices } from 'playwright';
import { addItem, checker, startServer, launch, PNG } from './helpers.mjs';

const PORT = 8737, BASE = `http://localhost:${PORT}/index.html`;
const { ok, state: result } = checker();
const server = await startServer(PORT);
const browser = await launch();
const PX = 'data:image/png;base64,' + PNG.toString('base64');

try {
  const ctx = await browser.newContext(devices['iPhone 13']);
  const p = await ctx.newPage();
  const errors = [], violations = [], foreign = [], dialogs = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('dialog', d => { dialogs.push(d.type()); d.dismiss(); });
  let phase = 'Start';
  p.on('console', m => { if (/content security policy|refused to (load|execute|connect|apply)/i.test(m.text())) violations.push(phase + ': ' + m.text().slice(0, 160)); });
  // Jede Anfrage an einen anderen Host als localhost ist verdächtig (die Tests laden nichts von außen).
  await ctx.route(url => !['localhost', '127.0.0.1'].includes(url.hostname), r => { foreign.push(r.request().url()); return r.abort(); });
  const wait = ms => p.waitForTimeout(ms);
  const open = async () => { await p.goto(BASE); await p.waitForSelector('html[data-ready]', { state: 'attached' }); };
  await open();

  console.log('--- Sicherheitsrichtlinie im Browser'); phase = 'Sicherheitsrichtlinie im Browser';
  const csp = await p.getAttribute('meta[http-equiv="Content-Security-Policy"]', 'content');
  ok(/default-src 'none'/.test(csp) && !/'unsafe-inline'|'unsafe-eval'/.test(csp), 'CSP sperrt alles außer dem Erlaubten');
  // Angriffe simulieren: Der Browser muss sie blocken (und meldet dabei absichtlich Verstöße).
  await p.evaluate(() => { setTimeout("window.__evalRan = 1", 0); });
  await p.evaluate(() => { const b = document.createElement('button'); b.setAttribute('onclick', 'window.__handlerRan = 1'); document.body.append(b); b.click(); b.remove(); });
  await p.evaluate(() => { const s = document.createElement('script'); s.textContent = 'window.__inlineRan = 1'; document.head.append(s); });
  await wait(400);
  ok(await p.evaluate(() => window.__evalRan === undefined), 'eval-ähnlicher Code (Zeichenkette als Skript) wird blockiert');
  ok(await p.evaluate(() => window.__handlerRan === undefined), 'eingeschleuste Ereignis-Attribute laufen nicht');
  ok(await p.evaluate(() => window.__inlineRan === undefined), 'eingeschleuste Inline-Skripte laufen nicht');
  ok(violations.length >= 2, 'der Browser meldet die blockierten Angriffe (' + violations.length + ')');
  violations.length = 0;   // ab hier zählt jeder Verstoß als Fehler
  await addItem(p, { trigger: '#fab', name: 'Shirt', cat: 'Oberteil', price: '19,99' });
  await p.locator('#grid .card').first().locator('img').first().click(); await wait(500);
  ok(violations.length === 0, 'normale Nutzung löst keinen CSP-Verstoß aus ' + violations.join(' | '));
  // Safari wertet style.cssText als Inline-Stil: die Hülle des Boards muss ihre Größe trotz CSP bekommen.
  const sizes = await p.evaluate(() => { const w = document.getElementById('wrap').getBoundingClientRect(), b = document.getElementById('board').getBoundingClientRect(); return [w.width, w.height, b.width, b.height]; });
  ok(Math.abs(sizes[0] - sizes[2]) < 1.5 && Math.abs(sizes[1] - sizes[3]) < 1.5, 'Hülle des Boards hat die Größe des Boards (' + sizes.map(Math.round).join(' × ') + ')');

  console.log('--- Feindliche Backup-Datei'); phase = 'Feindliche Backup-Datei';
  const attack = {
    items: [
      { id: 'ok1', name: '<img src=x onerror=alert(1)>Hemd‮', cat: 'Oberteil', img: PX, link: 'javascript:alert(document.domain)', price: '1e999' },
      { id: 'spy', name: 'Spion', cat: 'Oberteil', img: 'https://evil.example/pixel.png' },
      { id: 'svg', name: 'Svg', cat: 'Oberteil', img: 'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+' },
      { id: 'ok1', name: 'doppelt', cat: 'Oberteil', img: PX },
      { id: 'ok2', name: 'Hose', cat: 'Hose/Rock', img: PX, link: 'https://shop.example/hose' },
    ],
    outfits: [{ id: 'o1', name: '<b>Büro</b>', pieces: [{ id: 'ok1', x: 10, y: 10, w: 100, r: 0 }], onclick: 'alert(1)' }],
    board: [{ id: 'ok1', x: 20, y: 20, w: 120, r: 0 }],
    __proto__: { polluted: true },
  };
  const send = async (content, name = 'backup.json') => {
    await p.click('#more'); await p.click('#mImp').catch(() => {});
    await p.setInputFiles('#impf', { name, mimeType: 'application/json', buffer: Buffer.isBuffer(content) ? content : Buffer.from(content) });
  };
  await send(JSON.stringify(attack).replace('"__proto__"', '"__proto__"'));
  await p.waitForSelector('#uiDlg[open]', { timeout: 5000 });
  await p.click('#uiOk'); await wait(700);
  const toast = await p.textContent('#toasts');
  ok(/Backup eingelesen/.test(toast) && /3 Teil/.test(toast), 'Backup wird eingelesen, drei unzulässige Teile werden übersprungen (' + toast.trim().slice(0, 90) + ')');
  ok(await p.locator('#grid .card').count() === 2, 'nur die zwei sauberen Teile sind im Schrank');
  const names = await p.$$eval('#grid .card .n span', els => els.map(e => e.textContent));
  ok(names.includes('Hemd') && !names.join().includes('<'), 'Namen sind als reiner Text bereinigt (' + names.join(' / ') + ')');
  ok(await p.evaluate(() => document.querySelectorAll('#grid img[src^="http"], #board img[src^="http"]').length === 0), 'kein entferntes Bild im Schrank oder auf dem Board');
  ok(!(await p.$$eval('#grid a', as => as.some(a => /^javascript:/i.test(a.getAttribute('href') || '')))), 'kein javascript:-Link');
  ok(await p.locator('#grid a[href="https://shop.example/hose"][rel="noopener noreferrer"][target="_blank"]').count() === 1, 'Shop-Link öffnet gesichert (noopener, noreferrer)');
  ok(await p.evaluate(() => ({}).polluted === undefined && Object.prototype.polluted === undefined), 'Objekt-Prototypen bleiben unverändert');
  ok(await p.locator('#outs .out b').first().textContent() === 'Büro', 'Outfit-Name ist reiner Text');
  ok(foreign.length === 0, 'kein Abruf von fremden Servern (' + foreign.join(', ') + ')');
  ok(dialogs.length === 0, 'keine nativen Dialoge, kein Skript aus den Daten ausgeführt');

  console.log('--- Zu große oder kaputte Dateien'); phase = 'Zu große oder kaputte Dateien';
  await send(Buffer.from('{"items": [ unsinn')); await wait(400);
  ok(/kein gültiges/.test(await p.textContent('#toasts')), 'kaputtes JSON: Fehlerhinweis, nichts geändert');
  const tooMany = JSON.stringify({ items: Array.from({ length: 2001 }, (_, i) => ({ id: 'i' + i, name: 'x', cat: 'Oberteil', img: PX })) });
  await send(tooMany); await wait(600);
  ok(/zu viele/.test(await p.textContent('#toasts')), 'zu viele Teile: abgelehnt');
  ok(await p.locator('#grid .card').count() === 2, 'abgelehnte Dateien lassen den Bestand unverändert');

  console.log('--- Zu großes Bild'); phase = 'Zu großes Bild';
  await p.click('#fab');
  await p.setInputFiles('#file', { name: 'riesig.png', mimeType: 'image/png', buffer: Buffer.alloc(26_000_000) });
  await p.waitForFunction(() => /zu groß/.test(document.getElementById('status').textContent), null, { timeout: 8000 });
  ok(true, 'Bild über 25 MB wird mit Hinweis abgelehnt');
  ok(await p.locator('#res img').count() === 0, 'es wird nichts verarbeitet');
  await p.click('#cancel');

  console.log('--- KI-Freistellen nur mit Zustimmung'); phase = 'KI-Freistellen nur mit Zustimmung';
  await p.click('#fab');
  await p.setInputFiles('#file', { name: 'tee.png', mimeType: 'image/png', buffer: PNG });
  await p.waitForSelector('#res img', { timeout: 15000 });
  await p.click('#ai');
  await p.waitForSelector('#uiDlg[open]', { timeout: 5000 });
  ok(/jsDelivr/.test(await p.textContent('#uiText')), 'vor dem Nachladen fremden Codes fragt die App nach (nennt jsDelivr)');
  await p.click('#uiCancel'); await wait(500);
  ok(foreign.length === 0, 'ohne Zustimmung wird nichts von außen geladen');
  await p.click('#cancel');

  console.log('--- Clickjacking'); phase = 'Clickjacking';
  const host = await ctx.newPage();
  await host.route('**/frame-host', r => r.fulfill({ status: 200, contentType: 'text/html', body: `<iframe id="f" src="${BASE}" width="400" height="600"></iframe>` }));
  await host.goto(`http://localhost:${PORT}/frame-host`);
  await host.waitForTimeout(1200);
  const framed = host.frames().find(f => f.url() === BASE);
  ok(!!framed && await framed.evaluate(() => document.documentElement.style.display) === 'none', 'in einem fremden Rahmen bleibt die Seite unsichtbar');
  ok(await host.evaluate(() => document.getElementById('f').contentDocument.documentElement.style.display) === 'none', 'Rahmeninhalt ist ausgeblendet');
  await host.close();
  ok(await p.evaluate(() => document.documentElement.style.display) !== 'none', 'als eigene Seite ist sie sichtbar');

  console.log('--- Update-Code holt nur eigene Dateien'); phase = 'Update-Code holt nur eigene Dateien';
  const requested = [];
  p.on('request', r => requested.push(r.url()));
  await p.route('**/index.html', route => {
    const r = route.request();
    if (r.resourceType() !== 'fetch') return route.continue();
    return route.fulfill({ status: 200, contentType: 'text/html', body: `<html><head><link rel="stylesheet" href="css/styles.css"><script src="https://evil.example/x.js"></script><link href="//evil.example/y.css" rel="stylesheet"><script src="/../../etc/passwd.js"></script><script src="../outside.js"></script></head></html>` });
  });
  await p.route('**/version.json*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"version":"99.0.0"}' }));
  await p.click('#updBtn'); await wait(500);
  const nav = p.waitForNavigation({ timeout: 15000 });
  await p.click('#toasts button'); await nav;
  ok(requested.some(u => u.endsWith('/css/styles.css')), 'eigene Dateien werden neu geladen');
  ok(!requested.some(u => /evil\.example/.test(u)), 'fremde Adressen werden nicht abgerufen');
  ok(foreign.length === 0, 'nirgends ein Abruf von außen');
  await p.unroute('**/version.json*');
  await p.route('**/version.json*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"version":"<img src=x onerror=alert(1)>"}' }));
  await p.click('#updBtn'); await wait(500);
  ok(/neueste Version/.test(await p.textContent('#toasts')), 'ungültige Versionsangabe wird ignoriert');
  await p.unroute('**/version.json*');
  await p.route('**/version.json*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ version: '1.0.0', pad: 'x'.repeat(5000) }) }));
  await p.click('#updBtn'); await wait(500);
  ok(/neueste Version/.test(await p.textContent('#toasts')), 'überlange version.json wird ignoriert');

  ok(errors.length === 0, 'keine Skriptfehler ' + errors.join(' | '));
  ok(violations.length === 0, 'keine CSP-Verstöße im ganzen Lauf ' + violations.join(' | '));
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}
console.log(result.fails ? result.fails + ' FEHLER' : 'ALLES OK');
process.exit(result.fails ? 1 : 0);
