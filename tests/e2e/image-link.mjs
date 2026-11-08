import { devices } from 'playwright';
import { checker, PNG, startServer, launch, closed } from './helpers.mjs';

const PORT = 8733, BASE = `http://localhost:${PORT}/index.html`;
const { ok, state: result } = checker();
const server = await startServer(PORT);
const browser = await launch();
const SHOP = 'https://www.zalando.de/blaues-shirt';
const statusText = p => p.textContent('#status');
const waitStatus = (p, re) => p.waitForFunction(r => new RegExp(r).test(document.getElementById('status').textContent), re.source);

try {
  for (const [name, opts] of [['iPhone 13', devices['iPhone 13']], ['Desktop', { viewport: { width: 1280, height: 800 } }]]) {
    const mobile = name !== 'Desktop';
    console.log('--- ' + name);
    const ctx = await browser.newContext(opts);
    await ctx.route('https://img.example.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: PNG }));
    await ctx.route('https://nocors.example.com/**', r => r.abort('failed'));
    await ctx.route('https://shop.example.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Produkt</title>' }));
    const p = await ctx.newPage();
    const errors = [], native = [];
    p.on('pageerror', e => errors.push(e.message));
    p.on('dialog', d => { native.push(d.type()); d.dismiss(); });
    await p.goto(BASE); await p.waitForSelector('html[data-ready]', { state: 'attached' });

    await p.click(mobile ? '#fab' : '#addBtn');
    ok(/Bild per Link/.test(await p.textContent('label[for=imgUrl]')) && /Shop/.test(await p.textContent('label[for=url]')), 'Dialog hat ein Feld „Bild per Link“ und ein Feld „Link zum Shop“');
    ok(await p.locator('#imgUrl').isVisible() && await p.locator('#imgLoad').isVisible(), 'Bildlink-Feld und „Laden“-Knopf sichtbar');
    if (mobile) {
      const h = await p.evaluate(() => Math.round(document.getElementById('imgLoad').getBoundingClientRect().height));
      ok(h >= 40, '„Laden“-Knopf mindestens 40 px hoch (' + h + ')');
      ok(await p.evaluate(() => document.getElementById('dlg').scrollWidth <= document.getElementById('dlg').clientWidth + 1), 'Dialog ohne horizontalen Überlauf');
    }

    await p.fill('#imgUrl', 'javascript:alert(1)'); await p.click('#imgLoad');
    ok(/ungültig/i.test(await statusText(p)) && await p.getAttribute('#imgUrl', 'aria-invalid') === 'true', 'ungültiger Bildlink wird abgelehnt');

    await p.fill('#url', SHOP);
    await p.fill('#imgUrl', 'https://nocors.example.com/hemd.jpg'); await p.click('#imgLoad');
    await waitStatus(p, /nicht direkt laden/);
    ok(await p.inputValue('#url') === SHOP && await p.locator('#res img').count() === 0, 'Server ohne CORS: Hinweis, kein Bild, Shop-Link unverändert');
    ok(await p.locator('#imgLoad').isEnabled(), '„Laden“-Knopf ist danach wieder bedienbar');

    await p.fill('#url', '');
    await p.fill('#imgUrl', 'https://shop.example.com/produkt/123'); await p.click('#imgLoad');
    await waitStatus(p, /als Shop-Link übernommen/);
    ok(await p.inputValue('#url') === 'https://shop.example.com/produkt/123', 'Seitenlink im Bildfeld landet als Shop-Link im Shop-Feld');
    await p.fill('#url', SHOP);
    await p.fill('#imgUrl', 'https://shop.example.com/produkt/456'); await p.click('#imgLoad');
    await waitStatus(p, /Shop-Link bleibt unverändert/);
    ok(await p.inputValue('#url') === SHOP, 'vorhandener Shop-Link wird nie überschrieben');

    await p.fill('#url', 'www.zalando.de/blaues-shirt');
    await p.fill('#imgUrl', 'https://img.example.com/shirt.png'); await p.press('#imgUrl', 'Enter');
    await p.waitForSelector('#res img', { timeout: 15000 });
    ok((await statusText(p)) === '', 'Bild vom Link geladen und freigestellt (Enter im Feld startet das Laden)');
    await p.fill('#name', 'Blaues Shirt'); await p.selectOption('#cat', 'Oberteil');
    await p.click('#ok');
    ok(await closed(p, 'dlg'), 'Speichern schließt den Dialog');
    const card = p.locator('#grid .card').first();
    ok(await card.locator(`a[href="${SHOP}"]`).count() === 1, 'Shop-Link ist an der Karte gespeichert, „https://“ wurde ergänzt');

    await p.waitForTimeout(500);
    await p.reload(); await p.waitForSelector('html[data-ready]', { state: 'attached' }); await p.waitForSelector('#grid .card');
    ok(await card.locator(`a[href="${SHOP}"]`).count() === 1, 'Shop-Link bleibt nach Neuladen erhalten');
    const stored = await p.evaluate(() => new Promise((res, rej) => { const q = indexedDB.open('anprobe'); q.onsuccess = () => { const g = q.result.transaction('kv').objectStore('kv').get('s'); g.onsuccess = () => res(JSON.stringify(g.result)); g.onerror = () => rej(g.error); }; q.onerror = () => rej(q.error); }));
    ok(!stored.includes('img.example.com') && stored.includes('data:image'), 'gespeichert wird nur die lokale Bildkopie, der Bildlink nicht');
    await card.scrollIntoViewIfNeeded();
    if (mobile) { await card.locator('.more').click(); await p.click('#menuEdit'); }
    else { await card.hover(); await card.locator('.acts button[aria-label="Bearbeiten"]').click(); }
    await p.waitForFunction(() => document.getElementById('dlg').open);
    ok(await p.inputValue('#url') === SHOP && await p.inputValue('#imgUrl') === '', 'Beim Bearbeiten steht der Shop-Link im Feld, das Bildlink-Feld ist leer');
    ok((await p.getAttribute('#drop img', 'src')).startsWith('data:'), 'Original liegt lokal vor (data:), kein Nachladen vom Shop');
    await p.click('#cancel');

    ok(native.length === 0, 'keine nativen Dialoge ' + native.join(','));
    ok(errors.length === 0, 'keine Skriptfehler ' + errors.join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(result.fails ? result.fails + ' FEHLER' : 'ALLES OK');
process.exit(result.fails ? 1 : 0);
