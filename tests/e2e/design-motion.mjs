import { devices } from 'playwright';
import { addItem, checker, startServer, launch, closed, openNew } from './helpers.mjs';

const PORT = 8737, BASE = `http://localhost:${PORT}/index.html`;
const { ok, state: result } = checker();
const server = await startServer(PORT);
const browser = await launch();
const wait = (p, ms) => p.waitForTimeout(ms);
const css = (p, sel, prop) => p.locator(sel).evaluate((el, k) => getComputedStyle(el)[k], prop);
const isOpen = (p, id) => p.evaluate(i => document.getElementById(i).open, id);
const fresh = async (ctx) => {
  const p = await ctx.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(BASE); await p.waitForSelector('html[data-ready]', { state: 'attached' });
  return { p, errors };
};

try {
  console.log('--- Desktop (Maus)');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'no-preference' });
    const { p, errors } = await fresh(ctx);

    await p.hover('#stageBtn'); await wait(p, 300);
    ok(await css(p, '#stageBtn', 'backgroundColor') !== 'rgba(0, 0, 0, 0)', 'Maus: Hover färbt den Button');

    const box = await p.locator('#shuffle').boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await wait(p, 260);
    const m = (await css(p, '#shuffle', 'transform')).match(/matrix\(([\d.]+),/);
    ok(m && Math.abs(+m[1] - 0.97) < 0.011, 'Druck-Feedback: Button schrumpft beim Drücken auf 0,97 (' + (m && m[1]) + ')');
    await p.mouse.up();

    await openNew(p, '#addBtn');
    ok(await isOpen(p, 'dlg') && await css(p, 'html', 'overflow') === 'hidden', 'Offener Dialog sperrt das Scrollen der Seite');
    await p.click('#cancel');
    await p.waitForFunction(() => document.getElementById('dlg').hasAttribute('data-closing'), null, { timeout: 1000 }).then(() => ok(true, 'Schließen blendet erst aus'), () => ok(false, 'Schließen blendet erst aus'));
    ok(await closed(p, 'dlg'), 'Dialog ist nach der Ausblendung zu');
    ok(await css(p, 'html', 'overflow') !== 'hidden', 'Seite lässt sich danach wieder scrollen');
    ok(!(await p.evaluate(() => document.getElementById('dlg').hasAttribute('data-closing'))), 'Kein Rest-Zustand nach dem Schließen');

    await p.click('#addBtn'); await p.click('#addClose'); await p.evaluate(() => document.getElementById('addBtn').click());
    await wait(p, 500);
    ok(await isOpen(p, 'addDlg'), 'Erneutes Öffnen während des Schließens bricht das Schließen ab');
    await p.keyboard.press('Escape');
    ok(await closed(p, 'addDlg'), 'Esc schließt das Blatt');

    await addItem(p, { trigger: '#addBtn', name: 'Übergangsjacke-Benachrichtigungseinstellungen-Extralang', price: '1284,5' });
    ok(await p.evaluate(() => { const n = document.querySelector('#grid .card .n'); return n.scrollWidth <= n.clientWidth + 1; }), 'Langer Name sprengt die Karte nicht');
    await p.click('#grid .card'); await p.click('#save'); await p.fill('#uiInput', 'Test'); await p.keyboard.press('Enter');
    ok(await closed(p, 'uiDlg'), 'Namens-Dialog schließt nach Enter');
    ok((await css(p, '#sum', 'fontVariantNumeric')).includes('tabular-nums'), 'Preise stehen in Tabellenziffern');

    await p.click('#grid .card'); await p.click('#clear').catch(() => {});
    await p.evaluate(() => document.getElementById('grid').querySelector('.card .more').click());
    await p.waitForSelector('#menuDlg[open]');
    await p.mouse.click(5, 5);
    ok(await closed(p, 'menuDlg'), 'Tippen neben das Kartenmenü schließt es');
    await openNew(p, '#addBtn');
    await p.mouse.click(5, 5); await wait(p, 400);
    ok(await isOpen(p, 'dlg'), 'Das Formular „Neues Teil“ schließt nicht durch Tippen daneben');
    ok(errors.length === 0, 'keine Seitenfehler: ' + errors.join(' | '));
    await ctx.close();
  }

  console.log('--- Desktop (reduzierte Bewegung)');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    const { p } = await fresh(ctx);
    const box = await p.locator('#shuffle').boundingBox();
    await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await wait(p, 260);
    ok(await css(p, '#shuffle', 'transform') === 'none', 'Reduzierte Bewegung: kein Schrumpfen beim Drücken');
    await p.mouse.up();
    await openNew(p, '#addBtn'); await p.click('#cancel');
    ok(!(await isOpen(p, 'dlg')), 'Reduzierte Bewegung: Dialog schließt sofort');
    await ctx.close();
  }

  console.log('--- iPhone 13 (Touch)');
  {
    const ctx = await browser.newContext({ ...devices['iPhone 13'], reducedMotion: 'no-preference' });
    const { p, errors } = await fresh(ctx);

    if (await p.evaluate(() => matchMedia('(hover: hover)').matches)) console.log('INFO  Diese Engine meldet im Touch-Profil Hover, die Hover-Prüfung entfällt');
    else {
      await p.hover('#stageBtn'); await wait(p, 300);
      ok(await css(p, '#stageBtn', 'backgroundColor') === 'rgba(0, 0, 0, 0)', 'Touch: kein hängender Hover-Zustand nach dem Tippen');
    }

    const sheet = async () => {
      await openNew(p, '#fab');
      await p.waitForFunction(() => document.getElementById('dlg').getAnimations().every(a => a.playState === 'finished'));
      return p.locator('#dlg .grab').boundingBox();
    };
    const drag = async (g, dy, steps, pauseMs) => {
      const x = g.x + g.width / 2, y = g.y + g.height / 2;
      await p.mouse.move(x, y); await p.mouse.down();
      for (let i = 1; i <= steps; i++) { await p.mouse.move(x, y + dy * i / steps); if (pauseMs) await wait(p, pauseMs); }
    };

    let g = await sheet();
    ok(g && g.height >= 28, 'Sheet hat einen Griff zum Wischen (' + (g && Math.round(g.height)) + ' px hoch)');
    await drag(g, 40, 8, 40); await wait(p, 250); await p.mouse.up(); await wait(p, 450);
    ok(await isOpen(p, 'dlg'), 'Kurzes, langsames Ziehen lässt das Sheet offen');
    ok(await css(p, '#dlg', 'transform') === 'none', 'Sheet federt danach in die Ruhelage zurück');

    g = await p.locator('#dlg .grab').boundingBox();
    await drag(g, 320, 8, 30); await p.mouse.up();
    ok(await closed(p, 'dlg'), 'Weites Ziehen schließt das Sheet');
    ok(await css(p, '#dlg', 'transform') === 'none' && !(await p.evaluate(() => document.getElementById('dlg').hasAttribute('data-closing'))), 'Nach dem Wischen bleibt kein Versatz zurück');

    g = await sheet();
    ok(await isOpen(p, 'dlg') && await css(p, '#dlg', 'transform') === 'none', 'Das Sheet öffnet danach wieder normal');
    await drag(g, 90, 3, 0); await p.mouse.up();
    ok(await closed(p, 'dlg'), 'Ein schneller kurzer Wisch genügt zum Schließen');

    await p.click('#more');
    await p.waitForSelector('#moreDlg[open]');
    await p.mouse.click(180, 20);
    ok(await closed(p, 'moreDlg'), 'Tippen auf den Hintergrund schließt das Mehr-Menü');

    await addItem(p, { trigger: '#fab', name: 'Hemd' });
    const sizes = await p.evaluate(() => { const b = document.querySelector('#grid .card .x .more'); return { w: b.offsetWidth, h: b.offsetHeight }; });
    ok(sizes.w >= 36, '„Mehr“-Knopf an der Karte mindestens 36 px (' + Math.round(sizes.w) + ')');
    await p.click('#grid .card'); await p.click('#save'); await p.waitForSelector('#uiDlg[open]'); await p.click('#uiCancel');
    ok(await closed(p, 'uiDlg'), 'Abbrechen schließt den Rückfrage-Dialog');
    await p.evaluate(() => document.querySelector('#grid .card .more').click());
    await p.waitForSelector('#menuDlg[open]'); await p.click('#menuDelete');
    await p.waitForSelector('.toast');
    await p.click('.toast button');
    await p.waitForFunction(() => !!document.querySelector('.toast--out'), null, { timeout: 1000 }).then(() => ok(true, 'Toast blendet nach der Aktion aus'), () => ok(false, 'Toast blendet nach der Aktion aus'));
    await p.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 1500 });
    ok(await p.locator('#grid .card').count() === 1, 'Rückgängig im Toast stellt das Teil wieder her');
    ok(errors.length === 0, 'keine Seitenfehler: ' + errors.join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close(); server.close();
}
console.log(result.fails ? `\n${result.fails} Prüfung(en) fehlgeschlagen` : '\nALLES OK');
process.exit(result.fails ? 1 : 0);
