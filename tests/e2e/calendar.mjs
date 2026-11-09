import { devices } from 'playwright';
import { readFile } from 'node:fs/promises';
import { PNG, addItem, checker, closed, launch, persisted, startServer } from './helpers.mjs';

const PORT = 8739, BASE = `http://localhost:${PORT}/index.html`;
const { ok, state: result } = checker();
const server = await startServer(PORT);
const browser = await launch();
const ready = p => p.waitForSelector('html[data-ready]', { state: 'attached' });

const pad = n => String(n).padStart(2, '0');
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const offset = n => { const d = new Date(); return keyOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12)); };
const monthLabel = d => new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(d);
const wait = async (cond, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await cond()) return true; await new Promise(r => setTimeout(r, 50)); } return false; };

try {
  for (const [name, opts] of [['iPhone 13', { ...devices['iPhone 13'], acceptDownloads: true }], ['Desktop', { viewport: { width: 1280, height: 900 }, acceptDownloads: true }]]) {
    const mobile = name !== 'Desktop';
    console.log('--- ' + name);
    const ctx = await browser.newContext(opts);
    const p = await ctx.newPage();
    const errors = [], native = [];
    p.on('pageerror', e => errors.push(e.message));
    p.on('dialog', d => { native.push(d.type()); d.dismiss(); });
    await p.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
    await p.goto(BASE); await ready(p);

    const trigger = mobile ? '#fab' : '#addBtn';
    await addItem(p, { trigger, name: 'Testhemd', cat: 'Oberteil', price: '60' });
    await addItem(p, { trigger, name: 'Testhose', cat: 'Hose/Rock', price: '100' });
    await addItem(p, { trigger, name: 'Testschuhe', cat: 'Schuhe', price: '80' });
    const card = label => p.locator('#grid .card', { hasText: label });
    const tap = label => card(label).locator('img').first().click();
    const info = async label => (await card(label).locator('small').allTextContents()).join(' | ');
    await tap('Testhemd'); await tap('Testhose');
    await p.click('#save'); await p.fill('#uiInput', 'Büro'); await p.click('#uiOk');
    await p.waitForSelector('#outs .out');
    const out = p.locator('#outs .out', { hasText: 'Büro' });
    const toast = () => p.textContent('#toasts');

    console.log('--- Heute getragen');
    ok(!/getragen/.test(await info('Testhemd')), 'ohne Eintrag zeigt die Karte keine Tragezahl');
    const wear = () => out.getByRole('button', { name: 'Heute getragen' }).click();
    await wear();
    ok(/„Büro“ für heute eingetragen/.test(await toast()), 'Hinweis bestätigt den Eintrag');
    ok(/1× getragen \| 60,00\s€ pro Tragen/.test(await info('Testhemd')), 'Karte zeigt Tragezahl und Kosten pro Tragen: ' + await info('Testhemd'));
    ok(/1× getragen \| 100,00\s€ pro Tragen/.test(await info('Testhose')), 'auch für die Hose');
    ok(!/getragen/.test(await info('Testschuhe')), 'nicht getragene Teile bleiben ohne Zeile');
    await p.click('#toasts button');   // Rückgängig
    ok(await wait(async () => !/getragen/.test(await info('Testhemd'))), 'Rückgängig nimmt den Eintrag zurück');
    await wear();
    ok(await wait(async () => /1× getragen/.test(await info('Testhemd'))), 'erneut eingetragen');
    await wear();
    ok(/schon eingetragen/.test(await toast()) && /1× getragen/.test(await info('Testhemd')), 'dasselbe Outfit zählt am selben Tag nur einmal');

    console.log('--- Kalender öffnen');
    const openCal = async () => {
      if (mobile) { await p.click('#more'); await p.click('#mCal'); } else await p.click('#calBtn');
      await p.waitForFunction(() => document.getElementById('calDlg').open);
    };
    await openCal();
    if (mobile) ok(await closed(p, 'moreDlg'), 'das Mehr-Menü schließt sich, der Kalender bleibt');
    ok(await p.evaluate(() => document.getElementById('calDlg').open), 'Kalender ist offen');
    ok((await p.textContent('#calMonth')) === monthLabel(new Date()), 'zeigt den aktuellen Monat: ' + await p.textContent('#calMonth'));
    const t = offset(0), tomorrow = offset(1), yesterday = offset(-1);
    const day = k => p.locator(`.cal-day[data-day="${k}"]`);
    ok(await day(t).getAttribute('aria-pressed') === 'true' && await day(t).getAttribute('aria-current') === 'date', 'heute ist gewählt und als heute markiert');
    ok(await day(t).locator('i.worn').count() === 1, 'heute trägt die Markierung „getragen“');
    ok(/Getragen: Büro/.test(await p.textContent('#calDayList')) && /2 Teile/.test(await p.textContent('#calDayList')), 'Tagesliste nennt Outfit und Teile');
    ok(/Outfit getragen/.test(await day(t).getAttribute('aria-label')), 'Bildschirmleser-Beschriftung nennt den Eintrag: ' + await day(t).getAttribute('aria-label'));
    const tabStops = await p.locator('.cal-day[tabindex="0"]').count();
    ok(tabStops === 1, 'nur ein Tag ist per Tab erreichbar (' + tabStops + ')');

    console.log('--- Planen');
    await day(tomorrow).click().catch(async () => { await p.click('#calNext'); await day(tomorrow).click(); });
    ok(await p.evaluate(k => document.querySelector(`.cal-day[data-day="${k}"]`).getAttribute('aria-pressed') === 'true', tomorrow), 'morgen ist gewählt');
    ok(await p.isDisabled('#calWear'), 'Zukunft: „Als getragen“ gesperrt');
    ok(/nur bis heute/.test(await p.textContent('#calHint')), 'Hinweis erklärt, warum');
    const outfitId = await p.locator('#calPick option', { hasText: 'Büro' }).getAttribute('value');
    await p.selectOption('#calPick', outfitId);
    ok(!(await p.isDisabled('#calPlan')), 'gespeichertes Outfit lässt sich planen');
    await p.click('#calPlan');
    ok(/Geplant: Büro/.test(await p.textContent('#calDayList')) && await day(tomorrow).locator('i.plan').count() === 1, 'Plan erscheint in Liste und Raster');
    await p.click('#calDayList >> text=Entfernen');
    ok(await p.evaluate(() => document.activeElement.id) === 'calDayTitle', 'Fokus springt nach dem Entfernen auf die Tagesüberschrift');
    ok(await day(tomorrow).locator('i').count() === 0 && /Noch nichts geplant/.test(await p.textContent('#calDayList')), 'Plan lässt sich entfernen');
    ok((await p.locator('#calPick option').first().textContent()) === 'Aktuelles Board', 'Board steht als Auswahl bereit, solange Teile darauf liegen');
    await p.selectOption('#calPick', '__board');
    ok(await p.isDisabled('#calPlan') && /gespeichert sein/.test(await p.textContent('#calHint')), 'das ungespeicherte Board lässt sich nicht planen');

    console.log('--- Tastatur');
    await day(t).focus();
    await p.keyboard.press('ArrowRight');
    ok(await p.evaluate(k => document.querySelector(`.cal-day[data-day="${k}"]`).getAttribute('aria-pressed') === 'true' && document.activeElement.dataset.day === k, tomorrow), 'Pfeil rechts: nächster Tag, Fokus folgt');
    await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowLeft');
    ok(await p.evaluate(k => document.activeElement.dataset.day === k, yesterday), 'Pfeil links: Vortag');
    await p.keyboard.press('ArrowDown');
    ok(await p.evaluate(k => document.activeElement.dataset.day === k, offset(6)), 'Pfeil runter: eine Woche weiter');
    await p.keyboard.press('PageDown');
    const nm = new Date(); nm.setDate(1); nm.setMonth(nm.getMonth() + 1);
    ok((await p.textContent('#calMonth')) === monthLabel(nm), 'Bild runter: nächster Monat (' + await p.textContent('#calMonth') + ')');
    await p.click('#calToday');
    ok((await p.textContent('#calMonth')) === monthLabel(new Date()) && await day(t).getAttribute('aria-pressed') === 'true', '„Heute“ springt zurück');

    console.log('--- Nachtragen');
    await day(yesterday).click().catch(async () => { await p.click('#calPrev'); await day(yesterday).click(); });
    await p.selectOption('#calPick', outfitId);
    ok(!(await p.isDisabled('#calWear')) && await p.isDisabled('#calPlan'), 'Vergangenheit: eintragen ja, planen nein');
    await p.click('#calWear');
    ok(/Getragen: Büro/.test(await p.textContent('#calDayList')), 'gestern nachgetragen');
    await p.click('#calWear');
    ok(await p.locator('#calDayList li').count() === 1, 'doppelter Eintrag wird abgelehnt');
    ok(/2× getragen \| 30,00\s€ pro Tragen/.test(await info('Testhemd')), 'Kosten pro Tragen sinken mit jedem Tragen: ' + await info('Testhemd'));

    console.log('--- Auswertung');
    await p.click('#calTabStats');
    const stats = await p.textContent('#calStats');
    ok(/Am häufigsten getragen/.test(stats) && /Testhemd/.test(stats) && /2×/.test(stats) && /30,00\s€ pro Tragen/.test(stats), 'Rangliste mit Anzahl und Kosten pro Tragen');
    ok(/Testschuhe/.test(stats) && /noch nie getragen/.test(stats), 'nie getragene Teile erscheinen unter „Lange nicht getragen“');
    ok(await p.getAttribute('#calTabStats', 'aria-pressed') === 'true' && await p.isHidden('#calCal'), 'Reiter wechselt die Ansicht');
    await p.click('#calTabCal');

    console.log('--- Schließen und Rückgängig');
    await p.keyboard.press('Escape');
    ok(await closed(p, 'calDlg'), 'Esc schließt den Kalender');
    await p.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    ok(await wait(async () => /1× getragen/.test(await info('Testhemd'))), 'Strg+Z nimmt den nachgetragenen Eintrag zurück');

    console.log('--- Löschen räumt auf');
    await card('Testhose').locator('.more').click().catch(() => {});
    if (await p.locator('#menuDlg[open]').count()) await p.click('#menuDelete');
    else await card('Testhose').locator('button[aria-label="Löschen"]').click({ force: true });
    await wait(async () => await card('Testhose').count() === 0);
    await openCal();
    ok(/1 Teil\b/.test(await p.textContent('#calDayList')), 'gelöschtes Teil verschwindet aus dem Protokoll');
    await p.click('#calClose'); await closed(p, 'calDlg');
    await p.click('#toasts button').catch(() => {});   // Rückgängig
    await wait(async () => await card('Testhose').count() === 1);
    ok(/1× getragen/.test(await info('Testhose')), 'Rückgängig bringt Teil samt Eintrag zurück');

    console.log('--- Speichern, Backup, Neustart');
    ok(await persisted(p, 3, 1), 'Bestand und Protokoll sind gespeichert');
    await p.reload(); await ready(p);
    ok(/1× getragen/.test(await info('Testhemd')), 'Protokoll übersteht einen Neustart');
    const dl = p.waitForEvent('download');
    await p.evaluate(() => document.getElementById('exp').click());
    const file = await (await dl).path();
    const bak = JSON.parse(await readFile(file, 'utf8'));
    ok(Array.isArray(bak.wears) && bak.wears.length === 1 && typeof bak.plans === 'object', 'Backup enthält Protokoll und Pläne');

    console.log('--- Feindliches Backup');
    const img = 'data:image/png;base64,' + PNG.toString('base64');
    const evil = JSON.stringify({
      items: [{ id: 'a', name: 'Echt', cat: 'Oberteil', img, price: 10, cur: 'EUR' }],
      outfits: [{ id: 'o1', name: 'Fit', pieces: [] }],
      wears: [
        { id: 'w1', d: offset(-2), o: 'o1', n: '<img src=x onerror=window.__pwned=1>Hack', items: ['a', 'nope'] },
        { id: 'w2', d: '2026-02-30', n: 'Kein Datum', items: ['a'] },
        { id: 'w3', d: offset(-3), n: 'Fremd', items: ['nope'] },
        '</script><script>window.__pwned=1</script>', null, 7,
      ],
      plans: { [offset(3)]: 'o1', [offset(4)]: 'o404', '__proto__': 'o1', 'x"><img src=x>': 'o1' },
    });
    await p.setInputFiles('#impf', { name: 'evil.json', mimeType: 'application/json', buffer: Buffer.from(evil) });
    await p.click('#uiOk');
    await p.waitForFunction(() => document.querySelectorAll('#grid .card').length === 1);
    await openCal();
    await day(offset(-2)).click().catch(async () => { await p.click('#calPrev'); await day(offset(-2)).click(); });
    const listed = await p.textContent('#calDayList');
    ok(/Getragen: Hack/.test(listed) && /1 Teil\b/.test(listed), 'nur das Gültige kommt an, Name ist von Markup befreit: ' + listed.replace(/\s+/g, ' ').slice(0, 80));
    ok(await p.locator('#calDayList img, #calDayList script').count() === 0 && !(await p.evaluate(() => window.__pwned)), 'es entsteht kein Element und kein Skript läuft');
    ok(await p.locator('.cal-day i').count() === 2, 'genau ein getragener und ein geplanter Tag (' + await p.locator('.cal-day i').count() + ')');
    await p.keyboard.press('Escape'); await closed(p, 'calDlg');

    const csp = await p.evaluate(() => window.__csp);
    ok(!errors.length, 'keine Seitenfehler ' + errors.join('|'));
    ok(!csp.length, 'keine CSP-Verstöße ' + csp.join('|'));
    ok(!native.length, 'keine nativen Dialoge ' + native.join('|'));
    await ctx.close();
  }
} finally {
  await browser.close(); server.close();
}
process.exit(result.fails ? 1 : 0);
