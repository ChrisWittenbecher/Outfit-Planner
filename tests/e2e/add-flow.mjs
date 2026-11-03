// End-to-End-Test: Kleidungsstück per Bild hinzufügen, auf Smartphone und Desktop.
// Start:  npm run test:e2e   (benötigt Playwright + Chromium; Netzwerk wird gemockt, kein Server nötig)
import { chromium, devices } from 'playwright';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 8731, BASE = `http://localhost:${PORT}/index.html`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAASwAAAGQCAIAAACbF8osAAAEiUlEQVR4Xu3VwQ2DQAwAwRClGYpIYamAwigi5RjRAp8VYuZ/su+x8jIzL6Dz7kYDJxFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIsU88/5L1+7v0jkf479u9/ukSQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECLFlZuIV4NlcQoiJEGIihJgIISZCiIkQYiKEmAghJkKIiRBiIoSYCCEmQoiJEGIihJgIISZCiIkQYiKEmAghJkKIiRBiIoSYCCEmQoiJEGIihJgIISZCiIkQYiKEmAghJkKIiRBiIoSYCCEmQoiJEGIihJgIISZCiIkQYiKEmAghJkKIiRBiIoSYCCF2ALDyDBuQmjTmAAAAAElFTkSuQmCC', 'base64');

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FAIL ') + msg); if (!cond) fails++; };

// Minimaler statischer Dateiserver (nur für den Test, die App selbst braucht keinen Server)
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.join(root, rel);
    if (!file.startsWith(root)) throw new Error('außerhalb');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(PORT, r));

const browser = await chromium.launch();
try {
  for (const [name, opts] of [['iPhone 13', devices['iPhone 13']], ['Desktop', { viewport: { width: 1280, height: 800 } }]]) {
    const mobile = name !== 'Desktop';
    const ctx = await browser.newContext(opts);
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    p.on('dialog', d => d.accept());
    await p.goto(BASE);
    await p.waitForFunction(() => window.Anprobe);
    console.log('--- ' + name);

    const trigger = mobile ? '#fab' : '#addBtn';
    const noOverflow = () => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
    ok(await noOverflow(), 'kein horizontaler Überlauf');
    ok(await p.locator(trigger).isVisible(), 'Hinzufügen-Button sichtbar (' + trigger + ')');

    await p.click(trigger);
    ok(await p.locator('#dlg').evaluate(d => d.open), 'Dialog öffnet direkt');
    ok(await p.locator('#linkInput').count() === 0 && await p.locator('#scanBtn').count() === 0, 'kein Link-Import und kein Barcode-Scanner mehr');
    if (mobile) {
      ok(await p.evaluate(() => document.getElementById('dlg').getBoundingClientRect().width >= innerWidth - 1), 'Dialog als Bottom-Sheet in voller Breite');
      const small = await p.evaluate(() => [...document.querySelectorAll('#dlg button, #dlg input:not([type=checkbox]):not([type=range]):not([hidden]), #dlg select')]
        .filter(e => e.offsetParent && e.getBoundingClientRect().height < 40).map(e => e.id || e.textContent));
      ok(small.length === 0, 'Touch-Ziele mindestens 40 px ' + small.join(','));
      const zoom = await p.evaluate(() => [...document.querySelectorAll('#dlg input:not([type=checkbox]):not([type=range]), #dlg select')]
        .filter(e => parseFloat(getComputedStyle(e).fontSize) < 16).length);
      ok(zoom === 0, 'Eingabefelder mindestens 16 px (kein iOS-Zoom)');
    }

    // Bild hinzufügen, Angaben ergänzen, speichern
    await p.setInputFiles('#file', { name: 'tee.png', mimeType: 'image/png', buffer: PNG });
    await p.waitForSelector('#res img', { timeout: 15000 });
    ok(true, 'Bild wird verarbeitet und freigestellt');
    await p.fill('#name', 'Blaues Shirt');
    await p.selectOption('#cat', 'Oberteil');
    await p.fill('#price', '39,90');
    await p.fill('#url', 'javascript:alert(1)');
    await p.click('#ok');
    ok(await p.locator('#dlg').evaluate(d => d.open) && /ungültig/i.test(await p.textContent('#status')), 'ungültiger Link wird abgelehnt');
    await p.fill('#url', 'https://shop.example.com/blaues-shirt');
    await p.click('#ok');
    ok(!(await p.locator('#dlg').evaluate(d => d.open)), 'Speichern schließt den Dialog');
    ok(await p.locator('#grid .card').count() === 1, 'Karte im Kleiderschrank');
    const card = await p.locator('#grid .card').first().innerText();
    ok(/Blaues Shirt/.test(card) && /39/.test(card), 'Name und Preis an der Karte');
    ok(await p.locator('#grid .card a[href="https://shop.example.com/blaues-shirt"]').count() === 1, 'Link zum Angebot an der Karte');

    // Auf das Board legen und Datenhaltung nach Neuladen prüfen
    await p.locator('#grid .card').first().locator('img').first().click();
    ok(await p.locator('#board img').count() === 1, 'Teil liegt auf dem Board');
    await p.waitForTimeout(400);
    await p.reload();
    await p.waitForFunction(() => window.Anprobe);
    await p.waitForSelector('#grid .card');
    ok(await p.locator('#grid .card').count() === 1, 'Teil bleibt nach Neuladen erhalten');
    ok(await noOverflow(), 'weiterhin kein horizontaler Überlauf');
    ok(errors.length === 0, 'keine Skriptfehler ' + errors.join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(fails ? fails + ' FEHLER' : 'ALLES OK');
process.exit(fails ? 1 : 0);
