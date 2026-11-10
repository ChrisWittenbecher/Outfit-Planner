import { devices } from 'playwright';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PNG, checker, closed, engine, launch, persisted, root, startServer, storedItems } from './helpers.mjs';

const PORT = 8743, ORIGIN = `http://localhost:${PORT}`, BASE = `${ORIGIN}/index.html`;
const { ok, state: result } = checker();
const server = await startServer(PORT);
const browser = await launch();
const ready = p => p.waitForSelector('html[data-ready]', { state: 'attached' });
const wait = async (cond, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await cond()) return true; await new Promise(r => setTimeout(r, 50)); } return false; };
const SCRIPT = await readFile(path.join(root, 'kurzbefehl/anprobe-seite-auslesen.js'), 'utf8');

try {
  console.log('--- Auslese-Skript auf Produktseiten');
  const extract = async file => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    const requests = [];
    p.on('request', r => requests.push(r.url()));
    await p.goto(`${ORIGIN}/tests/fixtures/${file}`);
    const before = requests.length;
    const out = await p.evaluate(src => new Promise(res => { new Function('completion', src)(res); }), SCRIPT);
    const sent = requests.length - before;
    await ctx.close();
    return { data: JSON.parse(out), sent };
  };
  const a = await extract('shop-jsonld.html');
  ok(a.data.name === 'Wollmantel Oslo' && a.data.brand === 'Nordlys' && a.data.color === 'Dark Navy', 'JSON-LD: Name, Marke und Farbe (auch in @graph, trotz kaputtem Block davor)');
  ok(a.data.price === '189.90' && a.data.currency === 'EUR', 'JSON-LD: Preis und Währung');
  ok(a.data.image === `${ORIGIN}/img/mantel.jpg`, 'Bildadresse wird vollständig gemacht: ' + a.data.image);
  ok(a.data.url === 'https://www.shop.example/p/wollmantel-123', 'die kanonische Adresse wird genommen');
  ok(a.sent === 0, 'das Skript sendet nichts ins Netz');
  const b = await extract('shop-meta.html');
  ok(b.data.name === 'Sneaker Court' && b.data.price === '79,95' && b.data.currency === 'CHF' && b.data.brand === 'Läufer' && b.data.image === 'https://cdn.shop.example/sneaker.jpg', 'ohne JSON-LD greifen die Meta-Angaben');
  const c = await extract('shop-leer.html');
  ok(c.data.name === 'Nur ein Titel' && c.data.price === '' && c.data.image === '', 'Seite ohne Produktdaten: nur der Titel, kein Absturz');

  for (const [name, opts] of [['iPhone 13', { ...devices['iPhone 13'] }], ['Desktop', { viewport: { width: 1280, height: 900 } }]]) {
    const mobile = name !== 'Desktop';
    console.log('--- ' + name);
    const ctx = await browser.newContext(opts);
    if (engine === 'chromium') await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    const p = await ctx.newPage();
    const errors = [], native = [], external = [];
    p.on('pageerror', e => errors.push(e.message));
    p.on('dialog', d => { native.push(d.type()); d.dismiss(); });
    p.on('request', r => { if (!r.url().startsWith(ORIGIN) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url()); });
    await p.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
    await p.goto(BASE); await ready(p);
    const paste = text => p.evaluate(t => { const dt = new DataTransfer(); dt.setData('text/plain', t); document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, text);
    const clip = (obj, img = '') => 'ANPROBE1\n' + JSON.stringify(obj) + (img ? '\n' + img : '');
    const openAdd = async () => { await p.click(mobile ? '#fab' : '#addBtn'); await p.waitForFunction(() => document.getElementById('dlg').open); };

    console.log('--- Einfügen mit Bild');
    await openAdd();
    ok(await p.isVisible('#shopPaste') && await p.isVisible('#shopHelpBtn'), 'Knopf „Aus Shop übernehmen“ und Anleitung sind da');
    await paste(clip({ ...a.data, image: 'https://cdn.shop.example/mantel.jpg' }, PNG.toString('base64')));
    ok(await wait(async () => /Übernommen: .*Bild/.test(await p.textContent('#status'))), 'Rückmeldung: ' + (await p.textContent('#status')).trim());
    ok(await p.inputValue('#name') === 'Wollmantel Oslo', 'Name ausgefüllt');
    ok(await p.inputValue('#price') === '189,90' && await p.inputValue('#cur') === 'EUR', 'Preis und Währung ausgefüllt');
    ok(await p.inputValue('#url') === 'https://www.shop.example/p/wollmantel-123', 'Shop-Link ausgefüllt');
    ok(await p.inputValue('#cat') === 'Jacke', 'Kategorie aus dem Namen erkannt');
    ok(await p.inputValue('#color') === 'Blau', 'Farbe aus der Shop-Angabe („Dark Navy“ → Blau)');
    ok(await p.inputValue('#tags') === 'Nordlys', 'Marke als Tag');
    ok(await p.locator('#res img').count() === 1, 'Bild ist übernommen und verarbeitet');
    await p.click('#ok'); await closed(p, 'dlg');
    ok(await persisted(p, 1), 'gespeichert');
    const it = (await storedItems(p))[0];
    ok(it.name === 'Wollmantel Oslo' && it.price === 189.9 && it.cat === 'Jacke' && it.color === 'Blau' && it.link === 'https://www.shop.example/p/wollmantel-123' && it.img.startsWith('data:image/'), 'das Teil liegt vollständig im Speicher');
    ok(await p.inputValue('#color').catch(() => '') !== null && it.color === 'Blau', 'die erkannte Bildfarbe überschreibt die Shop-Farbe nicht');

    console.log('--- Einfügen ohne geöffneten Dialog, ohne Bild');
    await paste(clip({ name: 'Sneaker Court', price: '79,95', currency: 'CHF', url: 'javascript:alert(1)', image: '', color: '', brand: '' }));
    await p.waitForFunction(() => document.getElementById('dlg').open);
    ok(await wait(async () => /Übernommen: Name, Preis, Kategorie\. Das Bild bitte/.test(await p.textContent('#status'))), 'öffnet den Dialog und sagt, was fehlt: ' + (await p.textContent('#status')).trim());
    ok(await p.inputValue('#name') === 'Sneaker Court' && await p.inputValue('#price') === '79,95' && await p.inputValue('#cur') === 'CHF' && await p.inputValue('#cat') === 'Schuhe', 'Felder ausgefüllt');
    ok(await p.inputValue('#url') === '', 'gefährlicher Link wird nicht übernommen');
    await p.click('#cancel'); await closed(p, 'dlg');

    console.log('--- Fremde Inhalte');
    await openAdd();
    await paste(clip({ name: '<img src=x onerror="window.__xss=1"><b>Fett</b>', brand: '"><script>window.__xss=1</script>', color: '<i>rot</i>' }, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="window.__xss=1"/>').toString('base64')));
    await wait(async () => /Übernommen/.test(await p.textContent('#status')));
    ok(await p.evaluate(() => window.__xss === undefined) && await p.locator('#dlg b, #dlg script, #status img').count() === 0, 'Markup in den Daten wird nie ausgeführt oder eingesetzt');
    ok(await p.locator('#res img').count() === 0, 'kein Bild aus Nicht-Bilddaten (SVG mit Skript abgelehnt)');
    await paste('ANPROBE1\n{kaputt');
    ok(await wait(async () => /nicht lesbar/.test(await p.textContent('#status'))), 'kaputte Daten: klare Meldung');
    await p.fill('#name', '');
    await p.locator('#name').focus();
    await paste('Ganz normaler Text');
    ok(!/Shop-Daten/.test(await p.textContent('#status')) || /nicht lesbar/.test(await p.textContent('#status')), 'normales Einfügen wird nicht abgefangen');
    await p.click('#cancel'); await closed(p, 'dlg');

    console.log('--- Bild nur als Adresse, Server verweigert');
    await p.route('https://cdn.shop.example/**', r => r.abort());
    await openAdd();
    await paste(clip({ name: 'Bluse', image: 'https://cdn.shop.example/bluse.jpg' }));
    ok(await wait(async () => /Übernommen: Name, Kategorie\. Das Bild bitte als Screenshot/.test(await p.textContent('#status'))), 'lässt sich das Bild nicht laden, bleiben die Daten und es gibt einen Hinweis');
    await p.click('#cancel'); await closed(p, 'dlg');

    if (engine === 'chromium' && !mobile) {
      console.log('--- Knopf liest die Zwischenablage');
      await p.evaluate(t => navigator.clipboard.writeText(t), clip({ name: 'Schal Grau', price: 25, currency: 'EUR' }));
      await openAdd(); await p.click('#shopPaste');
      ok(await wait(async () => await p.inputValue('#name') === 'Schal Grau') && await p.inputValue('#cat') === 'Accessoire' && await p.inputValue('#color') === 'Grau', 'ein Tipp füllt die Felder');
      await p.evaluate(() => navigator.clipboard.writeText('nichts Besonderes'));
      await p.click('#shopPaste');
      ok(await wait(async () => /keine Shop-Daten/.test(await p.textContent('#status'))), 'ohne Shop-Daten: Hinweis auf den Kurzbefehl');
      await p.click('#cancel'); await closed(p, 'dlg');
    }

    console.log('--- Anleitung');
    await openAdd(); await p.click('#shopHelpBtn');
    await p.waitForFunction(() => document.getElementById('shopHelp').open);
    ok(await p.locator('#shopHelp ol.steps li').count() === 8, 'Schritte zum Einrichten und Benutzen');
    await p.waitForTimeout(300);
    await p.click('#shopScript');
    ok(await wait(async () => /kopiert|nicht geklappt/.test(await p.textContent('#shopHelpLive'))), 'Skript kopieren meldet sich: ' + (await p.textContent('#shopHelpLive')).trim());
    if (engine === 'chromium' && !mobile) ok((await p.evaluate(() => navigator.clipboard.readText())) === SCRIPT, 'in der Zwischenablage liegt genau das Skript');
    await p.click('#shopHelpClose');
    ok(await closed(p, 'shopHelp') && await p.evaluate(() => document.getElementById('dlg').open), 'Schließen führt zurück zum Formular');
    await p.click('#cancel'); await closed(p, 'dlg');

    ok(errors.length === 0, 'keine Skriptfehler ' + errors.join(' | '));
    ok((await p.evaluate(() => window.__csp)).length === 0, 'keine CSP-Verstöße ' + (await p.evaluate(() => window.__csp)).join(' | '));
    ok(native.length === 0, 'keine nativen Dialoge');
    ok(external.every(u => u.startsWith('https://cdn.shop.example/')), 'keine Verbindung außer zum Bild, das der Nutzer übernehmen wollte ' + external.join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close(); server.close();
}
process.exit(result.fails ? 1 : 0);
