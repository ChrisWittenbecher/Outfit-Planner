import { devices } from 'playwright';
import { checker, closed, launch, startServer } from './helpers.mjs';

// Teilen als Bild: das gezeichnete Bild (Größe, Farben, Ebenen, Drehung, Bühne) und jeder Weg des Teilens
// (Erfolg, Abbruch, „frische Berührung nötig“, Fehler, kein Teilen möglich), am Board und an gespeicherten Outfits.
const PORT = 8763, BASE = `http://localhost:${PORT}/index.html`;
const { ok, state: result } = checker();
const server = await startServer(PORT);
const browser = await launch();
const ready = p => p.waitForSelector('html[data-ready]', { state: 'attached' });
const wait = async (cond, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await cond()) return true; await new Promise(r => setTimeout(r, 40)); } return false; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const near = (a, b, tol = 3) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol);

// Ersatz für navigator.share, der aufzeichnet, was ankommt (Playwright kann das System-Menü nicht bedienen).
const STUB = () => {
  const S = window.__sh = { mode: 'ok', can: true, calls: [], last: null, delay: 0 };
  Object.defineProperty(navigator, 'canShare', { configurable: true, value(d) { return S.can && !!d && Array.isArray(d.files) && d.files.length === 1; } });
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    async value(d) {
      const f = d.files[0];
      S.calls.push({ name: f.name, type: f.type, size: f.size, title: d.title, keys: Object.keys(d).sort().join(',') });
      S.last = f;
      if (S.delay) await new Promise(r => setTimeout(r, S.delay));
      const m = S.mode;
      if (m === 'abort') throw new DOMException('cancel', 'AbortError');
      if (m === 'denied') throw new DOMException('needs a tap', 'NotAllowedError');
      if (m === 'denied-once') { S.mode = 'ok'; throw new DOMException('needs a tap', 'NotAllowedError'); }
      if (m === 'fail') throw new DOMException('broken', 'DataError');
    },
  });
};

try {
  for (const [name, opts] of [['iPhone 13', { ...devices['iPhone 13'], acceptDownloads: true }], ['Desktop', { viewport: { width: 1280, height: 900 }, acceptDownloads: true }]]) {
    console.log('--- ' + name);
    const ctx = await browser.newContext(opts);
    const p = await ctx.newPage();
    const errors = [], native = [], downloads = [];
    p.on('pageerror', e => errors.push(e.message));
    p.on('dialog', d => { native.push(d.type()); d.dismiss(); });
    p.on('download', d => downloads.push(d.suggestedFilename()));
    await p.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
    await p.addInitScript(STUB);
    await p.goto(BASE); await ready(p);

    const toasts = () => p.evaluate(() => [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent.trim()).join(' | '));
    const clearToasts = () => p.evaluate(() => document.getElementById('toasts').replaceChildren());
    const calls = () => p.evaluate(() => window.__sh.calls.slice());
    const reset = (mode = 'ok', can = true, delay = 0) => { downloads.length = 0; return p.evaluate(([m, c, d]) => { const S = window.__sh; S.mode = m; S.can = c; S.delay = d; S.calls.length = 0; S.last = null; document.getElementById('toasts').replaceChildren(); }, [mode, can, delay]); };
    const active = () => p.evaluate(() => { const a = document.activeElement; return a ? (a.id || a.getAttribute('aria-label') || a.tagName) : ''; });
    const stageRgb = async () => (await p.evaluate(() => getComputedStyle(document.getElementById('board')).backgroundColor)).match(/\d+/g).slice(0, 3).map(Number);
    const solid = (color, w = 100, h = 150) => p.evaluate(([c, w, h]) => { const k = document.createElement('canvas'); k.width = w; k.height = h; const x = k.getContext('2d'); x.fillStyle = c; x.fillRect(0, 0, w, h); return k.toDataURL('image/png'); }, [color, w, h]);
    /** Liest das zuletzt geteilte Bild: Maße, Dateikopf und einzelne Pixel. */
    const image = pts => p.evaluate(async pts => {
      const f = window.__sh.last; if (!f) return null;
      const head = [...new Uint8Array(await f.slice(0, 8).arrayBuffer())];
      const bmp = await createImageBitmap(f), c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      const x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
      return { w: bmp.width, h: bmp.height, head, px: pts.map(([a, b]) => [...x.getImageData(a, b, 1, 1).data]) };
    }, pts);
    const importData = async data => {
      await p.setInputFiles('#impf', { name: 'bak.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
      await p.click('#uiOk'); await closed(p, 'uiDlg');
      await p.waitForFunction(n => document.querySelectorAll('#grid .card').length === n, data.items.length);
    };
    const saved = n => p.locator('#outs .out').filter({ hasText: n }).getByRole('button', { name: 'Teilen: ' + n });

    console.log('--- Leeres Board');
    ok(await p.isDisabled('#shareBtn') && await p.isDisabled('#png'), 'ohne Teile sind „Teilen“ und „Als Bild laden“ gesperrt');
    ok((await p.textContent('#shareBtn')).trim() === 'Teilen', 'Knopf heißt „Teilen“');

    console.log('--- Daten laden');
    const mk = (id, nm, cat, img, extra = {}) => ({ id, name: nm, cat, img, link: '', price: null, cur: 'EUR', tags: [], cut: true, ...extra });
    const items = [
      mk('r1', 'Rotes Shirt', 'Oberteil', await solid('#ff0000')),
      mk('b1', 'Blaue Hose', 'Hose/Rock', await solid('#0000ff')),
      mk('g1', 'Grüner Schal', 'Accessoire', await solid('#00ff00')),
      mk('y1', 'Gelbes Top', 'Oberteil', await solid('#ffff00'), { cut: false }),
    ];
    const piece = (id, x, y, w, r = 0) => ({ id, x, y, w, r });
    const DATA = {
      items,
      board: [piece('r1', 50, 100, 100), piece('b1', 100, 150, 100), piece('g1', 220, 350, 100, 90), piece('y1', 20, 20, 60)],
      outfits: [
        { id: 'o1', name: 'Büro Look', pieces: [piece('r1', 50, 100, 100), piece('zz', 10, 10, 50)] },
        { id: 'o2', name: 'Nur Fehlendes', pieces: [piece('zz', 10, 10, 50)] },
        { id: 'o3', name: 'Outfit 3', pieces: [piece('b1', 100, 150, 100)] },
      ],
      wears: [],
    };
    await importData(DATA);
    ok(await p.locator('#board img.p').count() === 4, 'vier Teile liegen auf dem Board');
    ok(await p.isEnabled('#shareBtn') && await p.isEnabled('#png'), 'mit Teilen sind die Knöpfe frei');
    ok(await p.locator('#outs .out').count() === 3 && await saved('Büro Look').count() === 1, 'jedes gespeicherte Outfit hat „Teilen“ (mit Namen im Bedienhilfe-Text)');
    ok(await p.getByRole('button', { name: 'Teilen', exact: true }).count() === 1, 'am Board gibt es genau einen Knopf „Teilen“');
    const undoBefore = await p.isDisabled('#undo');

    console.log('--- Bild vom Board teilen');
    await reset();
    const bg = await stageRgb();
    await p.locator('#shareBtn').scrollIntoViewIfNeeded();
    await p.click('#shareBtn');
    ok(await wait(async () => (await calls()).length === 1), 'navigator.share wird mit der Datei aufgerufen');
    const c1 = (await calls())[0];
    ok(c1.name === 'outfit.png' && c1.type === 'image/png' && c1.title === 'Outfit' && c1.keys === 'files,title' && c1.size > 200, 'Datei outfit.png (image/png), Titel „Outfit“, sonst nichts übergeben (' + JSON.stringify(c1) + ')');
    const PTS = [[4, 4], [796, 1196], [150, 250], [250, 400], [350, 550], [100, 130], [420, 850], [540, 720], [680, 850], [540, 970]];
    const im = await image(PTS);
    ok(im && im.w === 800 && im.h === 1200, 'Bild ist 800 × 1200 (' + im?.w + '×' + im?.h + ')');
    ok(im && im.head.join() === '137,80,78,71,13,10,26,10', 'Datei ist wirklich ein PNG');
    ok(near(im.px[0].slice(0, 3), bg, 1) && im.px[0][3] === 255 && near(im.px[1].slice(0, 3), bg, 1), 'Ränder zeigen die Bühne des Boards (' + im.px[0].join(',') + ' / Bühne ' + bg.join(',') + ')');
    ok(near(im.px[2].slice(0, 3), [255, 0, 0], 1), 'Rotes Shirt unten ist rot (' + im.px[2].join(',') + ')');
    ok(near(im.px[3].slice(0, 3), [0, 0, 255], 1) && near(im.px[4].slice(0, 3), [0, 0, 255], 1), 'Blaue Hose liegt vor dem Shirt (Ebenenreihenfolge, ' + im.px[3].join(',') + ')');
    ok(near(im.px[5].slice(0, 3), [bg[0], bg[1], 0], 3), 'Teil ohne Freistellung wird multipliziert wie auf dem Board: Gelb × Bühne (' + im.px[5].join(',') + ')');
    ok(near(im.px[6].slice(0, 3), [0, 255, 0], 1) && near(im.px[8].slice(0, 3), [0, 255, 0], 1), 'Drehung um 90° dreht das Teil um die Mitte (breit statt hoch)');
    ok(near(im.px[7].slice(0, 3), bg, 1) && near(im.px[9].slice(0, 3), bg, 1), 'dort, wo es ungedreht läge, ist Bühne');
    ok(await p.locator('#shareBtn').getAttribute('aria-busy') === null, 'Knopf ist nach dem Teilen nicht mehr „beschäftigt“');
    ok(await toasts() === '' && downloads.length === 0, 'Erfolg bleibt still: kein Hinweis, keine Datei');
    ok(await active() === 'shareBtn', 'Fokus bleibt auf dem Knopf');
    ok(await p.locator('#board img.p').count() === 4 && await p.isDisabled('#undo') === undoBefore, 'Board und Rückgängig-Verlauf bleiben unverändert');

    console.log('--- Tastatur');
    await reset();
    await p.focus('#shareBtn'); await p.keyboard.press('Enter');
    ok(await wait(async () => (await calls()).length === 1), 'Enter auf dem Knopf teilt');
    await reset();
    await p.focus('#shareBtn'); await p.keyboard.press('Space');
    ok(await wait(async () => (await calls()).length === 1), 'Leertaste teilt');

    console.log('--- Abbruch');
    await reset('abort');
    await p.click('#shareBtn');
    ok(await wait(async () => (await calls()).length === 1), 'Menü wurde geöffnet');
    await sleep(300);
    ok(await toasts() === '' && downloads.length === 0, 'Abbrechen ist keine Fehlermeldung und speichert nichts');
    ok(await p.locator('#shareBtn').getAttribute('aria-busy') === null, 'Knopf ist wieder frei');
    await p.evaluate(() => { window.__sh.mode = 'ok'; });
    await p.click('#shareBtn');
    ok(await wait(async () => (await calls()).length === 2), 'danach lässt sich erneut teilen');

    console.log('--- Browser verlangt eine frische Berührung');
    await reset('denied-once');
    await p.click('#shareBtn');
    ok(await wait(async () => /Das Bild ist fertig/.test(await toasts())), 'Hinweis: Bild ist fertig, auf „Teilen“ tippen (' + await toasts() + ')');
    const first = (await calls())[0];
    ok(await p.locator('#toasts .toast button').textContent() === 'Teilen' && downloads.length === 0, 'Knopf „Teilen“ im Hinweis, noch nichts gespeichert');
    await p.click('#toasts .toast button');
    ok(await wait(async () => (await calls()).length === 2), 'zweiter Versuch mit dem fertigen Bild');
    const second = (await calls())[1];
    ok(second.name === first.name && second.size === first.size, 'es ist dieselbe Datei, nichts wird neu gezeichnet (' + first.size + ' Byte)');
    ok(await wait(async () => (await toasts()) === '') && downloads.length === 0, 'danach ist alles still');
    await reset('denied');
    await p.click('#shareBtn');
    await wait(async () => /Das Bild ist fertig/.test(await toasts()));
    await p.click('#toasts .toast button');
    ok(await wait(async () => downloads.length === 1), 'wird es auch im zweiten Versuch verweigert, wird die Datei gespeichert (' + downloads.join() + ')');
    ok(/Teilen hat nicht geklappt.*als Datei gespeichert/.test(await toasts()), 'mit klarem Hinweis (' + await toasts() + ')');

    console.log('--- Anderer Fehler');
    await reset('fail');
    await p.click('#shareBtn');
    ok(await wait(async () => downloads.length === 1) && downloads[0] === 'outfit.png', 'Fehler beim Teilen: Datei outfit.png wird gespeichert');
    ok(/Teilen hat nicht geklappt/.test(await toasts()), 'Hinweis nennt das (' + await toasts() + ')');

    console.log('--- Gerät kann Dateien nicht teilen');
    await reset('ok', false);
    await p.click('#shareBtn');
    ok(await wait(async () => downloads.length === 1) && downloads[0] === 'outfit.png', 'ohne Unterstützung wird die Datei gespeichert');
    ok((await calls()).length === 0, 'navigator.share wird dann gar nicht erst aufgerufen');
    ok(/Dieses Gerät kann Bilder nicht direkt teilen.*als Datei gespeichert/.test(await toasts()), 'Hinweis erklärt, was passiert ist (' + await toasts() + ')');
    await p.evaluate(() => { delete navigator.share; delete navigator.canShare; Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true }); });
    await reset('ok', true);
    await p.click('#shareBtn');
    ok(await wait(async () => downloads.length === 1), 'auch ganz ohne share/canShare (ältere Browser) wird gespeichert');
    await p.evaluate(STUB);   // Ersatz wieder einsetzen

    console.log('--- Doppeltes Tippen');
    await reset('ok', true, 700);
    await p.evaluate(() => { const b = document.getElementById('shareBtn'); b.click(); b.click(); });
    ok(await p.locator('#shareBtn').getAttribute('aria-busy') === 'true', 'Knopf meldet „beschäftigt“, solange gearbeitet wird');
    await p.evaluate(() => { document.getElementById('png').click(); });
    await sleep(1100);
    ok((await calls()).length === 1 && downloads.length === 0, 'zweimaliges Tippen teilt nur einmal, „Als Bild laden“ läuft währenddessen nicht dazwischen');
    ok(await p.locator('#shareBtn').getAttribute('aria-busy') === null, 'danach ist der Knopf wieder frei');

    console.log('--- Als Bild laden bleibt eine Datei');
    await reset();
    await p.locator('#png').scrollIntoViewIfNeeded();
    await p.click('#png');
    ok(await wait(async () => downloads.length === 1) && downloads[0] === 'outfit.png', '„Als Bild laden“ speichert outfit.png');
    ok((await calls()).length === 0 && await toasts() === '', 'ohne Teilen-Menü und ohne Hinweis');

    console.log('--- Gespeichertes Outfit teilen');
    await reset();
    await saved('Büro Look').scrollIntoViewIfNeeded();
    await saved('Büro Look').click();
    ok(await wait(async () => (await calls()).length === 1), 'gespeichertes Outfit wird geteilt');
    const c2 = (await calls())[0];
    ok(c2.name === 'outfit-buero-look.png' && c2.title === 'Büro Look', 'Dateiname aus dem Namen („' + c2.name + '“), Titel ist der Name');
    const im2 = await image([[4, 4], [150, 250], [250, 400], [420, 850]]);
    ok(im2 && im2.w === 800 && im2.h === 1200 && near(im2.px[0].slice(0, 3), bg, 1), 'gleiches Bildformat und gleiche Bühne wie vom Board');
    ok(near(im2.px[1].slice(0, 3), [255, 0, 0], 1), 'enthält das Rote Shirt');
    ok(near(im2.px[2].slice(0, 3), [255, 0, 0], 1) && near(im2.px[3].slice(0, 3), bg, 1), 'nur dieses Outfit, nicht das Board (dort liegen Blau und Grün darüber)');
    ok(await wait(async () => /1 Teil fehlt im Schrank und ist nicht auf dem Bild/.test(await toasts())), 'fehlendes Teil wird gemeldet (' + await toasts() + ')');
    ok(await p.locator('#board img.p').count() === 4, 'das Board bleibt unverändert');
    ok(await active() === 'Teilen: Büro Look', 'Fokus bleibt auf dem Knopf');

    await reset();
    await saved('Outfit 3').scrollIntoViewIfNeeded();
    await saved('Outfit 3').click();
    ok(await wait(async () => (await calls()).length === 1) && (await calls())[0].name === 'outfit-3.png', 'Standardname „Outfit 3“ → outfit-3.png');

    await reset();
    await saved('Nur Fehlendes').scrollIntoViewIfNeeded();
    await saved('Nur Fehlendes').click();
    ok(await wait(async () => /konnte nicht erstellt werden/.test(await toasts())), 'Outfit nur aus fehlenden Teilen: klare Fehlermeldung (' + await toasts() + ')');
    ok((await calls()).length === 0 && downloads.length === 0, 'es wird nichts Leeres geteilt oder gespeichert');
    ok(await p.locator('#toasts .toast--err').count() === 1, 'als Fehler gekennzeichnet');
    ok(await p.locator('#outs .out').count() === 3, 'Liste bleibt unverändert');

    console.log('--- Bühne dunkel');
    await reset();
    await p.locator('#stageBtn').scrollIntoViewIfNeeded();
    for (let i = 0; i < 4 && (await p.textContent('#stageBtn')).indexOf('Dunkel') < 0; i++) await p.click('#stageBtn');
    ok((await stageRgb()).join() === '24,24,27', 'Bühne steht auf Dunkel');
    await p.click('#shareBtn');
    ok(await wait(async () => (await calls()).length === 1), 'geteilt');
    const dk = await image([[4, 4], [100, 130], [150, 250]]);
    ok(near(dk.px[0].slice(0, 3), [24, 24, 27], 1), 'Bild nutzt die dunkle Bühne (' + dk.px[0].join(',') + ')');
    ok(near(dk.px[1].slice(0, 3), [24, 24, 0], 2), 'Multiplizieren gegen die dunkle Bühne (' + dk.px[1].join(',') + ')');
    ok(near(dk.px[2].slice(0, 3), [255, 0, 0], 1), 'freigestellte Teile bleiben unverändert');
    await p.click('#stageBtn');   // zurück auf Auto

    console.log('--- Leeren sperrt wieder');
    await p.click('#clear');
    await p.waitForFunction(() => document.querySelectorAll('#board img.p').length === 0);
    ok(await p.isDisabled('#shareBtn') && await p.isDisabled('#png'), 'ohne Teile sind die Knöpfe wieder gesperrt');
    await reset();
    await p.evaluate(() => { document.getElementById('shareBtn').click(); document.getElementById('png').click(); });
    await sleep(300);
    ok((await calls()).length === 0 && downloads.length === 0, 'gesperrte Knöpfe tun nichts');
    await p.click('#undo');
    await p.waitForFunction(() => document.querySelectorAll('#board img.p').length === 4);
    ok(await p.isEnabled('#shareBtn'), 'Rückgängig holt die Teile zurück, der Knopf ist wieder frei');

    console.log('--- Layout');
    for (const w of [320, 360, 390, 768, 1280]) {
      await p.setViewportSize({ width: w, height: 800 }); await sleep(250);
      const lay = await p.evaluate(() => {
        const vw = document.documentElement.clientWidth, bad = [];
        for (const b of document.querySelectorAll('.tools button, #outs .out button')) {
          const r = b.getBoundingClientRect();
          if (r.width && (r.left < -0.5 || r.right > vw + 0.5)) bad.push((b.id || b.textContent.trim()) + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
        }
        return { over: document.documentElement.scrollWidth - vw, bad };
      });
      ok(lay.over <= 0 && lay.bad.length === 0, `${w}px: nichts ragt heraus (${lay.over} / ${lay.bad.join(', ')})`);
    }

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
