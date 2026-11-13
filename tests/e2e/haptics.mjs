import { devices } from 'playwright';
import { addItem, checker, startServer, launch } from './helpers.mjs';

const PORT = 8748, BASE = `http://localhost:${PORT}/index.html`;
const { ok, state: result } = checker();
const server = await startServer(PORT);
const browser = await launch();

// Android: Vibration API wird mitgeschrieben; iPhone: Schalter-Umlegen wird gezählt
const spy = () => {
  window.__v = [];
  if (window.__android) Object.defineProperty(navigator, 'vibrate', { value: p => { window.__v.push(p); return true; }, configurable: true });
  window.__sw = 0;
  document.addEventListener('change', e => { if (e.target instanceof HTMLInputElement && e.target.hasAttribute('switch')) window.__sw++; }, true);
};
const feel = p => p.evaluate(() => (window.__v?.length || 0) + (window.__sw || 0));

try {
  for (const [name, opts] of [['Pixel 7 (Android)', devices['Pixel 7']], ['iPhone 13', { ...devices['iPhone 13'], userAgent: devices['iPhone 13'].userAgent }]]) {
    const android = name.startsWith('Pixel');
    console.log('--- ' + name);
    const ctx = await browser.newContext(opts);
    const p = await ctx.newPage();
    await p.addInitScript(a => { window.__android = a; }, android);
    await p.addInitScript(spy);
    if (!android) await p.addInitScript(() => { Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true }); });
    const errors = []; p.on('pageerror', e => errors.push(e.message));
    await p.goto(BASE); await p.waitForSelector('html[data-ready]', { state: 'attached' });

    await p.tap('#fab'); await p.waitForTimeout(400);
    ok(await feel(p) >= 1, 'Plus-Button gibt ein leichtes Tippen');
    await p.goBack(); await p.waitForTimeout(500);

    await addItem(p, { trigger: '#fab', name: 'Shirt', cat: 'Oberteil' });
    await p.waitForTimeout(500);
    ok(await feel(p) >= 3, 'Speichern gibt Erfolgs-Haptik (' + await feel(p) + ' Impulse bisher)');

    // Menü: Schalter vorhanden und wirksam
    await p.tap('#more'); await p.waitForTimeout(400);
    ok(await p.locator('#mHaptic').isVisible() && /An/.test(await p.textContent('#mHaptic')), 'Menü zeigt „Haptik: An“');
    await p.tap('#mHaptic'); await p.waitForTimeout(300);
    ok(/Aus/.test(await p.textContent('#mHaptic')), 'Schalter wechselt auf „Aus“');
    ok(await p.evaluate(() => localStorage.getItem('anprobe-haptics')) === 'off', 'Entscheidung bleibt gespeichert');
    const before = await feel(p);
    await p.tap('#mClose'); await p.waitForTimeout(300);
    await p.tap('#fab'); await p.waitForTimeout(300); await p.goBack(); await p.waitForTimeout(300);
    await p.tap('#theme'); await p.waitForTimeout(300);
    ok(await feel(p) === before, 'bei „Aus“ bleibt alles still');
    await p.tap('#more'); await p.waitForTimeout(300); await p.tap('#mHaptic'); await p.waitForTimeout(300);
    ok(await feel(p) > before && /An/.test(await p.textContent('#mHaptic')), 'wieder „An“, bestätigt mit einem Tippen');
    if (!android) {
      // Der unsichtbare Schalter darf dem Nutzer den Fokus nicht wegnehmen (Tastatur, Screenreader)
      const act = () => p.evaluate(() => { const a = document.activeElement; return a ? (a.id || a.tagName + (a.type ? ':' + a.type : '')) : 'nichts'; });
      await p.tap('#mClose'); await p.waitForTimeout(500);
      await p.evaluate(() => document.getElementById('outfitTitle').focus());
      await p.evaluate(() => document.getElementById('theme').click()); await p.waitForTimeout(400);
      ok(await act() === 'outfitTitle', 'Haptik lässt den Fokus, wo er war (aktiv: ' + await act() + ')');
      await p.evaluate(() => document.activeElement.blur());
      await p.evaluate(() => document.getElementById('theme').click()); await p.waitForTimeout(400);
      ok(!(await act()).startsWith('INPUT'), 'Haptik setzt ohne Fokus keinen Fokus auf den Schalter (aktiv: ' + await act() + ')');
    }
    ok(errors.length === 0, 'keine Skriptfehler ' + errors.join(' | '));
    await ctx.close();
  }

  console.log('--- Desktop (Maus)');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.addInitScript(spy);
  await p.goto(BASE); await p.waitForSelector('html[data-ready]', { state: 'attached' });
  await p.click('#addBtn'); await p.waitForTimeout(300);
  ok(await feel(p) === 0, 'am Desktop gibt es keine Haptik');
  await p.keyboard.press('Escape');
  ok(await p.evaluate(() => document.getElementById('mHaptic').hidden), 'am Desktop ist der Haptik-Schalter ausgeblendet');
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}
console.log(result.fails ? result.fails + ' FEHLER' : 'ALLES OK');
process.exit(result.fails ? 1 : 0);
