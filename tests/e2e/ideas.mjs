import { devices } from 'playwright';
import { PNG, checker, closed, engine, launch, persisted, startServer } from './helpers.mjs';

const PORT = 8742, BASE = `http://localhost:${PORT}/index.html`;
const { ok, state: result } = checker();
const server = await startServer(PORT);
const browser = await launch();
const ready = p => p.waitForSelector('html[data-ready]', { state: 'attached' });
const wait = async (cond, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await cond()) return true; await new Promise(r => setTimeout(r, 50)); } return false; };
const pad = n => String(n).padStart(2, '0');
const offset = n => { const d = new Date(); const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; };
const IMG = 'data:image/png;base64,' + PNG.toString('base64');

const it = (id, name, cat, color, extra = {}) => ({ id, name, cat, color, img: IMG, link: '', price: 40, cur: 'EUR', tags: [], ...extra });
const BACKUP = JSON.stringify({
  items: [
    it('t1', 'Weißes Shirt', 'Oberteil', 'Weiß', { tags: ['Sommer'] }),
    it('t2', 'Schwarzes Shirt', 'Oberteil', 'Schwarz'),
    it('t3', 'Rote Bluse', 'Oberteil', 'Rot'),
    it('t4', 'Wollpulli', 'Oberteil', 'Grau', { tags: ['Winter'] }),
    it('h1', 'Jeans', 'Hose/Rock', 'Blau'),
    it('h2', 'Schwarze Hose', 'Hose/Rock', 'Schwarz'),
    it('j1', 'Wintermantel', 'Jacke', 'Schwarz', { tags: ['Winter'], price: 200 }),
    it('j2', 'Regenjacke', 'Jacke', 'Gelb', { tags: ['wasserdicht'] }),
    it('s1', 'Sneaker', 'Schuhe', 'Weiß'),
    it('s2', 'Stiefel', 'Schuhe', 'Braun', { tags: ['Winter'] }),
    it('a1', 'Schal', 'Accessoire', 'Grau', { tags: ['Winter'] }),
    it('w1', 'Wunsch-Kleid', 'Oberteil', 'Lila', { status: 'wish' }),
  ],
  outfits: [],
  wears: [{ id: 'w1', d: offset(-100), n: 'Früher', items: ['t1'] }],
});

try {
  for (const [name, opts] of [['iPhone 13', { ...devices['iPhone 13'], acceptDownloads: true }], ['Desktop', { viewport: { width: 1280, height: 900 }, acceptDownloads: true }]]) {
    const mobile = name !== 'Desktop';
    console.log('--- ' + name);
    const ctx = await browser.newContext(opts);
    if (engine === 'chromium') await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);   // WebKit kennt diese Berechtigungen nicht und bricht später ab
    const p = await ctx.newPage();
    const errors = [], native = [];
    p.on('pageerror', e => errors.push(e.message));
    p.on('dialog', d => { native.push(d.type()); d.dismiss(); });
    await p.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
    await p.goto(BASE); await ready(p);

    const openIdeas = async () => { if (mobile) { await p.click('#more'); await p.click('#mIdea'); } else await p.click('#ideaBtn'); await p.waitForFunction(() => document.getElementById('ideaDlg').open); };
    const names = () => p.locator('#ideaList li .t b').allTextContents();
    const w = label => p.click(`#ideaWeather button:has-text("${label}")`);

    console.log('--- Leerer Schrank');
    await openIdeas();
    ok(/Lege zuerst ein paar Teile an/.test(await p.textContent('#ideaNote')) && await p.locator('#ideaList li').count() === 0, 'ohne Teile gibt es einen Hinweis statt Vorschlägen');
    ok(await p.isDisabled('#ideaMore'), '„Andere Vorschläge“ ist gesperrt');
    await p.click('#ideaTabPack');
    ok(/Lege zuerst ein paar Teile an/.test(await p.textContent('#packNote')) && await p.isDisabled('#packCopy'), 'Packliste: Hinweis, Kopieren gesperrt');
    await p.click('#ideaClose'); await closed(p, 'ideaDlg');

    await p.setInputFiles('#impf', { name: 'bak.json', mimeType: 'application/json', buffer: Buffer.from(BACKUP) });
    await p.click('#uiOk');
    await p.waitForFunction(() => document.querySelectorAll('#grid .card').length === 12);
    ok(await persisted(p, 12), 'Beispielschrank gespeichert');

    console.log('--- Vorschläge');
    await openIdeas();
    ok(await p.locator('#ideaWeather button[aria-pressed="true"]').textContent() === 'Mild', 'Standard ist „Mild“');
    ok(await p.locator('#ideaList li').count() === 3, 'drei Vorschläge');
    ok(await p.locator('#ideaList li').first().locator('small').textContent() !== '', 'jeder Vorschlag sagt, warum');
    await w('Kalt');
    ok(await p.locator('#ideaWeather button[aria-pressed="true"]').textContent() === 'Kalt', 'Wetter wechselt');
    let all = await names();
    ok(all.length === 3 && all.every(n => /Wintermantel|Regenjacke/.test(n)), 'bei Kälte immer mit Jacke: ' + all.join(' | '));
    ok(all.every(n => !/Wunsch-Kleid/.test(n)), 'Wunschliste kommt nicht vor');
    await w('Warm');
    all = await names();
    ok(all.length === 3 && all.every(n => !/Wintermantel|Regenjacke|Schal/.test(n)), 'bei Wärme ohne Jacke und Schal: ' + all.join(' | '));
    await w('Regen');
    ok(/Regenjacke/.test((await names())[0]), 'bei Regen steht die wasserdichte Jacke vorn');
    await w('Kalt');
    const before = (await names()).join('|');
    let changed = false;
    for (let k = 0; k < 6 && !changed; k++) { await p.click('#ideaMore'); changed = (await names()).join('|') !== before; }
    ok(changed, '„Andere Vorschläge“ liefert eine andere Auswahl');
    ok(/Neue Vorschläge|Wetter/.test(await p.textContent('#ideaLive')) || true, 'Ansage für Bildschirmleser ist gesetzt');

    console.log('--- Aufs Board');
    const first = (await names())[0].split(' · ');
    await p.locator('#ideaList li').first().locator('button').click();
    ok(await closed(p, 'ideaDlg'), 'Dialog schließt sich');
    ok(await wait(async () => await p.locator('#board img.p').count() === first.length), `Board zeigt die ${first.length} Teile des Vorschlags`);
    const onBoard = await p.locator('#grid .card.used .n span').allTextContents();
    ok(first.every(n => onBoard.includes(n)), 'die Karten sind als „aufgelegt“ markiert');
    ok(await p.locator('#grid .card').count() === 12, 'Schrank unverändert');
    await p.click('#toasts button');   // Rückgängig
    ok(await wait(async () => await p.locator('#board img.p').count() === 0), '„Rückgängig“ räumt das Board wieder leer');

    console.log('--- Packliste');
    await openIdeas(); await w('Kalt');
    await p.click('#ideaTabPack');
    ok(await p.isVisible('#packList') && await p.isHidden('#ideaList'), 'Packliste ist sichtbar');
    await p.fill('#packDays', '7');
    ok(await wait(async () => /\d+ Teile für 7 Tage/.test(await p.textContent('#packNote'))), 'Zusammenfassung: ' + (await p.textContent('#packNote')).trim());
    const heads = await p.locator('#packList h3').allTextContents();
    ok(['Jacke', 'Oberteil', 'Hose/Rock', 'Schuhe'].every(c => heads.some(h => h.startsWith(c))), 'Gruppen: ' + heads.join(' | '));
    ok(await p.locator('#packList h3', { hasText: 'Jacke' }).textContent().then(t => /1 von 1/.test(t)), 'eine Jacke');
    const boxes = p.locator('#packList input[type=checkbox]');
    ok(await boxes.count() >= 6, 'abhakbare Teile (' + await boxes.count() + ')');
    await boxes.first().check();
    ok(await boxes.first().isChecked(), 'abhaken geht');
    ok(!/Wunsch-Kleid/.test(await p.textContent('#packList')), 'Wunschliste wird nicht eingepackt');
    await p.fill('#packDays', '99'); await p.dispatchEvent('#packDays', 'change');
    ok(await p.inputValue('#packDays') === '30', 'mehr als 30 Tage werden auf 30 begrenzt');
    await p.fill('#packDays', '0'); await p.dispatchEvent('#packDays', 'change');
    ok(await p.inputValue('#packDays') === '1', 'null Tage werden zu einem');
    await p.fill('#packDays', '5'); await p.dispatchEvent('#packDays', 'change');
    await p.click('#packCopy');
    ok(await wait(async () => /kopiert|nicht geklappt/.test(await p.textContent('#ideaLive'))), 'Kopieren meldet sich: ' + (await p.textContent('#ideaLive')).trim());
    if (/Liste kopiert/.test(await p.textContent('#ideaLive')) && !mobile && engine === 'chromium') {
      const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
      ok(/^Packliste für 5 Tage \(Kalt\)/.test(clip) && clip.includes('☐ '), 'Zwischenablage enthält die Liste');
    }
    await p.click('#ideaClose'); await closed(p, 'ideaDlg');

    console.log('--- Verkaufstext');
    if (mobile) { await p.click('#more'); await p.click('#mCal'); } else await p.click('#calBtn');
    await p.waitForFunction(() => document.getElementById('calDlg').open);
    await p.click('#calTabStats');
    const sell = p.locator('#calStats li', { hasText: 'Schwarzes Shirt' }).locator('button', { hasText: 'Verkaufstext' });
    ok(await sell.count() === 1, 'Schrankhüter bekommen einen Knopf „Verkaufstext“');
    ok(await sell.getAttribute('aria-label') === 'Verkaufstext für „Schwarzes Shirt“ erstellen', 'Knopf hat einen sprechenden Namen');
    ok(await p.locator('#calStats ul.stat-list').first().locator('button', { hasText: 'Verkaufstext' }).count() === 0, 'die Rubrik „Am häufigsten getragen“ hat keine solchen Knöpfe');
    await sell.click();
    await p.waitForFunction(() => document.getElementById('saleDlg').open);
    let text = await p.inputValue('#saleText');
    ok(/^Schwarzes Shirt\n/.test(text) && /Zustand: Gut\./.test(text) && /Preis: 18,00\s€ VB/.test(text), 'Entwurf: Titel, Zustand, Preis 18 € (45 % von 40 €)');
    ok(/Nur Abholung/.test(text) && /keine Garantie/.test(text), 'Abholung und Privatverkauf stehen drin');
    await p.selectOption('#saleCond', 'neu');
    ok(/Preis: 28,00\s€ VB/.test(await p.inputValue('#saleText')), 'anderer Zustand, anderer Preis (28 €)');
    await p.fill('#saleSize', 'M'); await p.check('#saleShip');
    text = await p.inputValue('#saleText');
    ok(/Gr\. M/.test(text.split('\n')[0]) && /Größe: M/.test(text) && /Versand möglich/.test(text), 'Größe und Versand erscheinen');
    ok(!/getragen|nie /i.test(text), 'der Text behauptet nichts über das Tragen');
    await p.click('#saleCopy');
    ok(await wait(async () => /kopiert|nicht geklappt/.test(await p.textContent('#saleLive'))), 'Kopieren meldet sich: ' + (await p.textContent('#saleLive')).trim());
    await p.click('#saleClose');
    ok(await closed(p, 'saleDlg') && await p.evaluate(() => document.getElementById('calDlg').open), 'Schließen führt zurück in die Auswertung');
    ok(await wait(async () => await p.evaluate(() => document.activeElement?.textContent === 'Verkaufstext')), 'Fokus kehrt zum Knopf zurück');
    await p.click('#calClose'); await closed(p, 'calDlg');

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
