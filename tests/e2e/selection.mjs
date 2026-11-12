import { devices } from 'playwright';
import { addItem, checker, startServer, launch } from './helpers.mjs';

const PORT = 8747, BASE = `http://localhost:${PORT}/index.html`;
const { ok, state: result } = checker();
const server = await startServer(PORT);
const browser = await launch();

try {
  for (const [name, opts] of [['Pixel 7 (Touch)', devices['Pixel 7']], ['Desktop (Maus)', { viewport: { width: 1280, height: 900 } }]]) {
    const mobile = name.startsWith('Pixel');
    console.log('--- ' + name);
    const ctx = await browser.newContext(opts);
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(BASE); await p.waitForSelector('html[data-ready]', { state: 'attached' });
    const trigger = mobile ? '#fab' : '#addBtn';
    await addItem(p, { trigger, name: 'Shirt', cat: 'Oberteil' });
    await addItem(p, { trigger, name: 'Hose', cat: 'Hose/Rock' });
    await p.locator('#grid .card', { hasText: 'Hose' }).locator('img').first().click();
    await p.locator('#grid .card', { hasText: 'Shirt' }).locator('img').first().click();
    await p.waitForTimeout(700);
    await p.locator('#board').scrollIntoViewIfNeeded();
    const info = () => p.textContent('#selInfo');
    const tapPiece = async idx => { const b = await p.locator('#board img.p').nth(idx).boundingBox(); const x = b.x + b.width / 2, y = b.y + b.height / 2; await (mobile ? p.touchscreen.tap(x, y) : p.mouse.click(x, y)); await p.waitForTimeout(400); };

    ok(/Tippe ein Teil an/.test(await info()), 'ohne Auswahl steht ein Hinweis über den Buttons');
    ok(await p.locator('#board.has-sel').count() === 0, 'ohne Auswahl ist nichts abgedunkelt');

    await tapPiece(1);
    ok(/Ausgewählt: .+/.test(await info()), 'über den Buttons steht, welches Teil ausgewählt ist: ' + await info());
    const sel = await p.locator('#board img.p.sel').evaluate(e => { const c = getComputedStyle(e); return { style: c.outlineStyle, w: parseFloat(c.outlineWidth), ring: c.boxShadow }; });
    ok(sel.style === 'solid' && sel.w >= 3 && sel.ring !== 'none', 'ausgewähltes Teil hat deutlichen Rahmen mit Hof ' + JSON.stringify(sel));
    ok(await p.locator('#board img.p:not(.sel)').first().evaluate(e => parseFloat(getComputedStyle(e).opacity)) < 1, 'nicht ausgewählte Teile treten zurück');
    ok(await p.locator('#sum .r.on').count() === 1 && /✓/.test(await p.locator('#sum .r.on .nm').evaluate(e => getComputedStyle(e, '::before').content)), 'Ebenenliste markiert genau eine Zeile mit Haken');
    ok(await p.locator('#sum .r.on .nm').evaluate(e => parseInt(getComputedStyle(e).fontWeight)) >= 700, 'markierter Name ist fett');

    // Wechsel der Auswahl
    const first = await info();
    await tapPiece(0);
    ok(await info() !== first && /Ausgewählt/.test(await info()), 'Wechsel der Auswahl aktualisiert die Zeile');
    ok(await p.locator('#board img.p.sel').count() === 1, 'es ist genau ein Teil markiert');

    // Auswahl aufheben
    const bb = await p.locator('#board').boundingBox();
    const bx = bb.x + 6, by = bb.y + bb.height - 6;
    await (mobile ? p.touchscreen.tap(bx, by) : p.mouse.click(bx, by)); await p.waitForTimeout(400);
    ok(/Tippe ein Teil an/.test(await info()) && await p.locator('#board.has-sel').count() === 0, 'leere Fläche hebt die Auswahl auf');
    ok(errors.length === 0, 'keine Skriptfehler ' + errors.join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(result.fails ? result.fails + ' FEHLER' : 'ALLES OK');
process.exit(result.fails ? 1 : 0);
