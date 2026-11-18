import { devices } from 'playwright';
import { launch, startServer } from './helpers.mjs';
const PORT = 8772, BASE = `http://localhost:${PORT}/index.html`;
const server = await startServer(PORT);
const browser = await launch();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const steps = {
  basis: async () => {},
  route: async (p, ctx) => { await ctx.route('https://github.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>x</title>' })); },
  scrollEnde: async p => { await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await sleep(400); },
  dialog: async p => { await p.locator('#fbBtn').scrollIntoViewIfNeeded(); await p.click('#fbBtn'); await p.waitForFunction(() => document.getElementById('fbDlg').open); await sleep(400); },
  dialogFill: async p => { await steps.dialog(p); await p.fill('#fbTitleIn', 'Speichern geht nicht'); await p.fill('#fbText', 'Wenn ich auf Speichern tippe, passiert nichts.'); },
  senden: async (p, ctx) => { await steps.route(p, ctx); await steps.dialogFill(p); await p.click('#fbSend'); await sleep(800); for (const o of ctx.pages()) if (o !== p) await o.close().catch(() => {}); await p.bringToFront(); await sleep(300); },
  sendenOhneSchliessen: async (p, ctx) => { await steps.route(p, ctx); await steps.dialogFill(p); await p.click('#fbSend'); await sleep(800); },
  kopieren: async p => { await steps.dialogFill(p); await p.click('#fbCopy'); await sleep(500); },
  fehler: async p => { await steps.dialog(p); await p.click('#fbSend'); await sleep(300); },
  viewportSchritte: async p => { await steps.dialog(p); for (const w of [800, 700, 500]) { await p.setViewportSize({ width: w, height: 800 }); await sleep(300); } },
};
for (const [name, fn] of Object.entries(steps)) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage();
  await p.goto(BASE); await p.waitForSelector('html[data-ready]', { state: 'attached' });
  await p.evaluate(() => { window.__r = 0; addEventListener('resize', () => window.__r++); });
  await fn(p, ctx);
  const before = await p.evaluate(() => ({ ev: window.__r, vis: document.visibilityState, iw: innerWidth }));
  await p.setViewportSize({ width: 320, height: 800 });
  await sleep(1500);
  const after = await p.evaluate(() => ({ ev: window.__r, vis: document.visibilityState, iw: innerWidth, sw: document.documentElement.scrollWidth, wrap: document.getElementById('wrap').style.width }));
  console.log('STEP', name, 'vorher', JSON.stringify(before), 'nachher', JSON.stringify(after), after.sw > after.iw ? 'KAPUTT' : 'ok');
  await ctx.close();
}
await browser.close(); server.close();
