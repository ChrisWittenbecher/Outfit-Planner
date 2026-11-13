import { devices } from 'playwright';
import { PNG, checker, closed, launch, persisted, startServer, storedItems } from './helpers.mjs';

// Seite „Auswertung“: Zeiträume, Kennzahlen, Rangliste, „Aussortieren?“ (Behalten, Verkaufstext, Löschen), Kalender, Backup.
const PORT = 8761, BASE = `http://localhost:${PORT}/index.html`;
const { ok, state: result } = checker();
const server = await startServer(PORT);
const browser = await launch();
const ready = p => p.waitForSelector('html[data-ready]', { state: 'attached' });
const wait = async (cond, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await cond()) return true; await new Promise(r => setTimeout(r, 50)); } return false; };

const pad = n => String(n).padStart(2, '0');
const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const offset = n => { const d = new Date(); return keyOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12)); };
const IMG = 'data:image/png;base64,' + PNG.toString('base64');
const it = (id, name, cat, color, extra = {}) => ({ id, name, cat, color, img: IMG, link: '', price: null, cur: 'EUR', tags: [], ...extra });

// Kennung eines Teils, das gerade erst angelegt wurde (wie newId in der App): zählt 30 Tage lang noch nicht als Schrankhüter
const FRESH = 'i' + Date.now().toString(36) + 'zzzzz';
const wear = (n, d, ...items) => ({ id: 'w' + n, d: offset(d), n: 'Tag ' + n, items });
const DATA = {
  items: [
    it('a1', 'Blaues Hemd', 'Oberteil', 'Blau', { price: 60 }),
    it('a2', 'Graue Hose', 'Hose/Rock', 'Grau', { price: 100 }),
    it('a3', 'Rote Jacke', 'Jacke', 'Rot'),
    it('a4', 'Weißer Schuh', 'Schuhe', 'Weiß', { price: 50 }),
    it('a5', 'Alter Schal', 'Accessoire', 'Grau'),
    it(FRESH, 'Neue Mütze', 'Accessoire', 'Schwarz'),
    it('a7', 'Lila Kleid', 'Oberteil', 'Lila', { status: 'wish' }),
    it('a8', 'Alte Hose', 'Hose/Rock', 'Braun', { price: 80 }),
  ],
  outfits: [{ id: 'o1', name: 'Büro', pieces: [{ id: 'a3', x: 10, y: 10, w: 100, r: 0 }] }],
  wears: [
    wear(1, -2, 'a1', 'a2'), wear(2, -5, 'a1'), wear(3, -9, 'a1'), wear(4, -10, 'a2'), wear(5, -20, 'a1'), wear(6, -30, 'a3'),
    wear(7, -120, 'a8'), wear(8, -150, 'a4'), wear(9, -200, 'a1'), wear(10, -400, 'a1'),
  ],
};
// 90 Tage: Hemd 4×, Hose 2×, Jacke 1× (6 Einträge). Jahr: 9 Einträge, Hemd 5×. Gesamt: 10 Einträge, Hemd 6×.
// Kosten pro Tragen (90 Tage): Hemd 60 € / 6 = 10 €, Hose 100 € / 2 = 50 €, zusammen 160 € / 8 = 20 €.
// Schrankhüter: Schuh (150 Tage), Alte Hose (120 Tage), Schal (nie getragen). Die neue Mütze und der Wunsch zählen nicht.

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

    const txt = async sel => (await p.textContent(sel)).replace(/\s+/g, ' ').trim();
    const goStats = async () => { await p.click('#tab-auswertung'); await p.waitForFunction(() => !document.getElementById('view-auswertung').hidden); };
    const goCloset = async () => { await p.click('#tab-schrank'); await p.waitForFunction(() => !document.getElementById('view-schrank').hidden); };
    const idle = () => p.locator('#idleList .idle b').allTextContents();
    const top = () => p.locator('#statTop .stat-name b').allTextContents();
    const active = () => p.evaluate(() => { const a = document.activeElement; return a ? (a.id || a.getAttribute('aria-label') || a.tagName) : ''; });
    const where = () => p.evaluate(() => { const r = document.getElementById('idleTitle').getBoundingClientRect(); return 'Überschrift y=' + Math.round(r.top) + '..' + Math.round(r.bottom) + ', Fenster ' + innerHeight + ', scrollY ' + Math.round(scrollY); });
    const period = async label => { await p.locator('#statPeriod button', { hasText: label }).click(); await wait(async () => await p.locator('#statPeriod button[aria-pressed="true"]').textContent() === label); };
    const importData = async data => {
      await p.setInputFiles('#impf', { name: 'bak.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
      await p.click('#uiOk'); await closed(p, 'uiDlg');
      await p.waitForFunction(n => document.querySelectorAll('#grid .card').length === n, data.items.length);
    };

    console.log('--- Leere Auswertung');
    await goStats();
    ok(await p.locator('#tab-auswertung').getAttribute('aria-selected') === 'true' && await p.evaluate(() => document.documentElement.dataset.view) === 'auswertung', 'Reiter „Auswertung“ ist gewählt');
    ok(await p.isVisible('#statEmpty') && /Noch nichts eingetragen/.test(await txt('#statEmpty')), 'ohne Einträge erklärt ein Hinweis, was zu tun ist');
    ok(await txt('#kWorn') === '0 von 0' && await txt('#kCost') === '–' && await txt('#kColor') === '–' && await p.isHidden('#kDot'), 'Kennzahlen sind leer, nicht 0 oder NaN');
    ok(await p.isHidden('#topTitle') && await p.locator('#statTop li').count() === 0, 'keine leere Rangliste');
    ok(/Sobald du Teile angelegt hast/.test(await txt('#idleSub')) && await p.locator('#idleList li').count() === 0, 'ohne Teile nichts zum Aussortieren');
    ok(await p.isVisible('#idleTitle') && await p.isVisible('#statCal'), '„Aussortieren?“ und Kalender-Knopf sind auch am Handy sichtbar');

    console.log('--- Daten laden');
    await goCloset();
    await importData(DATA);
    ok(await persisted(p, DATA.items.length, DATA.wears.length), 'Daten gespeichert');
    await goStats();

    console.log('--- 90 Tage');
    ok(await p.locator('#statPeriod button[aria-pressed="true"]').textContent() === '90 Tage', 'Standard sind 90 Tage');
    ok(await txt('#statSub') === 'Die letzten 90 Tage · 6 eingetragene Outfits', 'Untertitel: ' + await txt('#statSub'));
    ok(await p.isHidden('#statEmpty'), 'kein Leer-Hinweis');
    ok(await txt('#kWorn') === '3 von 7', 'getragene Teile: ' + await txt('#kWorn') + ' (Wunsch und Neues zählen als Teile, der Wunsch nicht)');
    ok(/^20,00\s€$/.test(await txt('#kCost')) && /2 Teilen mit Preis/.test(await txt('#kCostNote')), 'Kosten pro Tragen: ' + await txt('#kCost') + ' | ' + await txt('#kCostNote'));
    ok(await txt('#kColor') === 'Blau' && await p.isVisible('#kDot'), 'meistgetragene Farbe: Blau');
    ok(JSON.stringify(await top()) === JSON.stringify(['Blaues Hemd', 'Graue Hose', 'Rote Jacke']), 'Rangliste: ' + (await top()).join(', '));
    const rows = await p.locator('#statTop li').evaluateAll(lis => lis.map(li => ({ n: li.querySelector('.stat-n').textContent, aria: li.querySelector('.stat-n').getAttribute('aria-label'), w: li.querySelector('.stat-bar i').style.width, sub: li.querySelector('.stat-name small').textContent })));
    ok(rows.map(r => r.n).join() === '4×,2×,1×' && rows[0].aria === '4 Tage getragen' && rows[2].aria === '1 Tag getragen', 'Anzahl je Teil, für Screenreader ausgeschrieben: ' + JSON.stringify(rows.map(r => r.aria)));
    ok(rows.map(r => r.w).join() === '100%,50%,25%', 'Balken im Verhältnis: ' + rows.map(r => r.w).join());
    ok(/10,00\s€ pro Tragen/.test(rows[0].sub) && /50,00\s€ pro Tragen/.test(rows[1].sub) && /ohne Preis/.test(rows[2].sub), 'Kosten pro Tragen je Teil, ohne Preis ehrlich benannt');
    ok(await p.locator('#statTop .stat-bar[aria-hidden="true"]').count() === 3, 'Balken sind für Screenreader verborgen (die Zahl steht daneben)');

    console.log('--- Aussortieren?');
    ok(JSON.stringify(await idle()) === JSON.stringify(['Weißer Schuh', 'Alte Hose', 'Alter Schal']), 'längste Pause zuerst, nie getragen zuletzt: ' + (await idle()).join(', '));
    ok(!(await idle()).some(n => /Mütze|Kleid/.test(n)), 'neues Teil (Schonfrist) und Wunsch tauchen nicht auf');
    const notes = await p.locator('#idleList .idle small').allTextContents();
    ok(/Zuletzt vor 5 Monaten getragen/.test(notes[0]) && /Zuletzt vor 4 Monaten getragen/.test(notes[1]) && notes[2] === 'Noch nie getragen', 'Hinweise zur Pause: ' + notes.join(' | '));
    ok(/seit 90 Tagen nicht getragen/.test(await txt('#idleSub')), 'Untertitel nennt die Frist');
    const btn = await p.locator('#idleList .idle button').evaluateAll(bs => bs.map(b => ({ l: b.getAttribute('aria-label'), h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width) })));
    ok(btn.length === 6 && btn.every(b => b.l && b.h >= 40 && b.w >= 60), 'Knöpfe haben sprechende Namen und gute Größe: ' + JSON.stringify(btn.slice(0, 2)));

    console.log('--- Zeitraum Jahr und Gesamt');
    await period('Jahr');
    ok(await txt('#statSub') === 'Das letzte Jahr · 9 eingetragene Outfits' && await txt('#kWorn') === '5 von 7', 'Jahr: ' + await txt('#statSub') + ' | ' + await txt('#kWorn'));
    ok(JSON.stringify(await top()) === JSON.stringify(['Blaues Hemd', 'Graue Hose', 'Rote Jacke', 'Alte Hose', 'Weißer Schuh']) && (await p.locator('#statTop .stat-n').first().textContent()) === '5×', 'Jahr: Rangliste mit fünf Einträgen, Gleichstand nach letztem Tragen: ' + (await top()).join(', '));
    ok(await wait(async () => /Jahr/.test(await txt('#statLive'))), 'Wechsel wird angesagt: ' + await txt('#statLive'));
    await period('Gesamt');
    ok(await txt('#statSub') === 'Alles, was eingetragen ist · 10 eingetragene Outfits' && (await p.locator('#statTop .stat-n').first().textContent()) === '6×', 'Gesamt: ' + await txt('#statSub'));
    ok(JSON.stringify(await idle()) === JSON.stringify(['Weißer Schuh', 'Alte Hose', 'Alter Schal']), 'die Schrankhüter hängen nicht vom Zeitraum ab');
    await period('90 Tage');
    ok(await txt('#kWorn') === '3 von 7', 'zurück auf 90 Tage');

    console.log('--- Behalten');
    await p.locator('#idleList').getByRole('button', { name: 'Behalten: Alter Schal' }).click();
    ok(!(await idle()).includes('Alter Schal') && (await idle()).length === 2, 'Teil verschwindet aus der Liste');
    ok(/„Alter Schal“ bleibt/.test(await txt('#toasts')) && await p.isVisible('#toasts button'), 'Hinweis mit „Rückgängig“: ' + await txt('#toasts'));
    ok(await wait(async () => await active() === 'idleTitle'), 'Fokus bleibt in der Liste (Überschrift): ' + await active() + ' | ' + await where());
    ok(await wait(async () => (await storedItems(p)).find(i => i.id === 'a5')?.keep === offset(0)), 'Behalten ist gespeichert');
    await p.click('#toasts button');
    ok(await wait(async () => (await idle()).includes('Alter Schal')), 'Rückgängig bringt das Teil zurück');
    ok(await wait(async () => (await storedItems(p)).find(i => i.id === 'a5')?.keep === undefined), 'und nimmt das Behalten zurück');
    await p.locator('#idleList').getByRole('button', { name: 'Behalten: Alter Schal' }).click();
    ok(await wait(async () => (await storedItems(p)).find(i => i.id === 'a5')?.keep === offset(0)), 'erneut behalten, gespeichert');
    await p.reload(); await ready(p);
    ok(await p.isVisible('#view-auswertung') && !(await idle()).includes('Alter Schal'), 'nach dem Neuladen bleibt das Teil verborgen (Seite bleibt über die Adresse erhalten)');
    ok(await p.evaluate(() => location.hash) === '#auswertung', 'Adresse: #auswertung');

    console.log('--- Aussortieren: Abbrechen');
    const hose = () => p.locator('#idleList').getByRole('button', { name: 'Aussortieren: Alte Hose' });
    await hose().click();
    await p.waitForFunction(() => document.getElementById('sortDlg').open);
    ok(await txt('#sortTitle') === 'Alte Hose' && /Zuletzt vor 4 Monaten getragen\. Was soll damit passieren\?/.test(await txt('#sortInfo')), 'Dialog nennt Teil und Pause: ' + await txt('#sortInfo'));
    ok(await p.locator('#sortDlg button').allTextContents().then(a => a.join('|')) === 'Verkaufstext erstellen|Löschen|Abbrechen', 'drei Wege: Verkaufstext, Löschen, Abbrechen');
    await p.click('#sortClose');
    ok(await closed(p, 'sortDlg') && (await idle()).includes('Alte Hose'), 'Abbrechen ändert nichts');
    ok(await wait(async () => await active() === 'Aussortieren: Alte Hose'), 'Fokus kehrt zum Knopf zurück: ' + await active());
    await hose().click();
    await p.waitForFunction(() => document.getElementById('sortDlg').open);
    await p.keyboard.press('Escape');
    ok(await closed(p, 'sortDlg') && (await idle()).includes('Alte Hose'), 'Esc schließt ohne Folgen');

    console.log('--- Aussortieren: Verkaufstext');
    await wait(async () => await active() === 'Aussortieren: Alte Hose');
    await hose().click();
    await p.waitForFunction(() => document.getElementById('sortDlg').open);
    await p.click('#sortSell');
    await p.waitForFunction(() => document.getElementById('saleDlg').open);
    ok(await closed(p, 'sortDlg') && await txt('#saleFor') === 'Alte Hose', 'Verkaufstext öffnet sich für das gewählte Teil');
    ok(/^Alte Hose\n/.test(await p.inputValue('#saleText')) && /Preis: 36,00\s€ VB/.test(await p.inputValue('#saleText')), 'Entwurf: Titel und Preis (45 % von 80 €)');
    await p.click('#saleClose');
    ok(await closed(p, 'saleDlg') && (await idle()).includes('Alte Hose'), 'Schließen führt zurück, das Teil bleibt');
    ok(await wait(async () => await active() === 'Aussortieren: Alte Hose'), 'Fokus kehrt zum Knopf zurück: ' + await active());

    console.log('--- Aussortieren: Löschen');
    await period('Jahr');
    ok(await txt('#statSub') === 'Das letzte Jahr · 9 eingetragene Outfits', 'vorher: 9 Einträge im Jahr');
    await hose().click();
    await p.waitForFunction(() => document.getElementById('sortDlg').open);
    await p.click('#sortDelete');
    ok(await closed(p, 'sortDlg'), 'Dialog schließt');
    ok(await wait(async () => !(await idle()).includes('Alte Hose')), 'Teil verschwindet aus der Liste: ' + (await idle()).join(', '));
    ok(await p.locator('#grid .card').count() === 7, 'und aus dem Schrank (7 von 8 Karten)');
    ok(await txt('#statSub') === 'Das letzte Jahr · 8 eingetragene Outfits', 'sein einziger Eintrag ist weg: ' + await txt('#statSub'));
    ok(/gelöscht/.test(await txt('#toasts')) && await p.isVisible('#toasts button'), 'Hinweis mit „Rückgängig“: ' + await txt('#toasts'));
    ok(await wait(async () => await active() === 'idleTitle'), 'Fokus liegt in der Liste (Überschrift): ' + await active() + ' | ' + await where());
    await p.click('#toasts button');
    ok(await wait(async () => (await idle()).includes('Alte Hose')) && await p.locator('#grid .card').count() === 8, 'Rückgängig bringt Teil und Karte zurück');
    ok(await wait(async () => await txt('#statSub') === 'Das letzte Jahr · 9 eingetragene Outfits'), 'samt Eintrag: ' + await txt('#statSub'));
    await period('90 Tage');

    console.log('--- Heute getragen verändert die Zahlen');
    await goCloset();
    await p.locator('#outs .out button', { hasText: 'Heute getragen' }).first().click();
    ok(/für heute eingetragen/.test(await txt('#toasts')), 'Outfit „Büro“ eingetragen');
    await goStats();
    ok(await txt('#statSub') === 'Die letzten 90 Tage · 7 eingetragene Outfits', 'Seite zählt neu beim Öffnen: ' + await txt('#statSub'));
    ok(JSON.stringify(await top()) === JSON.stringify(['Blaues Hemd', 'Rote Jacke', 'Graue Hose']) && (await p.locator('#statTop .stat-n').allTextContents()).join() === '4×,2×,2×', 'Jacke jetzt 2×, bei Gleichstand vorn, weil sie zuletzt getragen wurde: ' + (await top()).join(', '));

    console.log('--- Kalender');
    await p.click('#statCal');
    await p.waitForFunction(() => document.getElementById('calDlg').open);
    ok(await p.isVisible('#calGrid') && await txt('#calTitle') === 'Kalender', 'Kalender öffnet sich über die Seite');
    await p.keyboard.press('Escape');
    ok(await closed(p, 'calDlg'), 'Esc schließt den Kalender');
    ok(await wait(async () => await active() === 'statCal'), 'Fokus kehrt zum Knopf zurück: ' + await active());
    ok(await p.isVisible('#view-auswertung'), 'Seite bleibt Auswertung');

    console.log('--- Layout');
    const lay = await p.evaluate(() => {
      const r = id => document.getElementById(id).getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth - innerWidth, vw: innerWidth, stat: r('statTitle'), idle: r('idleTitle'), tiles: [...document.querySelectorAll('.stat-tile')].map(t => Math.round(t.getBoundingClientRect().width)) };
    });
    ok(lay.overflow <= 0, 'kein seitliches Scrollen (' + lay.overflow + ')');
    if (mobile) ok(lay.idle.top > lay.stat.top && lay.idle.left < 60, 'Handy: „Aussortieren?“ steht unter der Auswertung');
    else ok(lay.idle.left > lay.stat.left + 400, 'Desktop: „Aussortieren?“ steht daneben (' + Math.round(lay.idle.left) + ' / ' + Math.round(lay.stat.left) + ')');

    console.log('--- Backup nimmt „Behalten“ mit');
    const items = await storedItems(p);
    ok(items.find(i => i.id === 'a5')?.keep === offset(0), '„keep“ steht im Bestand');
    await goCloset();
    await importData({ items, outfits: DATA.outfits, wears: DATA.wears });
    await goStats();
    ok(!(await idle()).includes('Alter Schal') && (await idle()).length === 2, 'nach dem Einspielen ruht der Schal weiter: ' + (await idle()).join(', '));
    // ein Backup mit Unsinn im Feld „keep“ darf nichts kaputt machen
    await goCloset();
    await importData({ items: items.map(i => (i.id === 'a5' ? { ...i, keep: '<img src=x onerror=alert(1)>' } : i)), outfits: DATA.outfits, wears: DATA.wears });
    await goStats();
    ok((await idle()).includes('Alter Schal') && (await storedItems(p)).find(i => i.id === 'a5')?.keep === undefined, 'ungültiges „keep“ wird verworfen, der Schal erscheint wieder');
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
