import { devices } from 'playwright';
import { checker, startServer, launch, PNG } from './helpers.mjs';

// KI-Freistellen läuft im abgeschotteten Rahmen: Die App bleibt ohne eval, der Rahmen darf es (jsDelivr wird hier durch ein Modul ersetzt, das eval nutzt).
const PORT = 8749, BASE = `http://localhost:${PORT}/index.html`;
const { ok, state: result } = checker();
const server = await startServer(PORT);
const browser = await launch();
const MOCK = `
  let evalOk = false; try { evalOk = new Function('return 7')() === 7; } catch {}
  export async function removeBackground(blob, o) { if (o.proxyToWorker !== false) throw new Error('mit Arbeitsprozess'); o.progress('x', 1, 2); o.progress('x', 2, 2); if (!evalOk) throw new Error('eval im Rahmen gesperrt'); return blob; }`;

try {
  const ctx = await browser.newContext(devices['iPhone 13']);
  const p = await ctx.newPage();
  const errors = [], hits = [];
  p.on('pageerror', e => !/sandboxed and lacks the 'allow-same-origin'/.test(e.message) && errors.push(e.message + ' @ ' + String(e.stack).split('\n').slice(1,3).join(' ')));
  await ctx.route('https://cdn.jsdelivr.net/**', r => { hits.push(r.request().url()); r.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: MOCK }); });
  await p.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  await p.goto(BASE); await p.waitForSelector('html[data-ready]', { state: 'attached' });

  // Prüfung über ein echtes Skript der App (page.evaluate läuft am Browser-Protokoll vorbei und unterliegt den Regeln nicht)
  await p.route('**/evalprobe.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: "try { new Function('return 1')(); window.__eval = true; } catch { window.__eval = false; }" }));
  const evalInApp0 = async () => { await p.evaluate(() => { window.__eval = undefined; const s = document.createElement('script'); s.src = 'evalprobe.js'; document.head.append(s); }); await p.waitForFunction(() => window.__eval !== undefined); return p.evaluate(() => window.__eval); };
  console.log('--- Die App selbst darf kein eval');
  const evalInApp = await evalInApp0();
  ok(!evalInApp, 'in der App ist eval gesperrt');
  await p.evaluate(() => { window.__csp = []; }); // Verstoß der Prüfung selbst nicht mitzählen
  ok(await p.locator('iframe').count() === 0, 'ohne Zustimmung gibt es keinen KI-Rahmen');

  console.log('--- KI-Freistellen mit Zustimmung');
  await p.click('#fab');
  await p.setInputFiles('#file', { name: 'tee.png', mimeType: 'image/png', buffer: PNG });
  await p.waitForSelector('#res img', { timeout: 15000 });
  await p.click('#ai');
  await p.waitForSelector('#uiDlg[open]', { timeout: 5000 });
  ok(hits.length === 0, 'vor der Zustimmung wird nichts geladen');
  await p.click('#uiOk');
  await p.waitForFunction(() => document.querySelector('iframe'), null, { timeout: 5000 });
  const fr = await p.$eval('iframe', f => ({ sb: f.getAttribute('sandbox'), src: f.getAttribute('src') }));
  ok(fr.sb === 'allow-scripts', 'Rahmen ist abgeschottet (sandbox="allow-scripts")');
  ok(/ai\/frame\.html$/.test(fr.src), 'Rahmen lädt ai/frame.html');
  await p.waitForFunction(() => document.getElementById('status').textContent === '' && !document.querySelector('#res .busy'), null, { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1500);
  const st = await p.textContent('#status');
  ok(!/KI-Freistellen|blockiert|konnte nicht/.test(st), 'kein Fehlerhinweis (Status: „' + st.trim().slice(0, 80) + '“)');
  ok(hits.some(u => /@imgly\/background-removal@1\.5\.5/.test(u)), 'Programm kommt von jsDelivr (Version 1.5.5)');
  const viol = await p.evaluate(() => window.__csp);
  ok(viol.length === 0, 'die App meldet keine Regelverstöße: ' + JSON.stringify(viol));
  ok(!(await evalInApp0()), 'eval bleibt in der App gesperrt');

  console.log('--- Rahmen kann nicht auf die App zugreifen');
  const handle = await p.$('iframe');
  const reach = await p.evaluate(f => { try { return typeof f.contentWindow.document; } catch { return 'gesperrt'; } }, handle);
  ok(reach === 'gesperrt', 'Zugriff auf den Rahmeninhalt ist gesperrt');
  ok(errors.length === 0, 'keine Seitenfehler: ' + errors.join('|'));
} finally { await browser.close(); server.close(); }
process.exit(result.fails ? 1 : 0);
