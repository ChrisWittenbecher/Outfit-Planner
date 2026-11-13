import { devices } from 'playwright';
import { readFile } from 'node:fs/promises';
import { PNG, checker, closed, launch, persisted, startServer, storedItems } from './helpers.mjs';

const PORT = 8740, BASE = `http://localhost:${PORT}/index.html`;
const { ok, state: result } = checker();
const server = await startServer(PORT);
const browser = await launch();
const ready = p => p.waitForSelector('html[data-ready]', { state: 'attached' });
const wait = async (cond, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await cond()) return true; await new Promise(r => setTimeout(r, 50)); } return false; };

/** Kleidungsstück als PNG: farbige Fläche auf weißem Grund (der Grund wird beim Freistellen entfernt). */
const swatch = (p, hex) => p.evaluate(h => {
  const c = document.createElement('canvas'); c.width = 200; c.height = 240; const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 200, 240); x.fillStyle = h; x.fillRect(40, 30, 120, 180);
  return c.toDataURL('image/png').split(',')[1];
}, hex).then(b => Buffer.from(b, 'base64'));

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
    const card = label => p.locator('#grid .card', { hasText: label });
    const cards = () => p.locator('#grid .card').count();
    const q = async text => { await p.fill('#q', text); await p.waitForTimeout(60); };

    const add = async ({ name, cat, hex, tags = '' }) => {
      const before = await cards();
      await p.click(trigger);
      await p.setInputFiles('#file', { name: 'x.png', mimeType: 'image/png', buffer: await swatch(p, hex) });
      await p.waitForSelector('#res img', { timeout: 15000 });
      await p.fill('#name', name); await p.selectOption('#cat', cat);
      const detected = await wait(async () => (await p.inputValue('#color')) !== '');
      const color = await p.inputValue('#color');
      if (tags) await p.fill('#tags', tags);
      await p.click('#ok');
      await p.waitForFunction(n => document.querySelectorAll('#grid .card').length === n, before + 1);
      await closed(p, 'dlg');   // solange der Dialog ausblendet, ist die Seite dahinter gesperrt
      return { detected, color };
    };

    console.log('--- Farberkennung');
    const red = await add({ name: 'Rotes Hemd', cat: 'Oberteil', hex: '#c81e1e', tags: 'Sommer, Büro' });
    const blue = await add({ name: 'Blaue Hose', cat: 'Hose/Rock', hex: '#243b82', tags: 'büro' });
    const black = await add({ name: 'Schwarze Schuhe', cat: 'Schuhe', hex: '#151515' });
    ok(red.color === 'Rot' && blue.color === 'Blau' && black.color === 'Schwarz', `erkannt: ${red.color}, ${blue.color}, ${black.color}`);
    ok(/Oberteil · Rot/.test(await card('Rotes Hemd').locator('small').first().textContent()), 'Farbe steht auf der Karte');
    ok(/#Sommer #Büro/.test(await card('Rotes Hemd').textContent()), 'Tags stehen auf der Karte');

    console.log('--- Suche');
    ok(await cards() === 3 && /3 Teile/.test(await p.textContent('#count')), 'ohne Suche alles sichtbar');
    await q('rot');
    ok(await cards() === 1 && (await p.textContent('#count')).trim() === '1 von 3 Teilen', 'Suche nach Farbe: ' + await p.textContent('#count'));
    await q('BÜRO');
    ok(await cards() === 2, 'Suche nach Tag, Groß- und Kleinschreibung egal');
    await q('buero');
    ok(await cards() === 0 && /Nichts gefunden für „buero“/.test(await p.textContent('#grid')), 'ü ist nicht u, leere Suche wird erklärt');
    await q('blau hose');
    ok(await cards() === 1 && await card('Blaue Hose').count() === 1, 'mehrere Wörter müssen alle passen');
    await q('schuhe');
    ok(await cards() === 1, 'Suche nach Kategorie und Name');
    await q('wunschliste');
    ok(await cards() === 0, 'Status wird mitgesucht (alle sind „besitze ich“)');
    await q('<img src=x onerror=window.__pwned=1>');
    ok(await p.locator('#grid img[src="x"]').count() === 0 && !(await p.evaluate(() => window.__pwned)) && /Nichts gefunden für „<img/.test(await p.textContent('#grid')), 'Suchbegriff wird nur als Text gezeigt');
    await q('.*');
    ok(await cards() === 0, 'Sonderzeichen sind keine Suchmuster');
    await p.fill('#q', 'hemd'); await p.focus('#q'); await p.keyboard.press('Escape');
    ok(await p.inputValue('#q') === '' && await cards() === 3, 'Esc leert die Suche');

    console.log('--- Tag-Filter');
    const chip = t => p.locator('#tagChips button', { hasText: t });
    ok(await p.isVisible('#tagChips') && await chip('#Büro').count() === 1 && await chip('#Sommer').count() === 1, 'Tags erscheinen als Filter (Büro nur einmal, obwohl in zwei Schreibweisen)');
    await chip('#Büro').click();
    ok(await cards() === 2 && await chip('#Büro').getAttribute('aria-pressed') === 'true', 'Tag filtert');
    await q('hose');
    ok(await cards() === 1, 'Tag und Suche wirken zusammen');
    await q('');
    await chip('#Büro').click();
    ok(await cards() === 3 && await chip('#Büro').getAttribute('aria-pressed') === 'false', 'zweiter Klick hebt den Filter auf');

    console.log('--- Bearbeiten');
    const edit = async label => {
      if (mobile) { await card(label).locator('.more').click(); await p.click('#menuEdit'); }
      else { await card(label).hover(); await card(label).locator('.acts button[aria-label="Bearbeiten"]').click(); }
      await p.waitForFunction(() => document.getElementById('dlg').open);
    };
    await edit('Blaue Hose');
    ok(await p.inputValue('#color') === 'Blau' && await p.inputValue('#tags') === 'büro', 'Dialog zeigt Farbe und Tags');
    ok(await p.isHidden('#multiTip'), 'Tipp zum Mehrfach-Upload nur beim Hinzufügen');
    await p.selectOption('#color', 'Grün'); await p.fill('#tags', 'Winter, #Wolle, wolle, ');
    await p.click('#ok'); await closed(p, 'dlg');
    ok(/Hose\/Rock · Grün/.test(await card('Blaue Hose').locator('small').first().textContent()), 'eigene Farbe bleibt erhalten (wird nicht überschrieben)');
    ok(await chip('#Winter').count() === 1 && await chip('#Wolle').count() === 1 && await chip('#Wolle').count() === 1, 'neue Tags erscheinen, Doppelte fallen weg');
    await edit('Schwarze Schuhe');
    await p.selectOption('#color', ''); await p.click('#ok'); await closed(p, 'dlg');
    ok(!/Schwarz/.test(await card('Schwarze Schuhe').locator('small').first().textContent()), 'Farbe lässt sich entfernen');
    await edit('Rotes Hemd'); await p.fill('#tags', ''); await p.click('#ok'); await closed(p, 'dlg');
    ok(await chip('#Sommer').count() === 0 && await chip('#Büro').count() === 0, 'nicht mehr benutzte Tags verschwinden');
    await chip('#Winter').click();
    await edit('Blaue Hose'); await p.fill('#tags', ''); await p.click('#ok'); await closed(p, 'dlg');
    ok(await p.isHidden('#tagChips') && await cards() === 3, 'wird der aktive Tag gelöscht, hebt sich der Filter von selbst auf');
    await edit('Rotes Hemd'); await p.fill('#tags', 'Sommer, Büro'); await p.click('#ok'); await closed(p, 'dlg');

    console.log('--- Neustart und Backup');
    ok(await persisted(p, 3), 'gespeichert');
    await p.reload(); await ready(p);
    ok(/#Sommer #Büro/.test(await card('Rotes Hemd').textContent()) && /Grün/.test(await card('Blaue Hose').textContent()), 'Tags und Farben überstehen den Neustart');
    const dl = p.waitForEvent('download');
    await p.evaluate(() => document.getElementById('exp').click());
    const bak = JSON.parse(await readFile(await (await dl).path(), 'utf8'));
    const hemd = bak.items.find(i => i.name === 'Rotes Hemd');
    ok(hemd.color === 'Rot' && JSON.stringify(hemd.tags) === JSON.stringify(['Sommer', 'Büro']), 'Backup enthält Farbe und Tags');

    const img = 'data:image/png;base64,' + PNG.toString('base64');
    const evil = JSON.stringify({ items: [
      { id: 'a', name: 'Fremd', cat: 'Oberteil', img, color: 'Neon<script>', tags: ['<img src=x onerror=window.__pwned=1>Gut', 'x'.repeat(300), ...Array.from({ length: 40 }, (_, i) => 't' + i), 7, null, { a: 1 }] },
      { id: 'b', name: 'Fremd2', cat: 'Oberteil', img, color: 'Blau', tags: 'kein Array' },
    ] });
    await p.setInputFiles('#impf', { name: 'evil.json', mimeType: 'application/json', buffer: Buffer.from(evil) });
    await p.click('#uiOk');
    await p.waitForFunction(() => document.querySelectorAll('#grid .card').length === 2);
    const tagBtns = await p.locator('#tagChips button').allTextContents();
    ok(tagBtns.length <= 12 && tagBtns.every(t => t.length <= 32) && tagBtns[0] !== undefined, 'feindliche Tags: begrenzt (' + tagBtns.length + ')');
    ok(await p.locator('#grid img[src="x"], #tagChips img').count() === 0 && !(await p.evaluate(() => window.__pwned)), 'kein Markup aus Tags wird ausgeführt');
    ok(/Gut/.test(tagBtns.join(' ')) && !/<|script/.test(tagBtns.join(' ')), 'Markup wurde aus dem Tag entfernt');
    ok(!/Neon/.test(await p.textContent('#grid')) && /Oberteil · Blau/.test(await card('Fremd2').locator('small').first().textContent()), 'ungültige Farbe wird verworfen, gültige bleibt');

    console.log('--- Mehrere Bilder auf einmal');
    await p.click('#tagChips button >> nth=0').catch(() => {});
    if (await p.locator('#tagChips button[aria-pressed="true"]').count()) await p.locator('#tagChips button[aria-pressed="true"]').click();
    await p.click('#chips button:has-text("Jacke")');
    const green = await swatch(p, '#2e7d32'), beige = await swatch(p, '#d8c3a5');
    await p.click(trigger);
    ok(await p.isVisible('#wayPhotos'), 'Auswahl-Blatt bietet „Fotos wählen“ an');
    await p.setInputFiles('#file', [
      { name: 'gruene_jacke.png', mimeType: 'image/png', buffer: green },
      { name: 'IMG_0042.png', mimeType: 'image/png', buffer: beige },
      { name: 'kaputt.png', mimeType: 'image/png', buffer: Buffer.from('das ist kein bild') },
    ]);
    await p.waitForFunction(() => document.getElementById('queueDlg').open);
    ok(await wait(async () => /2 von 3 Fotos sind bereit, 1 mit Fehler/.test(await p.textContent('#queueHead'))), 'Warteschlange: zwei Fotos bereit, eines mit Fehler (' + (await p.textContent('#queueHead')).trim() + ')');
    await p.click('#queueAdd'); await closed(p, 'queueDlg');
    ok(await wait(async () => /2 Teile hinzugefügt/.test(await p.textContent('#toasts'))), 'Zusammenfassung: ' + (await p.textContent('#toasts')).slice(0, 140));
    ok(/1 nicht lesbar/.test(await p.textContent('#toasts')) && /Kategorie Jacke/.test(await p.textContent('#toasts')), 'defekte Datei wird gemeldet, Kategorie folgt dem Filter');
    await p.click('#chips button:has-text("Alle")');
    ok(await cards() === 4, 'zwei neue Teile (' + await cards() + ')');
    ok(await card('gruene jacke').count() === 1 && await card('Neues Teil').count() === 1, 'Namen aus Dateinamen, „IMG_0042“ wird zu „Neues Teil“');
    ok(/Jacke · Grün/.test(await card('gruene jacke').locator('small').first().textContent()), 'Farbe automatisch erkannt');
    ok((await storedItems(p)).some(i => i.name.toLowerCase() === 'gruene jacke' && i.cut && i.img.startsWith('data:image/png')), 'Bild ist freigestellt (PNG mit Transparenz)');
    await p.click('#toasts button');   // Rückgängig
    ok(await wait(async () => await cards() === 2), 'ein Klick auf „Rückgängig“ entfernt alle neuen Teile');

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
