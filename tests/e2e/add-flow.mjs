import { devices } from 'playwright';
import { checker, PNG, startServer, launch, engine, closed } from './helpers.mjs';

const PORT = 8731, BASE = `http://localhost:${PORT}/index.html`;
const { ok, state: result } = checker();
const server = await startServer(PORT);

const browser = await launch();
try {
  for (const [name, opts] of [['iPhone 13', devices['iPhone 13']], ['Desktop', { viewport: { width: 1280, height: 800 } }]]) {
    const mobile = name !== 'Desktop';
    const ctx = await browser.newContext(opts);
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', e => errors.push(e.message));
    const native = [];
    p.on('dialog', d => { native.push(d.type() + ': ' + d.message()); d.dismiss(); });
    await p.goto(BASE);
    await p.waitForSelector('html[data-ready]', { state: 'attached' });
    console.log('--- ' + name);

    const trigger = mobile ? '#fab' : '#addBtn';
    const noOverflow = () => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
    ok(await noOverflow(), 'kein horizontaler Überlauf');
    ok(await p.locator(trigger).isVisible(), 'Hinzufügen-Button sichtbar (' + trigger + ')');

    await p.click(trigger);
    ok(await p.locator('#dlg').evaluate(d => d.open), 'Dialog öffnet direkt');
    ok(await p.locator('#linkInput').count() === 0 && await p.locator('#scanBtn').count() === 0, 'kein Link-Import und kein Barcode-Scanner mehr');
    if (mobile) {
      ok(await p.evaluate(() => document.getElementById('dlg').getBoundingClientRect().width >= innerWidth - 1), 'Dialog als Bottom-Sheet in voller Breite');
      const small = await p.evaluate(() => [...document.querySelectorAll('#dlg button, #dlg input:not([type=checkbox]):not([type=range]):not([hidden]), #dlg select')]
        .filter(e => e.offsetParent && e.getBoundingClientRect().height < 40).map(e => e.id || e.textContent));
      ok(small.length === 0, 'Touch-Ziele mindestens 40 px ' + small.join(','));
      const zoom = await p.evaluate(() => [...document.querySelectorAll('#dlg input:not([type=checkbox]):not([type=range]), #dlg select')]
        .filter(e => parseFloat(getComputedStyle(e).fontSize) < 16).length);
      ok(zoom === 0, 'Eingabefelder mindestens 16 px (kein iOS-Zoom)');
    }

    // Bild hinzufügen, Angaben ergänzen, speichern
    await p.setInputFiles('#file', { name: 'tee.png', mimeType: 'image/png', buffer: PNG });
    await p.waitForSelector('#res img', { timeout: 15000 });
    ok(true, 'Bild wird verarbeitet und freigestellt');
    await p.fill('#name', 'Blaues Shirt');
    await p.selectOption('#cat', 'Oberteil');
    await p.fill('#price', '39,90');
    await p.fill('#url', 'javascript:alert(1)');
    await p.click('#ok');
    ok(await p.locator('#dlg').evaluate(d => d.open) && /ungültig/i.test(await p.textContent('#status')), 'ungültiger Link wird abgelehnt');
    await p.fill('#url', 'https://shop.example.com/blaues-shirt');
    await p.click('#ok');
    ok(await closed(p, 'dlg'), 'Speichern schließt den Dialog');
    ok(await p.locator('#grid .card').count() === 1, 'Karte im Kleiderschrank');
    const card = await p.locator('#grid .card').first().innerText();
    ok(/Blaues Shirt/.test(card) && /39/.test(card), 'Name und Preis an der Karte');
    ok(await p.locator('#grid .card a[href="https://shop.example.com/blaues-shirt"]').count() === 1, 'Link zum Angebot an der Karte');

    // Auf das Board legen und Datenhaltung nach Neuladen prüfen
    await p.locator('#grid .card').first().locator('img').first().click();
    ok(await p.locator('#board img').count() === 1, 'Teil liegt auf dem Board');

    // Zwei-Finger-Geste (nur Touch): Größe und Drehung
    if (mobile && engine === 'chromium') {   // Mehrfingereingabe läuft über CDP, das gibt es nur in Chromium
      const cdp = await ctx.newCDPSession(p);
      const widthOf = () => p.evaluate(() => parseFloat(document.querySelector('#board img.p').style.width));
      const rotOf = () => p.evaluate(() => { const m = /rotate\(([-\d.]+)deg\)/.exec(document.querySelector('#board img.p').style.transform); return m ? parseFloat(m[1]) : 0; });
      await p.locator('#board').scrollIntoViewIfNeeded();
      const box = await p.locator('#board img.p').boundingBox();
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      const two = (dx, dy) => [{ x: cx - dx, y: cy - dy, id: 1 }, { x: cx + dx, y: cy + dy, id: 2 }];
      const w0 = await widthOf();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: two(30, 0) });
      for (const d of [40, 50, 60]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: two(d, 0) });
      await p.waitForTimeout(150);
      const w1 = await widthOf();
      ok(Math.abs(w1 / w0 - 2) < 0.1, 'Spreizen mit zwei Fingern verdoppelt die Größe (' + w0 + ' → ' + w1 + ')');
      for (const d of [45, 30]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: two(d, 0) });
      await p.waitForTimeout(150);
      const w2 = await widthOf();
      ok(Math.abs(w2 / w0 - 1) < 0.1, 'Zusammenziehen verkleinert wieder (' + w2 + ')');
      // Drehen: Fingerlinie von waagerecht nach senkrecht (90° im Uhrzeigersinn)
      for (const [dx, dy] of [[30, 0], [26, 15], [15, 26], [0, 30]]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: two(dx, dy) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const r = await rotOf();
      ok(Math.abs(r - 90) < 8, 'Zwei-Finger-Drehung dreht um etwa 90° (' + r + '°)');
      ok(await p.locator('#board img.p').count() === 1, 'Teil bleibt nach der Geste auf dem Board');
    }

    // PNG-Export
    const dl = p.waitForEvent('download');
    await p.locator('#png').scrollIntoViewIfNeeded();
    await p.click('#png');
    ok((await dl).suggestedFilename() === 'outfit.png', 'PNG-Export funktioniert');
    await p.waitForTimeout(400);
    await p.reload();
    await p.waitForSelector('html[data-ready]', { state: 'attached' });
    await p.waitForSelector('#grid .card');
    ok(await p.locator('#grid .card').count() === 1, 'Teil bleibt nach Neuladen erhalten');

    const card1 = () => p.locator('#grid .card').first();
    const openEdit = async () => {
      await card1().scrollIntoViewIfNeeded();
      if (mobile) { await card1().locator('.more').click(); await p.click('#menuEdit'); }
      else { await card1().hover(); await card1().locator('.acts button[aria-label="Bearbeiten"]').click(); }
      await p.waitForFunction(() => document.getElementById('dlg').open);
    };
    await openEdit();
    ok(await p.inputValue('#itemState') === 'own', 'Status eines normalen Teils ist „Besitze ich“');
    ok(await p.locator('#priceHistory').isHidden(), 'Preisverlauf erst ab zwei Einträgen sichtbar');
    await p.fill('#price', '29,90');
    await p.selectOption('#itemState', 'wish');
    await p.click('#ok');
    ok(await card1().locator('.badge').innerText() === 'Wunsch', 'Karte zeigt „Wunsch“-Marke');
    ok(/25 %/.test(await card1().locator('.pc--down').innerText()), 'Preissenkung von 39,90 auf 29,90 wird als ↓ 25 % gezeigt');
    const sc = label => p.locator('#statusChips button', { hasText: label });
    await sc('Besitze ich').click();
    ok(await p.locator('#grid .card').count() === 0 && /Nichts in dieser Auswahl/.test(await p.textContent('#grid')), 'Filter „Besitze ich“ blendet den Wunsch aus');
    await sc('Wunschliste').click();
    ok(await p.locator('#grid .card').count() === 1, 'Filter „Wunschliste“ zeigt den Wunsch');
    await sc('Alle').click();
    if (await p.locator('#board img.p').count() === 0) await card1().locator('img').first().click();
    ok(/29,90/.test(await p.textContent('#sum .t--buy')) && /Noch zu kaufen/.test(await p.textContent('#sum .t--buy')), '„Noch zu kaufen“-Summe im Outfit');
    await openEdit();
    ok(await p.inputValue('#itemState') === 'wish', 'Status bleibt gespeichert');
    ok(await p.locator('#priceHistory').isVisible() && await p.locator('#priceList li').count() === 2 && /29,90/.test(await p.locator('#priceList li').first().innerText()), 'Preisverlauf mit zwei Einträgen, neuester zuerst');
    await p.click('#cancel', { timeout: 6000 }).catch(async e => {
      console.log('DIAG', JSON.stringify(await p.evaluate(() => { const c = document.getElementById('cancel'), d = document.getElementById('dlg'), r = c.getBoundingClientRect(); const t = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { cancel: [r.x, r.y, r.width, r.height].map(Math.round), dlg: (q => [q.x, q.y, q.width, q.height].map(Math.round))(d.getBoundingClientRect()), top: t && (t.id || t.className || t.tagName), dlgScroll: d.scrollTop, anims: document.getAnimations().map(a => (a.effect?.target?.id || a.effect?.target?.className || a.effect?.target?.tagName) + ':' + a.playState + ':' + (a.effect?.getTiming().iterations)), vv: [innerWidth, innerHeight, scrollY] }; })));
      throw e; });
    if (mobile) { await card1().locator('.more').click(); ok(await p.locator('#menuBought').isVisible(), 'Menü bietet „Als gekauft markieren“ bei Wunschteilen'); await p.click('#menuBought'); }
    else { await card1().hover(); await card1().locator('.acts button[aria-label="Als gekauft markieren"]').click(); }
    ok(await card1().locator('.badge').count() === 0 && await p.locator('#sum .t--buy').count() === 0, 'Als gekauft markiert: keine Marke, keine „Noch zu kaufen“-Summe');
    await p.waitForTimeout(400);
    await p.reload();
    await p.waitForSelector('html[data-ready]', { state: 'attached' });
    await p.waitForSelector('#grid .card');
    ok(await card1().locator('.badge').count() === 0 && await card1().locator('.pc--down').count() === 1, 'Status und Preisverlauf bleiben nach Neuladen erhalten');

    const first = p.locator('#grid .card').first();
    await first.scrollIntoViewIfNeeded();
    if (mobile) {
      ok(await first.locator('.more').isVisible() && !(await first.locator('.acts').isVisible()), 'Smartphone: Drei-Punkte-Menü statt Rundbuttons');
      const sz = await first.locator('.more').boundingBox();
      ok(Math.abs(sz.width - sz.height) < 1 && sz.width >= 32, 'Drei-Punkte-Button ist rund und nicht gequetscht (' + sz.width + '×' + sz.height + ')');
      await first.locator('.more').click();
      ok(await p.locator('#menuDlg').evaluate(d => d.open) && /Blaues Shirt/.test(await p.textContent('#menuTitle')), 'Menü öffnet mit Namen des Teils');
      ok(await p.locator('#menuOffer').isVisible(), 'Menü bietet „Zum Angebot“ bei vorhandenem Link');
      await p.click('#menuEdit');
      ok(await p.locator('#dlg').evaluate(d => d.open) && await p.inputValue('#name') === 'Blaues Shirt', 'Menü → Bearbeiten öffnet den Dialog');
      await p.click('#cancel');
      await first.locator('.more').click();
      await p.click('#menuDelete');
      ok(await p.locator('#grid .card').count() === 0, 'Menü → Löschen entfernt das Teil ohne Rückfrage-Dialog');
      ok(/gelöscht/.test(await p.textContent('#toasts')) && await p.locator('#toasts button', { hasText: 'Rückgängig' }).isVisible(), 'Hinweis „gelöscht“ mit „Rückgängig“');
      await p.click('#toasts button');
      ok(await p.locator('#grid .card').count() === 1, '„Rückgängig“ holt das gelöschte Teil zurück');
    } else {
      ok(!(await first.locator('.more').isVisible()), 'Desktop: kein Drei-Punkte-Button');
      await first.hover();
      const bs = await first.locator('.acts button').evaluateAll(bs => bs.map(b => { const r = b.getBoundingClientRect(); return Math.abs(r.width - r.height) < 1; }));
      ok(bs.length >= 2 && bs.every(Boolean), 'Desktop: Schnellaktionen sind rund');
    }
    ok(await noOverflow(), 'weiterhin kein horizontaler Überlauf');
    ok(native.length === 0, 'keine nativen alert/confirm/prompt-Dialoge ' + native.join(' | '));
    ok(errors.length === 0, 'keine Skriptfehler ' + errors.join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(result.fails ? result.fails + ' FEHLER' : 'ALLES OK');
process.exit(result.fails ? 1 : 0);
