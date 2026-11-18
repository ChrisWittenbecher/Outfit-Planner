import { devices } from 'playwright';
import { launch, startServer } from './helpers.mjs';
const server = await startServer(8772);
const browser = await launch();
const run = async (label, withDialog) => {
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage();
  await p.goto('http://localhost:8772/index.html'); await p.waitForSelector('html[data-ready]', { state: 'attached' });
  await p.evaluate(() => { window.__r = 0; addEventListener('resize', () => window.__r++); });
  const snap = () => p.evaluate(() => ({ iw: innerWidth, ev: window.__r, stageW: document.getElementById('stage').clientWidth, wrapW: document.getElementById('wrap').style.width, sw: document.documentElement.scrollWidth, dlg: !!document.querySelector('dialog[open]') }));
  if (withDialog) { await p.locator('#fbBtn').scrollIntoViewIfNeeded(); await p.click('#fbBtn'); await p.waitForFunction(() => document.getElementById('fbDlg').open); await new Promise(r => setTimeout(r, 600)); }
  console.log(label, 'start', JSON.stringify(await snap()));
  await p.setViewportSize({ width: 320, height: 800 });
  for (const ms of [50, 250, 1000, 3000]) { await new Promise(r => setTimeout(r, ms)); console.log(label, ms, JSON.stringify(await snap())); }
  await ctx.close();
};
await run('ohne Dialog', false);
await run('mit Dialog', true);
await browser.close(); server.close();
