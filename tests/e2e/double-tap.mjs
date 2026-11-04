import { devices } from 'playwright';
import { addItem, checker, startServer, launch } from './helpers.mjs';

const PORT = 8735, BASE = `http://localhost:${PORT}/index.html`;
const { ok, state: result } = checker();
const server = await startServer(PORT);
const browser = await launch();
const count = p => p.locator('#board img.p').count();

try {
  for (const [name, opts] of [['iPhone 13 (Touch)', devices['iPhone 13']], ['Desktop (Maus)', { viewport: { width: 1280, height: 900 } }]]) {
    const mobile = name.startsWith('iPhone');
    console.log('--- ' + name);
    const ctx = await browser.newContext(opts);
    const p = await ctx.newPage();
    const errors = [], native = [];
    p.on('pageerror', e => errors.push(e.message));
    p.on('dialog', d => { native.push(d.type()); d.dismiss(); });
    await p.goto(BASE); await p.waitForSelector('html[data-ready]', { state: 'attached' });
    const trigger = mobile ? '#fab' : '#addBtn';
    await addItem(p, { trigger, name: 'Shirt', cat: 'Oberteil' });
    await addItem(p, { trigger, name: 'Hose', cat: 'Hose/Rock' });
    const tapCard = label => p.locator('#grid .card', { hasText: label }).locator('img').first().click();
    await tapCard('Hose'); await tapCard('Shirt'); await p.waitForTimeout(700);
    ok(await count(p) === 2, 'zwei Teile auf dem Board');

    await p.locator('#board').scrollIntoViewIfNeeded();
    const center = async idx => { const b = await p.locator('#board img.p').nth(idx).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, w: b.width }; };
    const tap = (x, y) => (mobile ? p.touchscreen.tap(x, y) : p.mouse.click(x, y));
    const wait = ms => p.waitForTimeout(ms);
    const top = await center(1);   // Oberteil liegt vorn

    await tap(top.x, top.y); await wait(500); await tap(top.x, top.y); await wait(500);
    ok(await count(p) === 2 && await p.locator('#board img.p.sel').count() === 1, 'zwei langsame Tipps wählen das Teil nur aus (kein Entfernen)');

    await wait(500);
    await tap(top.x - top.w / 3, top.y); await tap(top.x + top.w / 3, top.y); await wait(200);
    ok(await count(p) === 2, 'zwei Tipps an weit entfernten Stellen zählen nicht als Doppeltipp');

    await wait(500);
    const low = await center(0);
    await tap(low.x, low.y + 4); await tap(top.x, top.y); await wait(200);
    ok(await count(p) === 2, 'Tipps auf verschiedene Teile entfernen nichts');

    await wait(500);
    await tap(top.x, top.y); await wait(60); await tap(top.x, top.y); await wait(300);
    ok(await count(p) === 1, 'Doppeltipp nimmt das Teil vom Board');
    ok(/vom Board genommen/.test(await p.textContent('#toasts')) && await p.locator('#toasts button', { hasText: 'Rückgängig' }).isVisible(), 'Hinweis mit „Rückgängig“ erscheint');
    ok(await p.locator('#board img.p.sel').count() === 0, 'danach ist nichts mehr ausgewählt');
    await p.click('#toasts button');
    await wait(300);
    ok(await count(p) === 2, '„Rückgängig“ holt das Teil zurück');

    if (mobile) {
      await wait(500);
      await p.evaluate(() => document.getElementById('board').dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', pointerId: 99, isPrimary: true, clientX: 5, clientY: 5, bubbles: true })));
      await wait(700);   // länger still als STALE in gestures.js
      const t2 = await center(1);
      await tap(t2.x, t2.y); await wait(60); await tap(t2.x, t2.y); await wait(300);
      ok(await count(p) === 1, 'ein verwaister Finger (verlorenes pointerup) verschluckt den Doppeltipp nicht');
      await p.click('#toasts button'); await wait(300);
    }

    if (!mobile) {
      await wait(600);
      const c = await center(1);
      await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.mouse.move(c.x + 20, c.y + 10, { steps: 4 }); await p.mouse.up();
      await p.mouse.click(c.x + 20, c.y + 10); await wait(200);
      ok(await count(p) === 2, 'Ziehen und gleich danach tippen entfernt nichts');
      await p.mouse.click(5, 5);                       // Fokus weg von Feldern
      await p.locator('#board img.p').last().click();   // auswählen
      await p.keyboard.press('Delete'); await wait(300);
      ok(await count(p) === 1 && await p.locator('#toasts button', { hasText: 'Rückgängig' }).isVisible(), 'Entf nimmt das ausgewählte Teil vom Board, mit „Rückgängig“');
      await p.click('#toasts button'); await wait(300);
      ok(await count(p) === 2, 'Rückgängig nach Entf');
    }

    ok(/Doppeltipp/.test(await p.textContent('.sub')), 'Hinweistext nennt den Doppeltipp');
    ok(native.length === 0, 'keine nativen Dialoge');
    ok(errors.length === 0, 'keine Skriptfehler ' + errors.join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(result.fails ? result.fails + ' FEHLER' : 'ALLES OK');
process.exit(result.fails ? 1 : 0);
