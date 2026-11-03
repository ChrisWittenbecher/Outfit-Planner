// Gemeinsame Hilfen der End-to-End-Tests: kleiner statischer Server, Testbild, Prüfzähler.
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

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
/** Startet einen statischen Dateiserver (nur für den Test, die App selbst braucht keinen Server). */
export async function startServer(port) {
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
  await new Promise(r => server.listen(port, r));
  return server;
}

/** Fügt über den Dialog ein Teil hinzu (Bild, Name, Kategorie) und wartet, bis die Karte da ist. */
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

/** Browser-Engine der Tests: BROWSER=chromium (Standard) oder BROWSER=webkit (Safari-Engine, wie auf dem iPhone). */
export const engine = process.env.BROWSER || 'chromium';
export const launch = () => playwright[engine].launch();
