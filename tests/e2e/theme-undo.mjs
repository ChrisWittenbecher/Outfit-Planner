import { devices } from 'playwright';
import { readFile } from 'node:fs/promises';
import { addItem, checker, startServer, launch, closed } from './helpers.mjs';

const PORT = 8732, BASE = `http://localhost:${PORT}/index.html`;
const { ok, state: result } = checker();
const server = await startServer(PORT);
const browser = await launch();

const bg = (p, sel) => p.evaluate(s => getComputedStyle(document.querySelector(s)).backgroundColor, sel);
const attr = p => p.evaluate(() => document.documentElement.dataset.theme ?? null);
const ready = p => p.waitForSelector('html[data-ready]', { state: 'attached' });
const wait = (p, ms = 800) => p.waitForTimeout(ms);   // länger als die Pause, ab der ein neuer Rückgängig-Schritt beginnt
const toggle = async (p, want) => {   // der erste Wechsel einer frischen Engine kann länger dauern (View Transition), also auf das Ergebnis warten
  await p.click('#theme');
  await p.waitForFunction(w => (document.documentElement.dataset.theme ?? null) === w, want, { timeout: 8000 });
  await p.waitForTimeout(250);
};
const cards = p => p.locator('#grid .card').count();
const open = async (ctx) => {
  const p = await ctx.newPage(); const errors = [], native = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('dialog', d => { native.push(d.type()); d.dismiss(); });
  await p.goto(BASE); await ready(p);
  return { p, errors, native };
};

try {
  {
    console.log('--- Desktop, System dunkel');
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark', acceptDownloads: true });
    const { p, errors, native } = await open(ctx);

    ok(await attr(p) === null && await bg(p, 'body') === 'rgb(15, 15, 18)', 'Automatisch folgt dem dunklen System (Seite #0f0f12)');
    ok(/Automatisch/.test(await p.getAttribute('#theme', 'aria-label')), 'Umschalter nennt den Modus: Automatisch');
    await p.click('#addBtn');
    ok(await bg(p, '#dlg') === 'rgb(42, 42, 50)', 'Dialog im Dunkeln auf Ebene „Overlay“ (#2a2a32)');
    ok(await p.evaluate(() => getComputedStyle(document.querySelector('#name')).backgroundColor) === 'rgb(33, 33, 39)', 'Eingabefelder dunkel (#212127)');
    await p.click('#cancel');

    // Umschalten: Automatisch → Hell → Dunkel → Automatisch, mit Speicherung
    await toggle(p, 'light');
    ok(await attr(p) === 'light' && await bg(p, 'body') === 'rgb(232, 234, 238)', 'Hell erzwingt das helle Design trotz dunklem System');
    ok(await p.evaluate(() => localStorage.getItem('anprobe-theme')) === 'light', 'Wahl „Hell“ wird gespeichert');
    await p.reload({ waitUntil: 'domcontentloaded' });
    ok(await attr(p) === 'light', 'Init-Skript setzt das Design schon vor dem Start der Module (kein Aufblitzen)');
    await ready(p);
    await toggle(p, 'dark');
    ok(await attr(p) === 'dark' && await bg(p, 'body') === 'rgb(15, 15, 18)', 'Dunkel erzwingt das dunkle Design');
    ok(await p.evaluate(() => document.getElementById('metaLight').content) === '#0f0f12', 'Farbe der Browserleiste folgt dem gewählten Design');
    await toggle(p, null);
    ok(await attr(p) === null && await p.evaluate(() => localStorage.getItem('anprobe-theme')) === null, 'Zurück auf Automatisch: Attribut und Speicher geleert');

    // Teil anlegen; Kachel bleibt hell, Bühne wechselt
    await addItem(p, { trigger: '#addBtn', price: '39,90' });
    ok(await p.evaluate(() => getComputedStyle(document.querySelector('.card')).backgroundColor) === 'rgb(236, 236, 241)', 'Kachel bleibt im Dunkeln hell (dunkle Teile bleiben sichtbar)');
    await wait(p);   // Anlegen und Auflegen sollen getrennte Rückgängig-Schritte sein
    await p.locator('#grid .card img').first().click();
    ok(await p.locator('#board img.p').count() === 1, 'Teil liegt auf dem Board');
    const stage = [['Auto', 'rgb(142, 142, 154)'], ['Hell', 'rgb(236, 236, 241)'], ['Mittel', 'rgb(142, 142, 154)'], ['Dunkel', 'rgb(24, 24, 27)']];
    ok(await bg(p, '#board') === stage[0][1] && /Auto/.test(await p.textContent('#stageBtn')), 'Bühne Auto: im dunklen Design mittelgrau');
    for (const [name, rgb] of stage.slice(1)) {
      await p.click('#stageBtn');
      ok(await bg(p, '#board') === rgb && new RegExp(name).test(await p.textContent('#stageBtn')), `Bühne ${name}: ${rgb}`);
    }
    ok(await p.evaluate(() => localStorage.getItem('anprobe-stage')) === 'dark', 'Bühne wird gespeichert');
    // PNG übernimmt die Bühne
    await p.locator('#png').scrollIntoViewIfNeeded();
    const dl = p.waitForEvent('download'); await p.click('#png');
    const b64 = (await readFile(await (await dl).path())).toString('base64');
    const px = await p.evaluate(async d => { const im = new Image(); im.src = 'data:image/png;base64,' + d; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); return [...x.getImageData(2, 2, 1, 1).data]; }, b64);
    ok(px.join() === '24,24,27,255', 'PNG-Export nutzt die gewählte Bühne (' + px.join(',') + ')');
    await p.click('#stageBtn');   // zurück auf Auto
    ok(await p.evaluate(() => document.documentElement.dataset.stage ?? null) === null, 'Bühne wieder Auto');

    console.log('--- Rückgängig und Wiederholen');
    await wait(p);
    await p.click('#undo');
    ok(await p.locator('#board img.p').count() === 0 && await cards(p) === 1, 'Rückgängig: Teil verschwindet vom Board, bleibt im Schrank');
    await p.click('#redo');
    ok(await p.locator('#board img.p').count() === 1, 'Wiederholen: Teil liegt wieder auf dem Board');
    await p.click('h1'); await p.keyboard.press('Control+z'); await wait(p, 100);
    ok(await p.locator('#board img.p').count() === 0, 'Strg+Z macht rückgängig');
    await p.keyboard.press('Control+Shift+Z'); await wait(p, 100);
    ok(await p.locator('#board img.p').count() === 1, 'Strg+Umschalt+Z wiederholt');
    await p.click('#undo'); await p.click('#undo');
    ok(await cards(p) === 0 && await p.locator('#undo').isDisabled(), 'Zweimal zurück: Teil entfernt, nichts mehr rückgängig zu machen');
    await p.click('#redo'); await p.click('#redo');
    ok(await cards(p) === 1 && await p.locator('#board img.p').count() === 1, 'Zweimal vor: alles wieder da');
    // Neue Aktion verwirft die Wiederholen-Kette
    await p.click('#undo'); await wait(p);
    await p.locator('#grid .card img').first().click(); await wait(p);
    ok(await p.locator('#redo').isDisabled(), 'Neue Änderung leert „Wiederholen“');

    // Outfit speichern mit eigenem Dialog
    console.log('--- Eigene Dialoge');
    await p.click('#save');
    ok(await p.locator('#uiDlg').evaluate(d => d.open) && await p.inputValue('#uiInput') === 'Outfit 1', 'Namens-Dialog statt prompt(), Vorschlag „Outfit 1“');
    ok(await bg(p, '#uiDlg') === 'rgb(42, 42, 50)', 'Dialog im Dunkeln');
    await p.keyboard.press('Escape');
    ok(await closed(p, 'uiDlg') && await p.locator('#outs .out').count() === 0, 'Esc bricht ab, nichts gespeichert');
    await p.click('#save'); await p.fill('#uiInput', 'Sommer'); await p.keyboard.press('Enter');
    await p.waitForSelector('#outs .out');
    ok(await p.textContent('#outs .out b') === 'Sommer', 'Enter speichert das Outfit unter dem Namen');
    await p.click('#outs .out button:has-text("Löschen")');
    ok(await p.locator('#outs .out').count() === 0 && /gelöscht/.test(await p.textContent('#toasts')), 'Outfit löschen ohne Rückfrage, Hinweis erscheint');
    await p.click('#toasts button:has-text("Rückgängig")');
    ok(await p.locator('#outs .out').count() === 1, 'Hinweis „Rückgängig“ stellt das Outfit wieder her');

    // Teil löschen und zurückholen
    await p.locator('#grid .card').first().hover();
    await p.locator('#grid .card').first().locator('.acts button[aria-label="Löschen"]').click();
    ok(await cards(p) === 0 && await p.locator('#board img.p').count() === 0, 'Teil löschen: weg aus Schrank und Board');
    await p.click('#toasts button:has-text("Rückgängig")');
    ok(await cards(p) === 1 && await p.locator('#board img.p').count() === 1, 'Rückgängig: Teil wieder im Schrank und auf dem Board');

    // Backup: Export, Teil löschen, Import mit Rückfrage
    await wait(p);
    const exp = p.waitForEvent('download'); await p.click('#cloudBtn'); await p.click('#exp');
    const file = await (await exp).path();
    await p.locator('#grid .card').first().hover();
    await p.locator('#grid .card').first().locator('.acts button[aria-label="Löschen"]').click();
    await p.waitForTimeout(100);
    await p.setInputFiles('#impf', file);
    await p.waitForFunction(() => document.getElementById('uiDlg').open);
    ok(/ersetzt/.test(await p.textContent('#uiText')), 'Backup einlesen fragt im eigenen Dialog nach');
    await p.click('#uiCancel');
    ok(await cards(p) === 0, 'Abbrechen lässt die Daten unverändert');
    await p.setInputFiles('#impf', file);
    await p.waitForFunction(() => document.getElementById('uiDlg').open);
    await p.click('#uiOk');
    await p.waitForFunction(() => document.querySelectorAll('#grid .card').length === 1);
    ok(/eingelesen/.test(await p.textContent('#toasts')), 'Backup eingelesen, Hinweis erscheint');
    await p.click('#toasts button:has-text("Rückgängig")');
    ok(await cards(p) === 0, 'Rückgängig nimmt das Einlesen zurück');
    await p.setInputFiles('#impf', { name: 'kaputt.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":1}') });
    await p.waitForSelector('#toasts .toast--err');
    ok(true, 'Ungültige Datei: Fehlerhinweis statt alert()');

    ok(native.length === 0, 'keine nativen alert/confirm/prompt-Dialoge ' + native.join(','));
    ok(errors.length === 0, 'keine Skriptfehler ' + errors.join(' | '));
    await ctx.close();
  }

  for (const [label, motion, expected] of [['normal', 'no-preference', 'card-in'], ['reduziert', 'reduce', 'none']]) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: motion });
    const { p } = await open(ctx);
    await addItem(p, { trigger: '#addBtn' });
    const an = await p.evaluate(() => getComputedStyle(document.querySelector('#grid .card')).animationName);
    ok(an === expected, `Neue Karte: Animation bei Bewegung ${label} = ${expected} (${an})`);
    await ctx.close();
  }

  {
    console.log('--- iPhone 13, System hell');
    const ctx = await browser.newContext({ ...devices['iPhone 13'], colorScheme: 'light', acceptDownloads: true });
    const { p, errors, native } = await open(ctx);
    ok(await bg(p, 'body') === 'rgb(232, 234, 238)', 'Hell: Seite #e8eaee');
    ok(await p.locator('#exp').isHidden() && await p.locator('#imp').isHidden() && await p.locator('#more').isVisible() && await p.locator('#cloudBtn').isVisible(), 'Smartphone: Export/Import liegen im Konto-Menü');
    const sizes = await p.evaluate(() => ['undo', 'redo', 'theme', 'more'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return [id, Math.round(r.width), Math.round(r.height)]; }));
    ok(sizes.every(([, w, h]) => w >= 40 && h >= 40), 'Symbolschaltflächen mindestens 40 × 40 px ' + JSON.stringify(sizes));
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Kopfzeile ohne horizontalen Überlauf');
    await p.click('#more');
    ok(await p.locator('#moreDlg').evaluate(d => d.open), '„Mehr“ öffnet das Menü');
    await p.click('#mClose'); ok(await closed(p, 'moreDlg'), '„Schließen“ schließt das Menü');
    await p.click('#cloudBtn');
    ok(await p.locator('#imp').isVisible(), 'Konto-Knopf öffnet das Menü mit Wiederherstellen');
    const exp = p.waitForEvent('download'); await p.click('#exp');
    ok(/^anprobe-backup-.*\.json$/.test((await exp).suggestedFilename()) && await p.evaluate(() => !document.getElementById('acctMenu').matches(':popover-open')), '„Backup“ im Konto-Menü lädt die Datei und schließt das Menü');
    await toggle(p, 'light');
    ok(await attr(p) === 'light', 'Hell → Umschalter (Automatisch → Hell)');
    await toggle(p, 'dark');
    ok(await attr(p) === 'dark' && await bg(p, 'body') === 'rgb(15, 15, 18)', 'Umschalter auf Dunkel am Smartphone');
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
