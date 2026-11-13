import { devices } from 'playwright';
import { checker, startServer, launch, openNew } from './helpers.mjs';

const PORT = 8746, BASE = `http://localhost:${PORT}/index.html`;
const { ok, state: result } = checker();
const server = await startServer(PORT);
const browser = await launch();
const open = p => p.evaluate(() => document.querySelectorAll('dialog[open]').length);
const userScroll = (p, y) => p.evaluate(v => { dispatchEvent(new Event('touchmove')); scrollTo(0, v); }, y);
const vis = (p, sel) => p.locator(sel).first().isVisible();

try {
  for (const [name, opts] of [['Pixel 7', devices['Pixel 7']], ['iPhone 13', devices['iPhone 13']]]) {
    console.log('--- ' + name);
    const ctx = await browser.newContext(opts);
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    await p.goto(BASE); await p.waitForSelector('html[data-ready]', { state: 'attached' });
    const start = await p.evaluate(() => history.length);

    // Zurück schließt den Dialog, die Seite bleibt
    await p.tap('#fab'); await p.waitForTimeout(500);
    ok(await open(p) === 1, 'Dialog ist offen');
    ok(await p.evaluate(() => history.length) === start + 1, 'Dialog legt einen Verlaufseintrag an');
    await p.goBack(); await p.waitForTimeout(600);
    ok(await open(p) === 0, 'Zurück schließt den Dialog');
    ok(p.url() === BASE, 'Seite bleibt nach Zurück erhalten');

    // Schließen per Button entfernt den Eintrag wieder: Zurück danach verlässt nicht die App unnötig doppelt
    await openNew(p, '#fab', 'tap'); await p.waitForTimeout(300);
    await p.tap('#dlg button:has-text("Abbrechen")'); await p.waitForTimeout(700);
    ok(await open(p) === 0, 'Abbrechen schließt den Dialog');
    ok(await p.evaluate(() => history.state?.anprobeDialog === undefined), 'Eintrag nach Abbrechen entfernt');
    ok(p.url() === BASE, 'Seite bleibt nach Abbrechen erhalten');

    // Mehrfach öffnen und schließen bleibt sauber
    for (let i = 0; i < 3; i++) { await p.tap('#fab'); await p.waitForTimeout(400); await p.goBack(); await p.waitForTimeout(500); }
    ok(await open(p) === 0 && p.url() === BASE, 'dreimal öffnen und zurück bleibt stabil');
    ok(await p.evaluate(() => history.length) <= start + 1, 'Verlauf wächst nicht an');

    // Touch-Texte
    ok(!/Mausrad|Pfeiltasten|Esc|Entf/.test(await p.evaluate(() => [...document.querySelectorAll('.sub span')].filter(e => e.offsetParent).map(e => e.textContent).join(' '))), 'Board-Hinweis ohne Maus und Tastatur');
    ok(await vis(p, '.sub .touch') && !(await vis(p, '.sub .fine')), 'nur der Touch-Hinweis ist sichtbar');
    await openNew(p, '#fab', 'tap'); await p.waitForTimeout(300);
    ok(/Tippen/.test(await p.textContent('#dlg .drop, #dlg #dropTxt, #dlg [id*=drop]').catch(() => '') || await p.evaluate(() => document.querySelector('#dlg').textContent)), 'Bildfeld spricht von Tippen');
    ok(!/Strg|Cmd/.test(await p.evaluate(() => document.querySelector('#dlg').textContent)), 'Bildfeld ohne Strg/Cmd');
    await p.goBack(); await p.waitForTimeout(500);

    // Plus-Button weicht beim Runterscrollen aus und kommt zurück
    await p.evaluate(() => { document.body.style.minHeight = '3000px'; });
    await userScroll(p, 600); await p.waitForTimeout(500);
    ok(await p.locator('#fab.away').count() === 1, 'Plus-Button weicht beim Runterscrollen aus');
    await userScroll(p, 300); await p.waitForTimeout(500);
    ok(await p.locator('#fab.away').count() === 0, 'Plus-Button kommt beim Hochscrollen zurück');
    // Sprung der Seite ohne Nutzereingabe (z. B. nach dem Speichern) versteckt den Button nicht
    await p.waitForTimeout(1700); await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(300);
    await p.evaluate(() => scrollTo(0, 1200)); await p.waitForTimeout(400);
    ok(await p.locator('#fab.away').count() === 0, 'Seitensprung ohne Nutzereingabe versteckt den Button nicht');
    // Esc scrollt nie: Ein Sprung der Seite kurz nach Esc (Blatt geschlossen) versteckt den Button nicht
    await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(300);
    await p.keyboard.press('Escape'); await p.evaluate(() => scrollTo(0, 1200)); await p.waitForTimeout(400);
    ok(await p.locator('#fab.away').count() === 0, 'Sprung der Seite nach Esc versteckt den Button nicht');
    await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(300);
    ok(await p.locator('#fab.away').count() === 0, 'Plus-Button ist oben immer sichtbar');
    await p.evaluate(() => scrollTo(0, 0));
    ok(errors.length === 0, 'keine Skriptfehler ' + errors.join(' | '));
    await ctx.close();
  }

  console.log('--- Desktop');
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(BASE); await p.waitForSelector('html[data-ready]', { state: 'attached' });
  ok(/Mausrad/.test(await p.evaluate(() => [...document.querySelectorAll('.sub span')].filter(e => e.offsetParent).map(e => e.textContent).join(' '))), 'Desktop zeigt Maus- und Tastaturhinweise');
  await p.click('#addBtn'); await p.waitForTimeout(500);
  await p.keyboard.press('Escape'); await p.waitForTimeout(600);
  ok(await open(p) === 0 && p.url() === BASE, 'Esc schließt den Dialog, Seite bleibt');
  await p.click('#addBtn'); await p.waitForTimeout(400); await p.goBack(); await p.waitForTimeout(500);
  ok(await open(p) === 0 && p.url() === BASE, 'Browser-Zurück schließt den Dialog am Desktop');
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}
console.log(result.fails ? result.fails + ' FEHLER' : 'ALLES OK');
process.exit(result.fails ? 1 : 0);
