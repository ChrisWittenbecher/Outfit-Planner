import { devices } from 'playwright';
import { launch, startServer } from './helpers.mjs';
const server = await startServer(8772);
const browser = await launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const p = await ctx.newPage();
await p.goto('http://localhost:8772/index.html'); await p.waitForSelector('html[data-ready]', { state: 'attached' });
await p.evaluate(() => { window.__r = 0; addEventListener('resize', () => window.__r++); });
const snap = () => p.evaluate(() => ({ iw: innerWidth, resizeEvents: window.__r, stageW: document.getElementById('stage').clientWidth, wrapW: document.getElementById('wrap').style.width, tf: document.getElementById('board').style.transform, sw: document.documentElement.scrollWidth, vv: visualViewport && visualViewport.width }));
console.log('start', JSON.stringify(await snap()));
for (const w of [360, 320, 390, 320]) {
  await p.setViewportSize({ width: w, height: 800 });
  for (const ms of [50, 250, 1000]) { await new Promise(r => setTimeout(r, ms)); console.log(w, ms, JSON.stringify(await snap())); }
}
await browser.close(); server.close();
