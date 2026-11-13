import { devices } from 'playwright';
import { PNG, checker, closed, engine, launch, startServer, storedItems } from './helpers.mjs';

// Schneller hinzufügen: Auswahl-Blatt (Fotos, Kamera, Link), Warteschlange mit Zustand je Foto, Prüfschritt, Abbrechen, Rückgängig, Grenzen.
const PORT = 8764, BASE = `http://localhost:${PORT}/index.html`;
const { ok, state: result } = checker();
const server = await startServer(PORT);
const browser = await launch();
const ready = p => p.waitForSelector('html[data-ready]', { state: 'attached' });
const wait = async (cond, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await cond()) return true; await new Promise(r => setTimeout(r, 40)); } return false; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

try {
  for (const [name, opts] of [['iPhone 13', { ...devices['iPhone 13'], acceptDownloads: true }], ['Desktop', { viewport: { width: 1280, height: 900 }, acceptDownloads: true }]]) {
    const mobile = name !== 'Desktop', trigger = mobile ? '#fab' : '#addBtn';
    console.log('--- ' + name);
    const ctx = await browser.newContext(opts);
    const p = await ctx.newPage();
    const errors = [], native = [];
    p.on('pageerror', e => errors.push(e.message));
    p.on('dialog', d => { native.push(d.type()); d.dismiss(); });
    await p.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
    await p.goto(BASE); await ready(p);
    const cdp = engine === 'chromium' ? await ctx.newCDPSession(p) : null;
    const throttle = rate => cdp ? cdp.send('Emulation.setCPUThrottlingRate', { rate }) : null;

    const swatch = (hex, w = 200, h = 240) => p.evaluate(([hx, w, h]) => {
      const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h); x.fillStyle = hx; x.fillRect(w * .2, h * .12, w * .6, h * .76);
      return c.toDataURL('image/png').split(',')[1];
    }, [hex, w, h]).then(b => Buffer.from(b, 'base64'));
    const img = async (file, hex, w, h) => ({ name: file, mimeType: 'image/png', buffer: await swatch(hex, w, h) });
    const BAD = { name: 'kaputt.png', mimeType: 'image/png', buffer: Buffer.from('das ist kein bild') };
    const PDF = { name: 'rechnung.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') };
    const HUGE = { name: 'riesig.png', mimeType: 'image/png', buffer: Buffer.alloc(26_000_000) };

    const cards = () => p.locator('#grid .card').count();
    const toasts = () => p.evaluate(() => [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent.trim()).join(' | '));
    const isOpen = id => p.evaluate(i => document.getElementById(i).open, id);
    const head = async () => (await p.textContent('#queueHead')).replace(/\s+/g, ' ').trim();
    const states = () => p.locator('#queueList .q').evaluateAll(l => l.map(e => [...e.classList].find(c => c.startsWith('q--')).slice(3)));
    const rowOf = fname => p.locator('#queueList .q').filter({ has: p.locator(`[aria-label$=", ${fname}"], [aria-label="Entfernen: ${fname}"]`) });
    const names = () => p.locator('#queueList input').evaluateAll(l => l.map(i => i.value));
    const doneAll = async () => wait(async () => !(await states()).some(s => s === 'wait' || s === 'work'));
    // Der Plus-Knopf weicht beim Runterscrollen aus (css .fab.away): vor dem Tippen nach oben, bei Fehlschlag Zustand ausgeben
    const top = () => p.evaluate(() => scrollTo(0, 0));
    const tap = async () => {
      await top();
      try { await p.click(trigger, { timeout: 10000 }); }
      catch (e) {
        console.log('INFO  Knopf nicht klickbar: ' + JSON.stringify(await p.evaluate(() => ({ y: scrollY, h: document.documentElement.scrollHeight, ih: innerHeight, cls: document.getElementById('fab').className, view: document.documentElement.dataset.view, open: [...document.querySelectorAll('dialog[open]')].map(d => d.id) }))));
        throw e;
      }
    };
    const openQueue = async files => {
      await tap();
      await p.setInputFiles('#file', files);
      await p.waitForFunction(() => document.getElementById('queueDlg').open);
    };
    const closeQueue = async () => { await p.click('#queueCancel'); return closed(p, 'queueDlg'); };
    const undoState = () => p.isDisabled('#undo');

    console.log('--- Auswahl-Blatt');
    ok(await p.locator(trigger).isVisible(), 'Hinzufügen-Knopf ist da (' + trigger + ')');
    await tap();
    ok(await isOpen('addDlg') && !(await isOpen('dlg')), 'Hinzufügen öffnet das Blatt, nicht gleich den Dialog');
    ok((await p.textContent('#addTitle')).trim() === 'Teil hinzufügen', 'Blatt heißt „Teil hinzufügen“');
    ok(await p.isVisible('#wayPhotos') && /Fotos wählen/.test(await p.textContent('#wayPhotos')), 'Weg „Fotos wählen“');
    ok(await p.isVisible('#wayLink') && /Link einfügen/.test(await p.textContent('#wayLink')), 'Weg „Link einfügen“ (Hilfsdienst ist eingerichtet)');
    ok(mobile ? await p.isVisible('#wayCamera') : await p.isHidden('#wayCamera'), mobile ? 'am Handy gibt es „Kamera“' : 'am PC gibt es keine „Kamera“');
    ok(await p.evaluate(() => document.activeElement && document.activeElement.id) === 'wayPhotos', 'Fokus steht auf dem ersten Weg');
    ok(await p.getAttribute('#cam', 'capture') === 'environment' && await p.getAttribute('#cam', 'accept') === 'image/*' && await p.getAttribute('#cam', 'multiple') === null, 'Kamera-Feld: Rückkamera, nur Bilder, ein Foto');
    ok(await p.getAttribute('#file', 'multiple') !== null && await p.getAttribute('#file', 'accept') === 'image/*', 'Foto-Feld: mehrere, nur Bilder');
    ok(await p.evaluate(() => !document.getElementById('dlg').contains(document.getElementById('file'))), 'Foto-Feld liegt außerhalb des Dialogs (das Blatt kann es öffnen)');
    await p.click('#addClose'); ok(await closed(p, 'addDlg'), 'Abbrechen schließt das Blatt');
    ok(await cards() === 0, 'nichts wurde hinzugefügt');
    await tap(); await p.keyboard.press('Escape'); ok(await closed(p, 'addDlg'), 'Esc schließt das Blatt');

    console.log('--- Wege des Blatts');
    await tap();
    let [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('#wayPhotos')]);
    ok(chooser.isMultiple(), '„Fotos wählen“ öffnet die Auswahl mit mehreren Bildern');
    await chooser.setFiles([]);   // Auswahl abbrechen
    await sleep(300);
    ok(await isOpen('addDlg'), 'Abbrechen der Auswahl lässt das Blatt offen');
    if (mobile) {
      [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('#wayCamera')]);
      ok(!chooser.isMultiple(), '„Kamera“ öffnet die Aufnahme mit einem Bild');
      await chooser.setFiles(await img('kamera.png', '#2e7d32'));
      await p.waitForFunction(() => document.getElementById('dlg').open && !document.getElementById('addDlg').open);
      ok(await p.waitForSelector('#res img', { timeout: 15000 }).then(() => true), 'ein Kamerafoto führt in den Dialog „Neues Teil“ und wird verarbeitet');
      ok(await p.isHidden('#queueDlg') && (await p.inputValue('#name')) === 'kamera', 'Name aus dem Dateinamen: ' + await p.inputValue('#name'));
      await p.click('#cancel'); await closed(p, 'dlg');
      ok(await cards() === 0, 'Abbrechen im Dialog fügt nichts hinzu');
      await tap();
    }
    [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('#wayPhotos')]);
    await chooser.setFiles(await img('hemd_blau.png', '#1565c0'));
    await p.waitForFunction(() => document.getElementById('dlg').open && !document.getElementById('addDlg').open);
    ok(await p.waitForSelector('#res img', { timeout: 15000 }).then(() => true), 'ein einzelnes Foto führt in den ausführlichen Dialog');
    ok(await p.inputValue('#name') === 'hemd blau' && await isOpen('dlg') && !(await isOpen('queueDlg')), 'Name „hemd blau“ aus dem Dateinamen, keine Warteschlange');
    await p.click('#cancel'); await closed(p, 'dlg');
    await tap();
    await p.click('#wayLink'); await p.waitForFunction(() => document.getElementById('dlg').open && !document.getElementById('addDlg').open);
    ok(await p.evaluate(() => document.activeElement && document.activeElement.id) === 'url', '„Link einfügen“ öffnet den Dialog mit Cursor im Linkfeld');
    await p.click('#cancel'); await closed(p, 'dlg');
    await tap();
    await p.setInputFiles('#file', PDF);
    await sleep(400);
    ok(/keine Bilder/.test(await toasts()) && await isOpen('addDlg') && !(await isOpen('queueDlg')) && !(await isOpen('dlg')), 'nur eine PDF-Datei: Hinweis „keine Bilder“, das Blatt bleibt offen');
    await p.click('#addClose'); await closed(p, 'addDlg');

    console.log('--- Warteschlange: Zustand je Foto');
    await p.click('#chips button:has-text("Jacke")');   // Standard-Kategorie folgt dem Filter
    const files = [
      await img('gruene_jacke.png', '#2e7d32'), await img('IMG_0042.png', '#d8c3a5'), BAD, await img('Rote Hose.png', '#c62828', 220, 200),
      await img('schal.png', '#6a1b9a', 160, 240), HUGE, PDF, await img('mantel.png', '#37474f'),
    ];
    const items0 = (await storedItems(p)).length, undo0 = await undoState();
    await throttle(6);
    await openQueue(files);
    const first = await states();
    ok(first.length === 7 && (!cdp || first.filter(s => s === 'wait').length >= 5), 'sieben Fotos in der Liste (die PDF-Datei ist keins)' + (cdp ? ', die meisten wartend' : '') + ': ' + first.join(','));
    ok(await p.locator('#queueList .q--work').count() <= 1, 'höchstens ein Foto wird gleichzeitig verarbeitet');
    ok(/Datei ist kein Bild und fehlt/.test(await p.textContent('#queueNote')) && await p.isVisible('#queueNote'), 'Hinweis: eine Datei ist kein Bild (' + (await p.textContent('#queueNote')).trim() + ')');
    ok(/^[0-9] von 7 (fertig|Fotos sind bereit)/.test(await head()), 'Zeile unter dem Titel zählt mit: ' + await head());   // ist alles fertig (schneller Rechner), heißt es „… sind bereit“
    ok(await p.evaluate(() => document.getElementById('queueAdd').disabled === (document.querySelectorAll('#queueList .q--done').length === 0)), '„Hinzufügen“ ist gesperrt, solange nichts fertig ist, und frei, sobald ein Foto fertig ist');
    const bar = await p.evaluate(() => { const b = document.getElementById('queueBar'); return [b.getAttribute('role'), b.getAttribute('aria-valuemin'), b.getAttribute('aria-valuemax'), b.getAttribute('aria-labelledby')]; });
    ok(bar.join() === 'progressbar,0,100,queueHead', 'Fortschrittsbalken hat Rolle, Bereich und Beschriftung');
    ok(await p.evaluate(() => document.activeElement && document.activeElement.id) === 'queueTitle', 'Fokus steht auf der Überschrift');
    ok(!cdp || await p.locator('#queueList .q-state', { hasText: 'Wartet' }).count() >= 1, 'wartende Fotos sagen „Wartet …“');
    const seen = new Set(), vals = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 30000) {
      const s = await states(); s.forEach(x => seen.add(x)); vals.push(+await p.getAttribute('#queueBar', 'aria-valuenow'));
      if (!s.some(x => x === 'wait' || x === 'work')) break;
      await sleep(60);
    }
    await throttle(1);
    ok(seen.has('work') || !cdp, 'ein Foto war „in Arbeit“ (' + [...seen].join(',') + ')');
    ok(vals.every((v, i) => i === 0 || v >= vals[i - 1]) && vals[vals.length - 1] >= 90, 'Fortschritt wächst nur und endet bei 100 (' + vals.slice(-3).join(',') + ')');
    ok(await doneAll(), 'alle Fotos sind abgeschlossen');
    ok(await head() === '5 von 7 Fotos sind bereit, 2 mit Fehler', 'Ergebnis: ' + await head());
    ok(await p.getAttribute('#queueBar', 'aria-valuenow') === '100', 'Balken steht bei 100');
    ok(/Hinzufügen \(5\)/.test(await p.textContent('#queueAdd')) && await p.isEnabled('#queueAdd'), '„Hinzufügen (5)“ ist frei');
    const bad = await p.locator('#queueList .q--fail .q-state').allTextContents();
    ok(bad.length === 2 && bad.some(t => /kein lesbares Bild/.test(t)) && bad.some(t => /zu groß \(höchstens 25 MB\)/.test(t)), 'Fehler sind verständlich: ' + bad.join(' | '));
    ok(await p.locator('#queueList .q--fail .q-file').allTextContents().then(l => l.sort().join() === 'kaputt.png,riesig.png'), 'Fehlerzeilen nennen die Datei');
    ok(await p.locator('#queueList .q--done img').evaluateAll(l => l.length === 5 && l.every(i => i.src.startsWith('data:image/png'))), 'fertige Fotos zeigen das freigestellte Bild');
    ok((await names()).join('|') === 'gruene jacke|Neues Teil|Rote Hose|schal|mantel', 'Namen aus den Dateinamen: ' + (await names()).join('|'));
    ok(await p.locator('#queueList select').evaluateAll(l => l.every(s => s.value === 'Jacke')) && await p.inputValue('#queueCat') === 'Jacke', 'Kategorie folgt dem Filter (Jacke)');
    ok(await cards() === 0 && (await storedItems(p)).length === items0 && await undoState() === undo0, 'bis hierhin ist nichts hinzugefügt, nichts gespeichert, nichts rückgängig zu machen');
    ok(/5 von 7 Fotos sind bereit/.test(await p.textContent('#queueLive')), 'Bildschirmleser bekommt das Ergebnis gemeldet');

    console.log('--- Prüfschritt');
    await p.locator('#queueList input').first().fill('Grüne Jacke Oslo');
    await rowOf('IMG_0042.png').locator('select').selectOption('Hose/Rock');
    await p.selectOption('#queueState', 'wish');
    await p.selectOption('#queueCat', 'Accessoire');
    ok(await p.locator('#queueList select').evaluateAll(l => l.every(s => s.value === 'Accessoire')), '„Kategorie für alle“ setzt jede Zeile');
    ok((await names())[0] === 'Grüne Jacke Oslo', 'ein geänderter Name bleibt erhalten');
    await rowOf('IMG_0042.png').locator('select').selectOption('Hose/Rock');
    await rowOf('Rote Hose.png').locator('select').selectOption('Schuhe');   // Schuhe: einzelner Schuh wird gespiegelt ergänzt, also neu verarbeiten
    ok(await doneAll() && await wait(async () => /5 von 7 Fotos sind bereit/.test(await head())), 'danach sind wieder alle fertig: ' + await head());
    ok(await rowOf('Rote Hose.png').locator('select').inputValue() === 'Schuhe' && (await names())[2] === 'Rote Hose', 'Kategorie „Schuhe“ und Name bleiben');
    await rowOf('schal.png').getByRole('button', { name: 'Entfernen: schal.png' }).click();
    ok(await p.locator('#queueList .q').count() === 6 && !(await names()).includes('schal'), 'Entfernen nimmt ein Foto aus der Liste');
    ok(await head() === '4 von 6 Fotos sind bereit, 2 mit Fehler' && /Hinzufügen \(4\)/.test(await p.textContent('#queueAdd')), 'Zähler passen sich an: ' + await head());
    ok(await p.evaluate(() => { const a = document.activeElement; return !!a && a.closest('#queueDlg') !== null && a.tagName !== 'BODY'; }), 'Fokus bleibt im Dialog nach dem Entfernen');
    ok(await cards() === 0 && (await storedItems(p)).length === items0, 'auch nach dem Bearbeiten ist noch nichts hinzugefügt');

    console.log('--- Hinzufügen');
    const bg0 = await cards();
    await p.click('#queueAdd'); ok(await closed(p, 'queueDlg'), 'der Dialog schließt sich');
    ok(await wait(async () => /4 Teile hinzugefügt \(3 Kategorien, Wunschliste\)/.test(await toasts())), 'Meldung: ' + (await toasts()).slice(0, 200));
    ok(/Übersprungen: 2 nicht lesbar, 1 Datei ohne Bild/.test(await toasts()), 'Meldung nennt Übersprungenes');
    await p.click('#chips button:has-text("Alle")');
    await p.click('#statusChips button:has-text("Wunschliste")').catch(() => {});
    ok(await wait(async () => await cards() === bg0 + 4), 'vier neue Teile im Schrank (' + await cards() + ')');
    const stored = await storedItems(p);
    const byName = n => stored.find(i => i.name === n);
    ok(!!byName('Grüne Jacke Oslo') && byName('Grüne Jacke Oslo').cat === 'Accessoire' && byName('Grüne Jacke Oslo').status === 'wish', 'Name, Kategorie und Wunschliste sind übernommen');
    ok(byName('Neues Teil')?.cat === 'Hose/Rock' && byName('Rote Hose')?.cat === 'Schuhe' && byName('mantel')?.cat === 'Accessoire', 'jede Kategorie so, wie im Prüfschritt gewählt');
    ok(stored.filter(i => ['Grüne Jacke Oslo', 'Neues Teil', 'Rote Hose', 'mantel'].includes(i.name)).every(i => i.cut && i.img.startsWith('data:image/png') && i.orig && i.color), 'alle freigestellt, mit Original und erkannter Farbe');
    ok(byName('Rote Hose').mirror === true && byName('gruene jacke') === undefined, 'als Schuh verarbeitet (gespiegelt ergänzt), entfernte und fehlerhafte fehlen');
    ok(!stored.some(i => i.name === 'schal' || i.name === 'riesig' || i.name === 'kaputt'), 'entfernte und fehlerhafte Fotos sind nicht dabei');
    await p.click('#toasts button');   // Rückgängig
    ok(await wait(async () => await cards() === bg0), 'ein Klick auf „Rückgängig“ entfernt alle vier');
    await p.click('#redo');
    ok(await wait(async () => await cards() === bg0 + 4), 'Wiederholen bringt sie zurück');
    await p.click('#undo');
    ok(await wait(async () => await cards() === bg0), 'und wieder weg');

    console.log('--- Abbrechen ändert nichts');
    const before = { items: (await storedItems(p)).length, undo: await undoState() };
    await openQueue([await img('a.png', '#2e7d32'), await img('b.png', '#1565c0')]);
    ok(await doneAll() && /2 von 2 Fotos sind bereit/.test(await head()), 'zwei Fotos fertig');
    ok(await closeQueue() && await cards() === bg0 && (await storedItems(p)).length === before.items && await undoState() === before.undo, '„Abbrechen“ verwirft alles');
    await openQueue([await img('a.png', '#2e7d32'), await img('b.png', '#1565c0')]);
    await doneAll();
    await p.keyboard.press('Escape');
    ok(await closed(p, 'queueDlg') && await cards() === bg0 && (await storedItems(p)).length === before.items, 'Esc verwirft alles');
    await openQueue([await img('a.png', '#2e7d32'), await img('b.png', '#1565c0')]);
    const hist = await p.evaluate(() => history.length);
    await p.goBack(); await sleep(600);
    ok(!(await isOpen('queueDlg')) && p.url() === BASE && await cards() === bg0, 'Zurück schließt die Warteschlange, die Seite bleibt');
    ok(await p.evaluate(() => history.length) <= hist, 'Verlauf wächst nicht an');
    ok(await p.evaluate(() => document.querySelector('#queueList').children.length) === 0, 'die Liste ist nach dem Schließen leer (Speicher frei)');

    console.log('--- Fertige hinzufügen, während noch gearbeitet wird');
    if (cdp) {
      await throttle(8);
      await openQueue(await Promise.all(['1', '2', '3', '4', '5', '6'].map((n, i) => img(`foto${n}.png`, ['#2e7d32', '#1565c0', '#c62828', '#6a1b9a', '#37474f', '#ef6c00'][i]))));
      ok(await wait(async () => (await states()).includes('done'), 30000), 'das erste Foto wird fertig');
      const c = (await states()).filter(s => s === 'done').length;
      ok(/Fertige hinzufügen \(\d\)/.test(await p.textContent('#queueAdd')) && await p.isEnabled('#queueAdd'), 'Knopf heißt jetzt „Fertige hinzufügen“, solange noch gearbeitet wird');
      await p.click('#queueAdd'); await throttle(1);
      ok(await closed(p, 'queueDlg'), 'schließt');
      const stopped = await wait(async () => /nicht mehr verarbeitet/.test(await toasts()));
      const n1 = await cards();
      await sleep(1500);
      ok(stopped && n1 >= bg0 + c && n1 < bg0 + 6 && await cards() === n1, 'nur die fertigen Fotos kommen dazu, der Rest wird nicht mehr verarbeitet (' + (n1 - bg0) + ' von 6): ' + (await toasts()).slice(0, 120));
      await p.click('#toasts button'); ok(await wait(async () => await cards() === bg0), 'Rückgängig nimmt sie wieder weg');
    } else console.log('INFO  Teilabschluss braucht Chromium (CPU-Drosselung), hier übersprungen');

    console.log('--- Grenzen');
    const small = await Promise.all(Array.from({ length: 33 }, (_, i) => img(`k${i}.png`, '#2e7d32', 60, 80)));
    await openQueue([...small, PDF]);
    ok(await p.locator('#queueList .q').count() === 30, 'höchstens 30 Fotos (' + await p.locator('#queueList .q').count() + ')');
    const note = (await p.textContent('#queueNote')).replace(/\s+/g, ' ');
    ok(/1 Datei ist kein Bild und fehlt/.test(note) && /3 Bilder liegen über dem Limit von 30 Fotos und fehlt/.test(note), 'Hinweis nennt Limit und fremde Dateien: ' + note.trim());
    ok(await closeQueue() && await cards() === bg0, 'Abbrechen mitten in der Verarbeitung: nichts bleibt zurück');
    await sleep(500);
    ok(await p.locator('#queueList .q').count() === 0 && errors.length === 0, 'nach dem Schließen läuft nichts weiter');
    await openQueue([BAD, BAD]);
    ok(await doneAll() && await head() === 'Kein Foto konnte verarbeitet werden.', 'nur defekte Dateien: ' + await head());
    ok(await p.isDisabled('#queueAdd') && (await p.textContent('#queueCancel')).trim() === 'Schließen', '„Hinzufügen“ gesperrt, Abbrechen heißt „Schließen“');
    await p.getByRole('button', { name: 'Entfernen: kaputt.png' }).first().click();
    await p.getByRole('button', { name: 'Entfernen: kaputt.png' }).first().click();
    ok(await closed(p, 'queueDlg'), 'sind alle Fotos entfernt, schließt sich der Dialog');

    console.log('--- Mehrere Fotos aus dem Dialog „Neues Teil“');
    await tap(); await p.click('#wayLink'); await p.waitForFunction(() => document.getElementById('dlg').open && !document.getElementById('addDlg').open);
    await p.setInputFiles('#file', [await img('x1.png', '#2e7d32'), await img('x2.png', '#1565c0')]);
    await p.waitForFunction(() => document.getElementById('queueDlg').open && !document.getElementById('dlg').open);
    ok(await doneAll() && /2 von 2 Fotos sind bereit/.test(await head()), 'mehrere Fotos im Dialog führen in die Warteschlange');
    await closeQueue();
    console.log('--- Teil bearbeiten: mehrere Bilder ersetzen nur das Bild des Teils');
    const n0 = await cards();
    await tap(); await p.setInputFiles('#file', await img('alt.png', '#2e7d32'));
    await p.waitForSelector('#res img', { timeout: 15000 });
    await p.fill('#name', 'Zum Bearbeiten'); await p.click('#ok'); await closed(p, 'dlg');
    ok(await wait(async () => await cards() === n0 + 1), 'Teil angelegt');
    await p.evaluate(() => [...document.querySelectorAll('#grid .card')].find(c => c.textContent.includes('Zum Bearbeiten')).querySelector('button[aria-label="Bearbeiten"]').click());
    await p.waitForFunction(() => document.getElementById('dlg').open);
    ok(await p.textContent('#dlgTitle') === 'Teil bearbeiten', 'Bearbeiten-Dialog offen');
    await p.setInputFiles('#file', [await img('neu1.png', '#1565c0'), await img('neu2.png', '#c62828')]);
    await sleep(600);
    ok(await isOpen('dlg') && !(await isOpen('queueDlg')) && !(await isOpen('addDlg')), 'beim Bearbeiten startet keine Warteschlange, es gilt das erste Bild');
    await p.click('#cancel'); await closed(p, 'dlg');

    console.log('--- Tastatur');
    await p.keyboard.press('Escape'); await sleep(400);
    await top(); await p.focus(trigger); await p.keyboard.press('Enter');
    await p.waitForFunction(() => document.getElementById('addDlg').open);
    ok(await p.evaluate(() => document.activeElement && document.activeElement.id) === 'wayPhotos', 'Enter öffnet das Blatt, Fokus auf „Fotos wählen“');
    await p.keyboard.press('Tab');
    ok(await p.evaluate(() => document.activeElement && document.activeElement.closest('#addDlg') !== null), 'Tab bleibt im Blatt');
    await p.keyboard.press('Escape'); await closed(p, 'addDlg');
    await openQueue([await img('t1.png', '#2e7d32'), await img('t2.png', '#1565c0')]);
    await doneAll();
    await p.focus('#queueList input'); await p.keyboard.press('ControlOrMeta+a'); await p.keyboard.type('Getippter Name');
    ok((await names())[0] === 'Getippter Name', 'Namen lassen sich tippen');
    await p.focus('#queueAdd'); await p.keyboard.press('Enter'); await closed(p, 'queueDlg');
    ok(await wait(async () => (await storedItems(p)).some(i => i.name === 'Getippter Name')), 'per Tastatur hinzugefügt, mit dem getippten Namen');

    console.log('--- Layout');
    await openQueue([await img('l1.png', '#2e7d32'), await img('l2 mit sehr langem Dateinamen für den Umbruch.png', '#1565c0'), BAD, await img('l4.png', '#c62828')]);
    await doneAll();
    for (const w of [320, 360, 390, 768, 1280]) {
      await p.setViewportSize({ width: w, height: 800 }); await sleep(250);
      const lay = await p.evaluate(() => {
        const coarse = matchMedia('(pointer: coarse)').matches, min = coarse ? 40 : 28;   // Berührungsgeräte bekommen größere Ziele (css: pointer: coarse)
        const vw = document.documentElement.clientWidth, d = document.getElementById('queueDlg'), r = d.getBoundingClientRect(), bad = [];
        for (const e of d.querySelectorAll('button, input, select, .q')) { const b = e.getBoundingClientRect(); if (b.width && (b.left < r.left - 0.5 || b.right > r.right + 0.5)) bad.push((e.id || e.className || e.tagName) + ' ' + Math.round(b.left) + '..' + Math.round(b.right)); }
        return { over: document.documentElement.scrollWidth - vw, bad, small: [...d.querySelectorAll('button, input, select')].filter(e => e.offsetParent && e.getBoundingClientRect().height < min - 0.5).map(e => (e.id || e.getAttribute('aria-label') || e.textContent) + ' (' + Math.round(e.getBoundingClientRect().height * 10) / 10 + ' < ' + min + ')') };
      });
      ok(lay.over <= 0 && lay.bad.length === 0, `${w}px: nichts ragt heraus (${lay.over} / ${lay.bad.join(', ')})`);
      ok(lay.small.length === 0, `${w}px: Bedienelemente groß genug ${lay.small.join(',')}`);
    }
    await closeQueue();
    await p.setViewportSize(opts.viewport || devices['iPhone 13'].viewport);
    await tap();
    for (const w of [320, 360, 390, 768, 1280]) {
      await p.setViewportSize({ width: w, height: 800 }); await sleep(200);
      ok(await p.evaluate(() => { const d = document.getElementById('addDlg'), r = d.getBoundingClientRect(); return r.left >= -0.5 && r.right <= document.documentElement.clientWidth + 0.5 && [...d.querySelectorAll('.way')].filter(e => e.offsetParent).every(e => e.getBoundingClientRect().height >= 56); }), `${w}px: Blatt passt, große Wege`);
    }
    await p.click('#addClose'); await closed(p, 'addDlg');

    ok(native.length === 0, 'keine nativen Dialoge');
    console.log('--- Fehlerfreiheit');
    ok(errors.length === 0, 'keine Skriptfehler ' + errors.join(' | '));
    ok((await p.evaluate(() => window.__csp)).length === 0, 'keine CSP-Verstöße');
    await ctx.close();
  }
} finally {
  await browser.close(); server.close();
}
console.log(result.fails ? result.fails + ' FEHLER' : 'ALLES OK');
process.exit(result.fails ? 1 : 0);
