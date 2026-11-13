import { devices } from 'playwright';
import { PNG, checker, closed, engine, launch, persisted, startServer } from './helpers.mjs';

// Reiter, Verlauf (Zurück-Taste), Adresse, Tastatur und die Karten auf der Seite „Vorschläge“.
const PORT = 8751, BASE = `http://localhost:${PORT}/index.html`;
const { ok, state: result } = checker();
const server = await startServer(PORT);
const browser = await launch();
const ready = p => p.waitForSelector('html[data-ready]', { state: 'attached' });
const wait = async (cond, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await cond()) return true; await new Promise(r => setTimeout(r, 50)); } return false; };
const IMG = 'data:image/png;base64,' + PNG.toString('base64');
const it = (id, name, cat, color, extra = {}) => ({ id, name, cat, color, img: IMG, link: '', price: 40, cur: 'EUR', tags: [], ...extra });
const BACKUP = JSON.stringify({
  items: [
    it('t1', 'Weißes Shirt', 'Oberteil', 'Weiß'), it('t2', 'Schwarzes Shirt', 'Oberteil', 'Schwarz'), it('t3', 'Rote Bluse', 'Oberteil', 'Rot'), it('t4', 'Wollpulli', 'Oberteil', 'Grau', { tags: ['Winter'] }),
    it('h1', 'Jeans', 'Hose/Rock', 'Blau'), it('h2', 'Schwarze Hose', 'Hose/Rock', 'Schwarz'), it('h3', 'Graue Hose', 'Hose/Rock', 'Grau'),
    it('j1', 'Wintermantel', 'Jacke', 'Schwarz', { tags: ['Winter'] }), it('j2', 'Regenjacke', 'Jacke', 'Gelb', { tags: ['wasserdicht'] }),
    it('s1', 'Sneaker', 'Schuhe', 'Weiß'), it('s2', 'Stiefel', 'Schuhe', 'Braun'), it('s3', 'Schwarze Schuhe', 'Schuhe', 'Schwarz'),
  ],
  outfits: [], wears: [],
});

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
    if (mobile) await p.addInitScript(() => { Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true }); });   // wie iPhone: Haptik über den unsichtbaren Schalter
    await p.goto(BASE); await ready(p);

    const view = () => p.evaluate(() => document.documentElement.dataset.view);
    const hash = () => p.evaluate(() => location.hash);
    const panels = () => p.evaluate(() => ({ s: !document.getElementById('view-schrank').hidden, v: !document.getElementById('view-vorschlaege').hidden }));
    const sel = () => p.evaluate(() => [...document.querySelectorAll('#tabs [role=tab]')].map(t => t.getAttribute('aria-selected') + ':' + t.tabIndex));
    const shown = async () => { await p.waitForFunction(() => !document.getElementById('view-vorschlaege').hidden); };

    console.log('--- Start im Schrank');
    ok(await view() === 'schrank' && await hash() === '', 'Start ohne Adresse im Schrank');
    ok(JSON.stringify(await panels()) === JSON.stringify({ s: true, v: false }), 'nur der Schrank ist sichtbar');
    ok(JSON.stringify(await sel()) === JSON.stringify(['true:0', 'false:-1', 'false:-1']), 'Reiter: Schrank gewählt, nur er ist per Tab erreichbar');
    ok(await p.title() === 'Outfit-Planner', 'Seitentitel: Outfit-Planner');
    const roles = await p.evaluate(() => {
      const tabs = [...document.querySelectorAll('#tabs [role=tab]')];
      return { list: document.getElementById('tabs').getAttribute('role'), label: !!document.getElementById('tabs').getAttribute('aria-label'),
        wired: tabs.every(t => { const pn = document.getElementById(t.getAttribute('aria-controls')); return pn && pn.getAttribute('role') === 'tabpanel' && pn.getAttribute('aria-labelledby') === t.id; }) };
    });
    ok(roles.list === 'tablist' && roles.label && roles.wired, 'Rollen: tablist, Reiter und Seiten gehören zusammen');

    await p.setInputFiles('#impf', { name: 'bak.json', mimeType: 'application/json', buffer: Buffer.from(BACKUP) });
    await p.click('#uiOk'); await closed(p, 'uiDlg');
    await p.waitForFunction(() => document.querySelectorAll('#grid .card').length === 12);
    ok(await persisted(p, 12), 'Beispielschrank gespeichert');

    console.log('--- Reiter wechseln');
    await p.click('#tab-vorschlaege'); await shown();
    ok(await view() === 'vorschlaege' && await hash() === '#vorschlaege', 'Klick: Bereich und Adresse (#vorschlaege)');
    ok(JSON.stringify(await panels()) === JSON.stringify({ s: false, v: true }), 'nur die Vorschläge sind sichtbar');
    ok(JSON.stringify(await sel()) === JSON.stringify(['false:-1', 'true:0', 'false:-1']), 'Reiter: Vorschläge gewählt');
    ok(await p.title() === 'Vorschläge – Outfit-Planner', 'Seitentitel passt zum Bereich');
    ok(await p.locator('#sugCards .sug').count() === 3, 'drei Vorschlagskarten');
    ok(await p.locator('#sugCards .sug--first').count() === 1, 'die erste Karte ist hervorgehoben');
    ok(/^\w+, \d+\. \w+ · Vorschläge nur aus deinem Schrank$/.test((await p.textContent('#sugDate')).trim()), 'Datum: ' + (await p.textContent('#sugDate')).trim());
    const titles = await p.locator('#sugCards .sug-title').allTextContents();
    ok(new Set(titles).size === 3, 'drei verschiedene Titel: ' + titles.join(' | '));
    const card = p.locator('#sugCards .sug').first();
    ok(await card.locator('.sug-strip img').count() >= 3 && await card.locator('.sug-why li').count() >= 1, 'Karte zeigt Bilder und Gründe');
    ok((await card.locator('.sug-try').getAttribute('aria-label')).startsWith('Anprobieren: '), 'Knopf „Anprobieren“ hat einen sprechenden Namen');
    ok((await card.locator('.sug-save').getAttribute('aria-label')).startsWith('Als Outfit speichern: '), 'Knopf „Speichern“ hat einen sprechenden Namen');
    const sizes = await p.evaluate(() => [...document.querySelectorAll('#sugCards .sug button')].map(b => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); }));
    ok(sizes.every(s => s >= 40), 'Knöpfe der Karte sind groß genug (' + sizes.map(Math.round) + ')');
    // Auf anderen Rechnern ist die Schrift breiter (CI-Läufer): die Knöpfe dürfen dann nicht schrumpfen
    await p.evaluate(() => { const s = new CSSStyleSheet(); s.replaceSync('* { font-family: monospace !important; letter-spacing: .06em !important; }'); document.adoptedStyleSheets = [s]; });
    const wideSizes = await p.evaluate(() => [...document.querySelectorAll('#sugCards .sug button')].map(b => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); }));
    const spill = await p.evaluate(() => [...document.querySelectorAll('#sugCards .sug, #sugCards .sug *')].filter(e => e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0).map(e => e.tagName.toLowerCase() + '.' + e.className + ' ' + e.scrollWidth + '>' + e.clientWidth));
    ok(wideSizes.every(s => s >= 40) && spill.length === 0, 'Knöpfe bleiben auch bei sehr breiter Schrift groß und im Rahmen (' + wideSizes.map(Math.round) + '; übergelaufen: ' + (spill.join(', ') || 'nichts') + ')');
    await p.evaluate(() => { document.adoptedStyleSheets = []; });

    console.log('--- Zurück und vor');
    await p.goBack();
    ok(await wait(async () => await view() === 'schrank'), 'Zurück führt zum Schrank');
    ok(await hash() === '' && (await panels()).s, 'Adresse leer, Schrank sichtbar');
    await p.goForward();
    ok(await wait(async () => await view() === 'vorschlaege'), 'Vor führt wieder zu den Vorschlägen');

    console.log('--- Tastatur');
    await p.focus('#tab-vorschlaege');
    await p.keyboard.press('ArrowLeft');
    ok(await wait(async () => await view() === 'schrank') && await p.evaluate(() => document.activeElement.id) === 'tab-schrank', 'Pfeil links: Schrank, Fokus folgt');
    await p.keyboard.press('ArrowLeft');
    ok(await wait(async () => await view() === 'auswertung'), 'Pfeil links vom ersten Reiter springt zum letzten');
    await p.keyboard.press('ArrowLeft');
    ok(await wait(async () => await view() === 'vorschlaege'), 'Pfeil links: Vorschläge');
    await p.keyboard.press('Home');
    ok(await wait(async () => await view() === 'schrank'), 'Pos1: erster Reiter');
    await p.keyboard.press('End');
    ok(await wait(async () => await view() === 'auswertung') && await p.evaluate(() => document.activeElement.id) === 'tab-auswertung', 'Ende: letzter Reiter');
    await p.keyboard.press('ArrowRight');
    ok(await wait(async () => await view() === 'schrank'), 'Pfeil rechts vom letzten Reiter springt zum ersten');
    await p.keyboard.press('x');
    ok(await view() === 'schrank', 'andere Tasten ändern nichts');

    console.log('--- Adresse');
    await p.goto(BASE + '#vorschlaege'); await ready(p);
    ok(await view() === 'vorschlaege' && (await panels()).v, 'Adresse #vorschlaege öffnet die Vorschläge direkt');
    ok(await wait(async () => await p.locator('#sugCards .sug').count() === 3), 'Karten erscheinen auch beim direkten Start');
    await p.goto(BASE + '#gibtesnicht'); await ready(p);
    ok(await view() === 'schrank', 'unbekannte Adresse führt zum Schrank');
    await p.goto(BASE + '#__proto__'); await ready(p);
    ok(await view() === 'schrank' && (await panels()).s, '„#__proto__“ führt zum Schrank');
    await p.goto(BASE + '#vorschlaege'); await ready(p);
    await p.evaluate(() => { location.hash = '#schrank'; });
    ok(await wait(async () => await view() === 'schrank'), 'Adresse von Hand geändert: Bereich folgt');

    console.log('--- Board nach Reiterwechsel');
    {
      const boardW = () => p.evaluate(() => Math.round(document.getElementById('board').getBoundingClientRect().width));
      const same = async (w, label) => ok(await wait(async () => Math.abs(await boardW() - w) <= 1), `${label} (${await boardW()} statt ${w} px)`);
      const w0 = await boardW(), vp = p.viewportSize();
      ok(w0 > 150, 'Board hat eine sinnvolle Breite: ' + w0 + ' px');
      await p.click('#tab-auswertung'); await p.waitForFunction(() => !document.getElementById('view-auswertung').hidden);
      await p.setViewportSize({ width: vp.width + 40, height: vp.height + 200 }); await p.waitForTimeout(300);   // Handy drehen oder Fenster ziehen, während der Schrank verborgen ist
      await p.setViewportSize(vp); await p.waitForTimeout(300);
      await p.click('#tab-schrank'); await p.waitForFunction(() => !document.getElementById('view-schrank').hidden);
      await same(w0, 'Fenster geändert, während der Schrank verborgen war: Board hat danach wieder seine Größe');
      await p.goto(BASE + '#auswertung'); await ready(p);
      await p.click('#tab-schrank'); await p.waitForFunction(() => !document.getElementById('view-schrank').hidden);
      await same(w0, 'Start in der Auswertung, dann Schrank: Board hat seine Größe');
      ok(await p.evaluate(() => !/-/.test(document.getElementById('board').style.transform)), 'der Maßstab ist nie negativ');
    }

    console.log('--- Dialog und Verlauf');
    await p.click('#tab-vorschlaege'); await shown();
    await p.locator('#sugCards .sug').first().locator('.sug-save').click();
    await p.waitForFunction(() => document.getElementById('uiDlg').open);
    await p.goBack();
    ok(await closed(p, 'uiDlg'), 'Zurück schließt zuerst den Dialog');
    ok(await view() === 'vorschlaege', '… und lässt den Bereich stehen');
    await p.locator('#sugCards .sug').first().locator('.sug-save').click();
    await p.waitForFunction(() => document.getElementById('uiDlg').open);
    await p.click('#uiCancel'); await closed(p, 'uiDlg'); await p.waitForTimeout(400);   // der Dialog nimmt seinen Verlaufseintrag kurz nach dem Schließen zurück
    ok(await p.locator('#outs .out').count() === 0, 'Abbrechen speichert nichts');
    await p.goBack();
    ok(await wait(async () => await view() === 'schrank'), 'nach geschlossenem Dialog führt Zurück zum Schrank (kein Verlauf bleibt hängen)');

    console.log('--- Speichern direkt von der Karte');
    await p.click('#tab-vorschlaege'); await shown();
    const t0 = (await p.locator('#sugCards .sug-title').first().textContent()).trim();
    const piecesN = await p.locator('#sugCards .sug').first().locator('.sug-strip img').count();
    await p.locator('#sugCards .sug').first().locator('.sug-save').click();
    await p.waitForFunction(() => document.getElementById('uiDlg').open);
    ok(await p.inputValue('#uiInput') === t0, 'Namensvorschlag ist der Kartentitel (' + t0 + ')');
    await p.fill('#uiInput', 'Mein Vorschlag'); await p.click('#uiOk'); await closed(p, 'uiDlg');
    ok(await wait(async () => (await p.evaluate(() => document.querySelectorAll('#outs .out').length)) === 1), 'Outfit ist unter „Gespeichert“ angelegt');
    ok((await p.locator('#outs .out b').first().textContent()) === 'Mein Vorschlag', 'mit dem gewählten Namen');
    ok(await p.locator('#outs .out .mini img').count() === piecesN, `mit allen ${piecesN} Teilen`);
    const geo = await p.evaluate(() => [...document.querySelectorAll('#outs .out .mini img')].map(i => ({ w: parseFloat(i.style.width), l: parseFloat(i.style.left), t: parseFloat(i.style.top) })));
    ok(geo.every(g => g.w > 20 && g.l >= -5 && g.t >= -5), 'Teile sind sinnvoll angeordnet (' + JSON.stringify(geo[0]) + ')');
    await p.click('#tab-schrank');
    ok(await p.locator('#board img.p').count() === 0, 'das Board bleibt unberührt');
    ok(await persisted(p, 12), 'Schrank unverändert');
    await p.click('#undo');
    ok(await wait(async () => (await p.locator('#outs .out').count()) === 0), '„Rückgängig“ nimmt das Outfit wieder weg');

    console.log('--- Anprobieren und Verlauf');
    await p.click('#tab-vorschlaege'); await shown();
    await p.locator('#sugCards .sug').first().locator('.sug-try').click();
    ok(await wait(async () => await view() === 'schrank'), 'wechselt zum Schrank');
    ok(await wait(async () => await p.locator('#board img.p').count() === piecesN), 'Board zeigt die Teile');
    const focusOn = () => p.evaluate(() => { const a = document.activeElement; return a ? (a.id || a.tagName) : 'nichts'; });
    ok(await wait(async () => await focusOn() === 'outfitTitle'), 'Fokus steht auf der Überschrift des Boards (aktiv: ' + await focusOn() + ')');
    await p.goBack();
    ok(await wait(async () => await view() === 'vorschlaege'), 'Zurück führt wieder zu den Vorschlägen');

    console.log('--- Neue Vorschläge');
    const ids = () => p.locator('#sugCards .sug-try').evaluateAll(bs => bs.map(b => b.getAttribute('aria-label')).join('|'));
    const before = await ids(); let different = false;
    for (let k = 0; k < 4 && !different; k++) { await p.click('#sugMore'); different = (await ids()) !== before; }
    ok(different, '„Neue Vorschläge“ ändert die Auswahl');
    ok(await p.locator('#sugCards .sug').count() === 3, 'weiterhin drei Karten');
    const stable = await ids(); await p.click('#tab-schrank'); await p.click('#tab-vorschlaege'); await shown();
    ok(await ids() === stable, 'beim Zurückkehren bleiben die Vorschläge gleich');

    console.log('--- Reiter am Handy und am PC');
    if (mobile) {
      const m = await p.evaluate(() => {
        const bar = document.getElementById('tabs').getBoundingClientRect(), vh = innerHeight;
        const tabs = [...document.querySelectorAll('#tabs .tab')].map(t => { const r = t.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), icon: getComputedStyle(t.querySelector('svg')).display }; });
        return { bottom: Math.round(bar.bottom), vh, top: Math.round(bar.top), tabs, scrollX: document.documentElement.scrollWidth > innerWidth, fab: getComputedStyle(document.getElementById('fab')).display };
      });
      ok(m.bottom === m.vh && m.top < m.vh - 50, 'Leiste klebt unten (' + m.top + '–' + m.bottom + ' von ' + m.vh + ')');
      ok(m.tabs.every(t => t.h >= 44 && t.w >= 100 && t.icon === 'block'), 'Reiter groß mit Symbol (' + JSON.stringify(m.tabs) + ')');
      ok(!m.scrollX, 'kein seitliches Scrollen');
      ok(m.fab === 'none', 'auf den Vorschlägen gibt es keinen „+“-Knopf');
      await p.click('#tab-schrank');
      const f = await p.evaluate(() => { const fab = document.getElementById('fab').getBoundingClientRect(), bar = document.getElementById('tabs').getBoundingClientRect(); return { disp: getComputedStyle(document.getElementById('fab')).display, gap: Math.round(bar.top - fab.bottom) }; });
      ok(f.disp !== 'none' && f.gap >= 8, '„+“-Knopf im Schrank sichtbar und über der Leiste (Abstand ' + f.gap + ' px)');
      await p.click('#more');
      ok(await p.locator('#mIdea').count() === 0, 'Menü „Mehr“ hat keinen Eintrag „Ideen“ mehr');
      await p.click('#mClose'); await closed(p, 'moreDlg');
    } else {
      const d = await p.evaluate(() => { const t = document.getElementById('tabs').getBoundingClientRect(); return { pos: getComputedStyle(document.getElementById('tabs')).position, top: Math.round(t.top), icon: getComputedStyle(document.querySelector('#tabs svg')).display }; });
      ok(d.pos !== 'fixed' && d.top < 120 && d.icon === 'none', 'am PC: Pillen in der Kopfzeile ohne Symbole (' + JSON.stringify(d) + ')');
      ok(await p.locator('#ideaBtn').count() === 0, 'Knopf „Ideen“ am Gespeichert-Bereich ist entfernt');
    }

    console.log('--- Fehlerfreiheit');
    ok(errors.length === 0, 'keine Skriptfehler ' + errors.join(' | '));
    ok((await p.evaluate(() => window.__csp)).length === 0, 'keine CSP-Verstöße');
    ok(native.length === 0, 'keine nativen Dialoge');
    await ctx.close();
  }
} finally {
  await browser.close(); server.close();
}
process.exit(result.fails ? 1 : 0);
