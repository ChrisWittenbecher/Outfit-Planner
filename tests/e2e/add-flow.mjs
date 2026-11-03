// End-to-End-Test: "Kleidungsstück hinzufügen" (Link, Barcode, Bild) auf Smartphone und Desktop.
// Start:  npm run test:e2e   (benötigt Playwright + Chromium; Netzwerk wird gemockt)
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 8731, BASE = `http://localhost:${PORT}/index.html`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAASwAAAGQCAIAAACbF8osAAAEiUlEQVR4Xu3VwQ2DQAwAwRClGYpIYamAwigi5RjRAp8VYuZ/su+x8jIzL6Dz7kYDJxFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIsU88/5L1+7v0jkf479u9/ukSQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECLFlZuIV4NlcQoiJEGIihJgIISZCiIkQYiKEmAghJkKIiRBiIoSYCCEmQoiJEGIihJgIISZCiIkQYiKEmAghJkKIiRBiIoSYCCEmQoiJEGIihJgIISZCiIkQYiKEmAghJkKIiRBiIoSYCCEmQoiJEGIihJgIISZCiIkQYiKEmAghJkKIiRBiIoSYCCF2ALDyDBuQmjTmAAAAAElFTkSuQmCC', 'base64');
const SHOP = `<html><head><title>Blank Slub Tee – LIVE FAST DIE YOUNG</title><meta property="og:title" content="Blank Slub Tee"><meta property="og:image" content="http://livefastdieyoung.com/cdn/tee.png"><meta property="og:price:amount" content="39.00"><meta property="og:price:currency" content="EUR"></head><body></body></html>`;
const CORS = { 'access-control-allow-origin': '*' };

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FAIL ') + msg); if (!cond) fails++; };

const server = spawn('python3', [path.join(root, 'server/server.py'), String(PORT)], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1200));

const browser = await chromium.launch();
try {
  for (const [name, opts] of [['iPhone 13', devices['iPhone 13']], ['Desktop', { viewport: { width: 1280, height: 800 } }]]) {
    const mobile = name !== 'Desktop';
    const ctx = await browser.newContext(opts);
    const p = await ctx.newPage();
    p.on('dialog', d => d.accept());
    // Netzwerk mocken: lokaler Abruf-Dienst und öffentliche Proxys liefern die Shop-Seite
    await p.route('**/api/raw**', r => r.fulfill({ status: 200, headers: { 'content-type': 'text/html' }, body: SHOP + ' '.repeat(300) }));
    await p.route('https://livefastdieyoung.com/**', r => r.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'image/png' }, body: PNG }));
    await p.route('https://world.open*facts.org/**', r => r.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ status: 0 }) }));
    await p.goto(BASE);
    await p.waitForFunction(() => window.Anprobe);
    console.log('--- ' + name);

    const trigger = mobile ? '#fab' : '#addBtn';
    const noOverflow = () => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
    ok(await noOverflow(), 'kein horizontaler Überlauf');
    ok(await p.locator('#linkForm').isHidden(), 'Linkformular nicht mehr im Kleiderschrank');
    ok(await p.locator(trigger).isVisible(), 'Hinzufügen-Button sichtbar (' + trigger + ')');

    await p.click(trigger);
    ok(await p.locator('#addDlg').evaluate(d => d.open), 'Hinzufügen-Dialog öffnet');
    ok(await p.locator('#linkInput').isVisible() && await p.locator('#scanBtn').isVisible() && await p.locator('#addImage').isVisible(), 'Link, Barcode und Bild im Dialog');
    ok(await p.evaluate(() => { const r = document.getElementById('addDlg').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; }), 'Dialog passt in den Bildschirm');

    // Link-Import mit direktem Hinzufügen und Rückgängig
    await p.fill('#linkInput', 'https://livefastdieyoung.com/products/blank-slub-tee');
    await p.click('#linkGo');
    await p.waitForSelector('#toast:not([hidden])', { timeout: 20000 });
    const msg = await p.textContent('#toastMsg');
    ok(/Blank Slub Tee/.test(msg) && /Oberteil/.test(msg) && /39/.test(msg), 'Link-Import: Name, Kategorie, Preis (' + msg + ')');
    ok(!(await p.locator('#addDlg').evaluate(d => d.open)), 'Dialog schließt nach dem Import');
    ok(await p.locator('#grid .card').count() === 1, 'Karte im Kleiderschrank');
    await p.click('#toastActions button:has-text("Rückgängig")');
    ok(await p.locator('#grid .card').count() === 0, 'Rückgängig entfernt das Teil');

    // Barcode: manuelle Eingabe, kein Treffer -> Dialog mit Nummer
    await p.click(trigger);
    await p.click('#scanBtn');
    ok(await p.locator('#scanDlg').evaluate(d => d.open) && !(await p.locator('#addDlg').evaluate(d => d.open)), 'Scanner öffnet, Auswahl schließt');
    await p.fill('#eanInput', '4006381333931');
    await p.click('#eanGo');
    await p.waitForSelector('#dlg[open]', { timeout: 15000 });
    ok(/4006381333931/.test(await p.textContent('#status')), 'Barcode ohne Treffer: Dialog mit Nummer');
    await p.click('#cancel');

    // Scanner schließen -> zurück zur Auswahl
    await p.click(trigger);
    await p.click('#scanBtn');
    await p.click('#scanClose');
    ok(await p.locator('#addDlg').evaluate(d => d.open), 'Scanner schließen führt zurück zur Auswahl');

    // Bild wählen
    await p.click('#addImage');
    ok(await p.locator('#dlg').evaluate(d => d.open), 'Bild-Dialog öffnet');
    if (mobile) {
      ok(await p.evaluate(() => document.getElementById('dlg').getBoundingClientRect().width >= innerWidth - 1), 'Dialog als Bottom-Sheet in voller Breite');
      const small = await p.evaluate(() => [...document.querySelectorAll('#dlg button, #dlg input:not([type=checkbox]):not([type=range]), #dlg select')]
        .filter(e => e.offsetParent && e.getBoundingClientRect().height < 40).map(e => e.id || e.textContent));
      ok(small.length === 0, 'Touch-Ziele mindestens 40 px ' + small.join(','));
      const zoom = await p.evaluate(() => [...document.querySelectorAll('#dlg input:not([type=checkbox]):not([type=range]), #dlg select')]
        .filter(e => parseFloat(getComputedStyle(e).fontSize) < 16).length);
      ok(zoom === 0, 'Eingabefelder mindestens 16 px (kein iOS-Zoom)');
    }
    await p.click('#cancel');
    ok(await noOverflow(), 'weiterhin kein horizontaler Überlauf');
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(fails ? fails + ' FEHLER' : 'ALLES OK');
process.exit(fails ? 1 : 0);
