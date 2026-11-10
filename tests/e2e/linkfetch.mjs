import { PNG, checker, closed, launch, persisted, startServer, storedItems } from './helpers.mjs';

const PORT = 8744, ORIGIN = `http://localhost:${PORT}`, W = 'https://anprobe.test.workers.dev';
const { ok, state: result } = checker();
const server = await startServer(PORT);
const browser = await launch();
const wait = async (cond, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await cond()) return true; await new Promise(r => setTimeout(r, 50)); } return false; };
const json = (o, status = 200) => ({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': ORIGIN }, body: JSON.stringify(o) });

try {
  console.log('--- ohne eingerichteten Dienst');
  let ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let p = await ctx.newPage();
  await p.goto(`${ORIGIN}/index.html`); await p.waitForSelector('html[data-ready]', { state: 'attached' });
  await p.click('#addBtn'); await p.waitForFunction(() => document.getElementById('dlg').open);
  ok(!(await p.isVisible('#shopLink')), 'das Feld „Produktlink“ ist ausgeblendet');
  await ctx.close();

  console.log('--- mit Dienst (nachgestellt)');
  ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  p = await ctx.newPage();
  const seen = [], errors = [], external = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('request', r => { if (!r.url().startsWith(ORIGIN) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url()); });
  await p.route(`${ORIGIN}/js/config.js`, r => r.fulfill({ contentType: 'text/javascript', body: `export const WORKER_URL = '${W}';` }));
  await p.route(`${ORIGIN}/index.html`, async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace("connect-src 'self'", `connect-src 'self' ${W}`) }); });
  await p.route(`${W}/**`, r => {
    const u = new URL(r.request().url());
    seen.push(u.pathname + ' ' + u.searchParams.get('u') + ' ' + r.request().headers()['cookie']);
    const target = u.searchParams.get('u');
    if (u.pathname === '/image') return r.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': ORIGIN }, body: PNG });
    if (target.includes('weg')) return r.fulfill(json({ error: 'not_found' }, 502));
    if (target.includes('kein-bild')) return r.fulfill(json({ name: 'Sneaker Court', price: '79,95', currency: 'CHF', url: target, image: '', color: '', brand: '' }));
    return r.fulfill(json({ name: '<b>Wollmantel</b> Oslo', price: '189.90', currency: 'EUR', url: target, image: 'https://cdn.shop.example/mantel.jpg', color: 'Dark Navy', brand: 'Nordlys' }));
  });
  await p.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  await p.goto(`${ORIGIN}/index.html`); await p.waitForSelector('html[data-ready]', { state: 'attached' });
  await p.click('#addBtn'); await p.waitForFunction(() => document.getElementById('dlg').open);
  ok(await p.isVisible('#shopLink'), 'das Feld „Produktlink“ ist da');

  await p.fill('#shopLink', 'shop.example/p/mantel'); await p.click('#shopLinkGo');
  ok(await wait(async () => /Übernommen: .*Bild/.test(await p.textContent('#status'))), 'Rückmeldung: ' + (await p.textContent('#status')).trim());
  ok(await p.inputValue('#name') === 'Wollmantel Oslo', 'Name ohne Markup');
  ok(await p.inputValue('#price') === '189,90' && await p.inputValue('#cat') === 'Jacke' && await p.inputValue('#color') === 'Blau', 'Preis, Kategorie und Farbe');
  ok(await p.inputValue('#url') === 'https://shop.example/p/mantel', 'Link übernommen');
  ok(await p.locator('#res img').count() === 1, 'Bild kommt über den Dienst und ist verarbeitet');
  ok(seen.length === 2 && seen[0].startsWith('/product https://shop.example/p/mantel') && seen[1].startsWith('/image https://cdn.shop.example/mantel.jpg'), 'zwei Anfragen: Daten, Bild – ' + seen.join(' | '));
  ok(seen.every(s => s.endsWith(' undefined')), 'keine Cookies an den Dienst');
  await p.click('#ok'); await closed(p, 'dlg');
  ok(await persisted(p, 1) && (await storedItems(p))[0].name === 'Wollmantel Oslo', 'gespeichert');

  await p.click('#addBtn'); await p.waitForFunction(() => document.getElementById('dlg').open);
  ok(await p.inputValue('#shopLink') === '', 'neues Teil beginnt leer');
  await p.fill('#shopLink', 'https://shop.example/weg'); await p.click('#shopLinkGo');
  ok(await wait(async () => /gibt es nicht/.test(await p.textContent('#status'))), 'Fehler wird verständlich gemeldet: ' + (await p.textContent('#status')).trim());
  ok(await p.inputValue('#name') === '', 'bei Fehler bleibt das Formular unverändert');
  await p.fill('#shopLink', 'http://127.0.0.1/x'); await p.click('#shopLinkGo');
  ok(await wait(async () => /ungültig/.test(await p.textContent('#status'))), 'unsichere Adresse wird gar nicht erst gesendet');
  const before = seen.length;
  await p.fill('#shopLink', 'https://shop.example/kein-bild'); await p.click('#shopLinkGo');
  ok(await wait(async () => /Das Bild bitte/.test(await p.textContent('#status'))), 'ohne Bild: Hinweis auf Screenshot');
  ok(await p.inputValue('#name') === 'Sneaker Court' && seen.length === before + 1, 'Daten übernommen, kein Bildabruf');
  await p.click('#cancel'); await closed(p, 'dlg');

  ok(errors.length === 0, 'keine Skriptfehler ' + errors.join(' | '));
  ok((await p.evaluate(() => window.__csp)).length === 0, 'keine CSP-Verstöße ' + (await p.evaluate(() => window.__csp)).join(' | '));
  ok(external.every(u => u.startsWith(W)), 'außer dem Dienst keine Verbindung nach außen ' + external.join(' | '));
  await ctx.close();
} finally {
  await browser.close(); server.close();
}
process.exit(result.fails ? 1 : 0);
