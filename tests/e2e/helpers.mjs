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
/** @param {number} port @param {string | (() => string)} dir Ordner der Dateien; als Funktion kann er zwischen zwei Anfragen wechseln (Update-Test) */
export async function startServer(port, dir = root) {
  const server = http.createServer(async (req, res) => {
    try {
      const base = typeof dir === 'function' ? dir() : dir;
      const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
      const file = path.join(base, rel);
      if (!file.startsWith(base)) throw new Error('außerhalb');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server.listen(port, r));
  return server;
}

/** Öffnet „Hinzufügen“ und wählt „Link einfügen“: führt in den leeren Dialog „Neues Teil“ (how: 'click' oder 'tap'). */
export async function openNew(p, trigger, how = 'click') {
  await p[how](trigger);
  await p.waitForFunction(() => document.getElementById('addDlg').open);
  await p[how]('#wayLink');
  await p.waitForFunction(() => document.getElementById('dlg').open && !document.getElementById('addDlg').open);
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

/** Liest den Stand aus IndexedDB (Speicherformat 2): Anzahl Teile im Store, Reihenfolge und Einträge im kleinen Datensatz. */
export const stored = p => p.evaluate(() => new Promise(res => {
  const q = indexedDB.open('anprobe', 2);
  q.onerror = () => res(null);
  q.onsuccess = () => {
    const db = q.result;
    try {
      const tx = db.transaction(['kv', 'items']), s = tx.objectStore('kv').get('s'), n = tx.objectStore('items').count();
      tx.oncomplete = () => { db.close(); res(s.result ? { items: n.result, order: s.result.order?.length ?? 0, wears: s.result.wears?.length ?? 0, v: s.result.v } : null); };
      tx.onerror = tx.onabort = () => { db.close(); res(null); };
    } catch { db.close(); res(null); }
  };
}));

/** Alle Teile aus dem Store „items“ (volle Daten, mit Bildern). */
export const storedItems = p => p.evaluate(() => new Promise((res, rej) => {
  const q = indexedDB.open('anprobe', 2);
  q.onerror = () => rej(q.error);
  q.onsuccess = () => { const db = q.result, g = db.transaction('items').objectStore('items').getAll(); g.onsuccess = () => { db.close(); res(g.result); }; g.onerror = () => { db.close(); rej(g.error); }; };
}));

/** Wartet, bis der Bestand wirklich in IndexedDB liegt. Wer direkt nach einer Änderung neu lädt, verliert sie sonst (Speichern ist verzögert). */
export async function persisted(p, items, wears) {
  const t = Date.now();
  while (Date.now() - t < 5000) {
    const n = await stored(p);
    if (n && n.items === items && n.order === items && (wears === undefined || n.wears === wears)) return true;
    await new Promise(r => setTimeout(r, 50));
  }
  return false;
}

/** Wartet, bis ein Dialog fertig ausgeblendet und geschlossen ist. */
export const closed = (p, id) => p.waitForFunction(i => !document.getElementById(i).open, id, { timeout: 3000 }).then(() => true, () => false);

/**
 * Neu laden, auch wenn gerade noch ein Schritt im Seitenverlauf läuft: Schließt ein Dialog, geht die App einen Schritt im Verlauf zurück (sheet.js).
 * Beginnt das Neuladen währenddessen, bricht der Browser es mit ERR_ABORTED ab. Die Person lädt dann einfach noch einmal, der Test auch.
 */
export async function reload(p) {
  for (let n = 1; ; n++) {
    try { return await p.reload(); }
    catch (e) { if (n >= 4 || !/ERR_ABORTED|detached/.test(String(e.message))) throw e; await p.waitForTimeout(250); }
  }
}

export const engine = process.env.BROWSER || 'chromium';
/** Service Worker sind standardmäßig gesperrt, damit page.route() in den Tests zuverlässig greift; der PWA-Test erlaubt sie ausdrücklich. */
export const launch = async () => {
  const browser = await playwright[engine].launch();
  const make = browser.newContext.bind(browser);
  browser.newContext = (opts = {}) => make({ serviceWorkers: 'block', ...opts });
  return browser;
};
