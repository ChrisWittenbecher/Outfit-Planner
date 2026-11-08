import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as playwright from 'playwright';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAASwAAAGQCAIAAACbF8osAAAEiUlEQVR4Xu3VwQ2DQAwAwRClGYpIYamAwigi5RjRAp8VYuZ/su+x8jIzL6Dz7kYDJxFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIsU88/5L1+7v0jkf479u9/ukSQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECDERQkyEEBMhxEQIMRFCTIQQEyHERAgxEUJMhBATIcRECLFlZuIV4NlcQoiJEGIihJgIISZCiIkQYiKEmAghJkKIiRBiIoSYCCEmQoiJEGIihJgIISZCiIkQYiKEmAghJkKIiRBiIoSYCCEmQoiJEGIihJgIISZCiIkQYiKEmAghJkKIiRBiIoSYCCEmQoiJEGIihJgIISZCiIkQYiKEmAghJkKIiRBiIoSYCCF2ALDyDBuQmjTmAAAAAElFTkSuQmCC', 'base64');

/** Zählt Fehlschläge und gibt jede Prüfung aus. */
export function checker() {
  const state = { fails: 0 };
  const ok = (cond, msg) => { console.log((cond ? 'OK   ' : 'FAIL ') + msg); if (!cond) state.fails++; };
  return { ok, state };
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
export async function startServer(port, dir = root) {
  const server = http.createServer(async (req, res) => {
    try {
      const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
      const file = path.join(dir, rel);
      if (!file.startsWith(dir)) throw new Error('außerhalb');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server.listen(port, r));
  return server;
}

export async function addItem(p, { trigger, name = 'Blaues Shirt', cat = 'Oberteil', price = '', png = PNG }) {
  const before = await p.locator('#grid .card').count();
  await p.click(trigger);
  await p.setInputFiles('#file', { name: 'tee.png', mimeType: 'image/png', buffer: png });
  await p.waitForSelector('#res img', { timeout: 15000 });
  await p.fill('#name', name);
  await p.selectOption('#cat', cat);
  if (price) await p.fill('#price', price);
  await p.click('#ok');
  await p.waitForFunction(n => document.querySelectorAll('#grid .card').length === n, before + 1);
}

/** Wartet, bis der Bestand wirklich in IndexedDB liegt. Wer direkt nach einer Änderung neu lädt, verliert sie sonst (Speichern ist verzögert). */
export async function persisted(p, items) {
  const t = Date.now();
  while (Date.now() - t < 5000) {
    const n = await p.evaluate(() => new Promise(res => {
      const q = indexedDB.open('anprobe', 1);
      q.onerror = () => res(-3);
      q.onsuccess = () => { const db = q.result, g = db.transaction('kv').objectStore('kv').get('s'); g.onsuccess = () => { db.close(); res(g.result?.items?.length ?? -1); }; g.onerror = () => { db.close(); res(-2); }; };
    }));
    if (n === items) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}

/** Wartet, bis ein Dialog fertig ausgeblendet und geschlossen ist. */
export const closed = (p, id) => p.waitForFunction(i => !document.getElementById(i).open, id, { timeout: 3000 }).then(() => true, () => false);

export const engine = process.env.BROWSER || 'chromium';
/** Service Worker sind standardmäßig gesperrt, damit page.route() in den Tests zuverlässig greift; der PWA-Test erlaubt sie ausdrücklich. */
export const launch = async () => {
  const browser = await playwright[engine].launch();
  const make = browser.newContext.bind(browser);
  browser.newContext = (opts = {}) => make({ serviceWorkers: 'block', ...opts });
  return browser;
};
