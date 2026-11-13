import { devices } from 'playwright';
import { PNG, checker, closed, engine, launch, startServer } from './helpers.mjs';

// Etappe 2: Wetter (Open-Meteo, nur mit Zustimmung), Anlass, Schalter. Der Wetterdienst wird nachgestellt, es geht nie etwas ins echte Netz.
const PORT = 8753, BASE = `http://localhost:${PORT}/index.html`;
const { ok, state: result } = checker();
const server = await startServer(PORT);
const browser = await launch();
const ready = p => p.waitForSelector('html[data-ready]', { state: 'attached' });
const wait = async (cond, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await cond()) return true; await new Promise(r => setTimeout(r, 50)); } return false; };
const IMG = 'data:image/png;base64,' + PNG.toString('base64');
const it = (id, name, cat, color, extra = {}) => ({ id, name, cat, color, img: IMG, link: '', price: 40, cur: 'EUR', tags: [], ...extra });
const backup = items => JSON.stringify({ items, outfits: [], wears: [] });
const BASIC = [
  it('t1', 'Weißes Shirt', 'Oberteil', 'Weiß', { tags: ['Büro'] }), it('t2', 'Schwarzes Shirt', 'Oberteil', 'Schwarz', { tags: ['Sport'] }), it('t3', 'Rote Bluse', 'Oberteil', 'Rot'),
  it('h1', 'Jeans', 'Hose/Rock', 'Blau'), it('h2', 'Schwarze Hose', 'Hose/Rock', 'Schwarz', { tags: ['Büro'] }), it('h3', 'Graue Hose', 'Hose/Rock', 'Grau', { tags: ['Sport'] }),
  it('j1', 'Wintermantel', 'Jacke', 'Schwarz', { tags: ['Winter'] }), it('j2', 'Regenjacke', 'Jacke', 'Gelb', { tags: ['wasserdicht'] }),
  it('s1', 'Sneaker', 'Schuhe', 'Weiß'), it('s2', 'Stiefel', 'Schuhe', 'Braun'), it('s3', 'Schwarze Schuhe', 'Schuhe', 'Schwarz', { tags: ['Büro'] }),
];
const GOOD = (over = {}) => ({ current: { temperature_2m: 11.4, apparent_temperature: 9.8, precipitation: 0.6, weather_code: 61, ...over }, hourly: { time: ['2026-11-13T20:00'], temperature_2m: [8.2] } });
const CORS = { 'access-control-allow-origin': '*' };

const hosts = new Set();
let wxCalls = [];
let wxMode = 'good';
const wxHandler = async route => {
  const req = route.request(); const h = req.headers();
  wxCalls.push({ url: req.url(), cookie: h.cookie, referer: h.referer, method: req.method() });
  if (wxMode === 'good') return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(GOOD()) });
  if (wxMode === 'sunny') return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(GOOD({ temperature_2m: 27, apparent_temperature: 28, precipitation: 0, weather_code: 0 })) });
  if (wxMode === '500') return route.fulfill({ status: 500, contentType: 'text/plain', headers: CORS, body: 'kaputt' });
  if (wxMode === 'garbage') return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: '{"current":{"temperature_2m":"heiß","weather_code":"x"}}' });
  if (wxMode === 'html') return route.fulfill({ status: 200, contentType: 'text/html', headers: CORS, body: '<html><script>alert(1)</script>' });
  if (wxMode === 'huge') return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify({ current: { temperature_2m: 5 }, pad: 'x'.repeat(90000) }) });
  if (wxMode === 'slow') { await new Promise(r => setTimeout(r, 1500)); return route.fulfill({ status: 200, contentType: 'application/json', headers: CORS, body: JSON.stringify(GOOD()) }); }
  return route.abort('failed');
};

/** Neue Sitzung mit Beispielschrank. geo: 'ok' | 'denied' | 'none' steuert den (nachgestellten) Standort. */
async function session(opts, items = BASIC, geo = 'ok') {
  const ctx = await browser.newContext({ acceptDownloads: true, ...opts });
  ctx.on('request', r => { const u = new URL(r.url()); if (!['localhost', '127.0.0.1'].includes(u.hostname) && !['data:', 'blob:'].includes(u.protocol)) hosts.add(u.hostname); });
  await ctx.route('https://api.open-meteo.com/**', wxHandler);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push('console: ' + m.text()); });
  await p.addInitScript(g => {
    window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));
    window.__geo = { mode: g, calls: 0, lat: 52.5200066, lon: 13.404954 };
    if (g !== 'none') Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition(okFn, errFn) {
        window.__geo.calls++;
        setTimeout(() => window.__geo.mode === 'ok' ? okFn({ coords: { latitude: window.__geo.lat, longitude: window.__geo.lon, accuracy: 20 } }) : errFn({ code: window.__geo.mode === 'denied' ? 1 : 2, message: 'x' }), 30);
      },
    } });
    else Object.defineProperty(navigator, 'geolocation', { configurable: true, value: undefined });
  }, geo);
  await p.goto(BASE); await ready(p);
  await p.setInputFiles('#impf', { name: 'bak.json', mimeType: 'application/json', buffer: Buffer.from(backup(items)) });
  await p.click('#uiOk'); await closed(p, 'uiDlg');
  await p.waitForFunction(n => document.querySelectorAll('#grid .card').length === n, items.length);
  return { ctx, p, errors };
}

const open = async p => { await p.click('#tab-vorschlaege'); await p.waitForFunction(() => !document.getElementById('view-vorschlaege').hidden); };
const openCtl = async p => { const sum = p.locator('#sugDet summary'); if (await sum.isVisible() && !(await p.locator('#sugDet').evaluate(d => d.open))) await sum.click(); };
const status = p => p.locator('#wxNow').evaluate(e => e.hidden ? '' : e.textContent.trim());
const pressed = (p, sel) => p.locator(sel + ' button[aria-pressed="true"]').evaluateAll(bs => bs.map(b => b.textContent.trim()));
const prefs = p => p.evaluate(() => localStorage.getItem('anprobe-sug'));
const cardSubs = p => p.locator('#sugCards .sug-sub').allTextContents();
const cardTitles = p => p.locator('#sugCards .sug-title').allTextContents();
const reasons = p => p.locator('#sugCards .sug-why li').allTextContents();

try {
  for (const [name, opts] of [['Desktop', { viewport: { width: 1280, height: 900 } }], ['iPhone 13', { ...devices['iPhone 13'] }]]) {
    const mobile = name !== 'Desktop';
    console.log('--- ' + name + ': Grundzustand');
    wxMode = 'good'; wxCalls = [];
    const { ctx, p, errors } = await session(opts);
    await open(p); await openCtl(p);
    ok(!(await p.locator('#wxOn').isChecked()), 'Schalter „Wetter von heute verwenden“ ist anfangs aus');
    ok(await p.locator('#wxPriv').isVisible() && /gerundet/.test(await p.textContent('#wxPriv')) && /nicht gespeichert/.test(await p.textContent('#wxPriv')), 'Datenschutzhinweis steht da, solange der Schalter aus ist');
    ok(!(await p.locator('#wxCredit').isVisible()), 'Quellenangabe erscheint erst mit Wetterdaten');
    ok(wxCalls.length === 0 && await p.evaluate(() => window.__geo.calls) === 0, 'ohne Zustimmung: keine Standortabfrage, keine Verbindung zum Wetterdienst');
    ok(await prefs(p) === null, 'noch nichts gespeichert');
    ok((await pressed(p, '.sug-w')).join() === 'Mild', 'Wetter von Hand: Mild');
    if (mobile) {
      const sum = (await p.textContent('#sugDetNow')).trim();
      ok(sum === 'Mild', 'Handy: Kurzfassung neben „Anpassen“ (' + sum + ')');
      ok(await p.locator('#sugCtl').evaluate(e => e.parentElement.id) === 'sugDetBody', 'Handy: Einstellungen liegen im aufklappbaren Block');
      ok(!(await p.locator('#sugSide').isVisible()), 'Handy: Seitenfeld ist weg');
    } else {
      ok(await p.locator('#sugCtl').evaluate(e => e.parentElement.id) === 'sugSide' && !(await p.locator('#sugDet').isVisible()), 'PC: Einstellungen stehen im Seitenfeld');
    }

    console.log('--- ' + name + ': Wetter einschalten');
    await p.check('#wxOn');
    ok(await wait(async () => /Jetzt 11 °C, leichter Regen/.test(await status(p))), 'Anzeige: Temperatur und Wetterlage (' + await status(p) + ')');
    ok(/Abend 8 °C/.test(await status(p)) && /„Regen“/.test(await status(p)), 'Abendwert und Stufe werden genannt');
    ok((await pressed(p, '.sug-w')).join() === 'Regen', 'Stufe „Regen“ ist gewählt');
    ok((await cardSubs(p)).every(s => /Regen$/.test(s)), 'Karten rechnen mit Regen (' + (await cardSubs(p)).join(' | ') + ')');
    ok(await p.locator('#wxCredit a[href="https://open-meteo.com/"][rel="noopener noreferrer"][target="_blank"]').isVisible(), 'Quellenangabe mit Link zu Open-Meteo.com');
    ok(await p.locator('#wxCredit a[href="https://creativecommons.org/licenses/by/4.0/"][rel="noopener noreferrer"]').isVisible(), 'Lizenz CC BY 4.0 ist verlinkt');
    ok(wxCalls.length === 1, 'genau eine Abfrage (' + wxCalls.length + ')');
    const u = new URL(wxCalls[0].url);
    ok(u.origin === 'https://api.open-meteo.com' && u.pathname === '/v1/forecast', 'Abfrage geht an api.open-meteo.com');
    ok(u.searchParams.get('latitude') === '52.5' && u.searchParams.get('longitude') === '13.4', 'Standort ist auf 0,1° gerundet (' + u.searchParams.get('latitude') + ', ' + u.searchParams.get('longitude') + ')');
    ok(!/52\.52|13\.40/.test(wxCalls[0].url), 'genauer Standort steht nirgends in der Adresse');
    ok(wxCalls[0].cookie === undefined && !wxCalls[0].referer && wxCalls[0].method === 'GET', 'ohne Cookies, ohne Referrer, nur GET');
    ok(!(await p.locator('#wxPriv').isVisible()), 'Datenschutzhinweis weicht der Anzeige');
    const stored = await prefs(p);
    ok(JSON.parse(stored).wx === true && !/52\.|13\.|lat|lon/i.test(stored), 'gespeichert wird nur der Schalter, kein Standort (' + stored + ')');
    if (mobile) ok(/Regen, 11 °C/.test(await p.textContent('#sugDetNow')), 'Handy: Kurzfassung zeigt Stufe und Temperatur');

    console.log('--- ' + name + ': von Hand ändern, ausschalten');
    await p.click('.sug-w button[data-w="warm"]:visible');
    ok((await pressed(p, '.sug-w')).join() === 'Warm' && /Du hast „Warm“ gewählt/.test(await status(p)), 'Handwahl überstimmt das Wetter und sagt es');
    await p.uncheck('#wxOn');
    ok(await wait(async () => (await status(p)) === ''), 'ausgeschaltet: Anzeige verschwindet');
    ok(JSON.parse(await prefs(p)).wx === false, 'Schalter „aus“ ist gespeichert');
    ok(!(await p.locator('#wxCredit').isVisible()) && await p.locator('#wxPriv').isVisible(), 'Quellenangabe weg, Datenschutzhinweis wieder da');
    const n0 = wxCalls.length;
    await p.click('.sug-w button[data-w="kalt"]:visible'); await p.click('#sugMore');
    ok(wxCalls.length === n0, 'danach keine weiteren Abfragen');

    console.log('--- ' + name + ': Neustart mit Schalter an');
    await p.check('#wxOn'); await wait(async () => /Jetzt/.test(await status(p)));
    const n1 = wxCalls.length;
    await p.click('#tab-schrank'); await wait(async () => (await p.evaluate(() => location.hash)) === '');
    await p.reload(); await ready(p); await new Promise(r => setTimeout(r, 600));
    ok(wxCalls.length === n1 && await p.evaluate(() => window.__geo.calls) === 0, 'Start im Schrank: nichts wird abgefragt (erst wenn die Seite „Vorschläge“ geöffnet wird)');
    await open(p); await openCtl(p);
    ok(await p.locator('#wxOn').isChecked(), 'Schalter ist nach dem Neustart noch an');
    ok(await wait(async () => /Jetzt 11 °C/.test(await status(p))), 'Wetter wird beim Öffnen der Seite geholt');
    ok(wxCalls.length === n1 + 1, 'eine neue Abfrage nach dem Neustart');
    await p.click('#tab-schrank'); await open(p);
    ok(wxCalls.length === n1 + 1, 'Reiterwechsel holt nicht erneut (Zwischenspeicher im Speicher)');
    // Startet die Seite gleich auf „Vorschläge“ (Lesezeichen, Neuladen dort), kommt das Wetter ebenfalls
    await p.reload(); await ready(p);
    ok(await wait(async () => /Jetzt 11 °C/.test(await status(p))) && wxCalls.length === n1 + 2, 'Start direkt auf „Vorschläge“: Wetter wird geholt (' + (wxCalls.length - n1) + ' Abfragen seit dem Neustart)');
    ok(errors.length === 0, 'keine Skriptfehler ' + errors.join(' | '));
    ok((await p.evaluate(() => window.__csp)).length === 0, 'keine CSP-Verstöße');
    await ctx.close();
  }

  console.log('--- Fehlerfälle');
  {
    wxCalls = [];
    const { ctx, p, errors } = await session({ viewport: { width: 1280, height: 900 } }, BASIC, 'denied');
    await open(p);
    await p.check('#wxOn');
    ok(await wait(async () => /Ohne Standort/.test(await status(p))), 'Standort verweigert: klare Meldung (' + await status(p) + ')');
    ok(!(await p.locator('#wxOn').isChecked()) && JSON.parse(await prefs(p)).wx === false, 'Schalter geht wieder aus und bleibt aus');
    ok(wxCalls.length === 0, 'Ohne Standort geht keine Abfrage hinaus');
    ok((await pressed(p, '.sug-w')).join() === 'Mild' && (await p.locator('#sugCards .sug').count()) === 3, 'Wahlknöpfe und Vorschläge funktionieren weiter');
    ok(!(await p.locator('#wxRetry').isVisible()), 'kein „Erneut versuchen“ bei verweigerter Erlaubnis');
    await ctx.close();
  }
  {
    const { ctx, p } = await session({ viewport: { width: 1280, height: 900 } }, BASIC, 'none');
    await open(p); await p.click('#wxOn');
    ok(await wait(async () => /kann seinen Standort nicht melden/.test(await status(p))), 'Gerät ohne Standortdienst: Meldung');
    ok(!(await p.locator('#wxOn').isChecked()), 'Schalter geht wieder aus');
    await ctx.close();
  }
  for (const [mode, re, label] of [['500', /antwortet gerade nicht/, 'Serverfehler (500)'], ['garbage', /nicht brauchbar/, 'unbrauchbare Zahlen'], ['html', /nicht brauchbar/, 'falscher Inhaltstyp (HTML)'], ['huge', /nicht brauchbar/, 'riesige Antwort'], ['abort', /ohne Netz/, 'Netzfehler']]) {
    wxMode = mode; wxCalls = [];
    const { ctx, p, errors } = await session({ viewport: { width: 1280, height: 900 } });
    await open(p); await p.check('#wxOn');
    ok(await wait(async () => re.test(await status(p))), label + ': Meldung (' + await status(p) + ')');
    ok(await p.locator('#wxOn').isChecked() && await p.locator('#wxRetry').isVisible(), label + ': Schalter bleibt an, „Erneut versuchen“ erscheint');
    ok((await pressed(p, '.sug-w')).join() === 'Mild' && (await p.locator('#sugCards .sug').count()) === 3, label + ': Stufe unverändert, Vorschläge laufen weiter');
    ok(!(await p.locator('#wxCredit').isVisible()), label + ': keine Quellenangabe ohne Daten');
    ok(errors.length === 0, label + ': keine Skriptfehler ' + errors.join(' | '));
    if (mode === '500') {
      wxMode = 'sunny';
      await p.click('#wxRetry');
      ok(await wait(async () => /Jetzt 27 °C, klar/.test(await status(p))), 'Erneut versuchen holt das Wetter (' + await status(p) + ')');
      ok((await pressed(p, '.sug-w')).join() === 'Warm' && !(await p.locator('#wxRetry').isVisible()), 'Stufe „Warm“, Knopf wieder weg');
    }
    await ctx.close();
  }
  {
    wxMode = 'slow'; wxCalls = [];
    const { ctx, p } = await session({ viewport: { width: 1280, height: 900 } });
    await open(p); await p.check('#wxOn');
    ok(await wait(async () => /werden geholt/.test(await status(p)), 1000), 'Ladeanzeige während der Abfrage');
    await p.uncheck('#wxOn');
    await new Promise(r => setTimeout(r, 2200));
    ok((await status(p)) === '' && (await pressed(p, '.sug-w')).join() === 'Mild', 'Ausschalten während des Ladens: späte Antwort wird verworfen');
    await ctx.close();
  }

  console.log('--- Anlass und Auswahl');
  wxMode = 'good';
  for (const [name, opts] of [['Desktop', { viewport: { width: 1280, height: 900 } }], ['iPhone 13', { ...devices['iPhone 13'] }]]) {
    const mobile = name !== 'Desktop';
    const { ctx, p, errors } = await session(opts);
    await open(p); await openCtl(p);
    ok((await pressed(p, '#occChips')).join() === 'Alle', name + ': Anlass anfangs „Alle“');
    await p.click('#occChips button[data-occ="Büro"]:visible');
    ok((await pressed(p, '#occChips')).join() === 'Büro', name + ': „Büro“ gewählt');
    ok((await reasons(p)).some(r => /mit „Büro“ markiert/.test(r)), name + ': Gründe nennen den Tag (' + (await reasons(p)).join(' | ') + ')');
    ok((await cardTitles(p)).some(t => /^Büro, /.test(t)), name + ': Karte heißt „Büro, …“ (' + (await cardTitles(p)).join(' | ') + ')');
    ok(!(await p.locator('#occHint').isVisible()), name + ': kein Hinweis, wenn Teile den Tag tragen');
    if (mobile) ok(/Mild · Büro/.test(await p.textContent('#sugDetNow')), name + ': Kurzfassung nennt den Anlass');
    const sport = await (async () => { await p.click('#occChips button[data-occ="Reise"]:visible'); return p.locator('#occHint').isVisible(); })();
    ok(sport && /Kein Teil trägt den Tag „Reise“/.test(await p.textContent('#occHint')) && /Tags/.test(await p.textContent('#occHint')), name + ': ohne passende Tags sagt die Seite es und nennt den Weg');
    ok((await p.locator('#sugCards .sug').count()) === 3, name + ': Vorschläge kommen trotzdem');
    // Sport-Teile bleiben bei anderen Anlässen zurück
    await p.click('#occChips button[data-occ="Büro"]:visible');
    const sportIn = async () => (await p.locator('#sugCards .sug-try').evaluateAll(bs => bs.map(b => b.getAttribute('aria-label')))).filter(l => /Schwarzes Shirt|Graue Hose/.test(l)).length;
    ok(await sportIn() === 0, name + ': Sport-Teile tauchen bei „Büro“ nicht auf');
    await p.click('#occChips button[data-occ="Sport"]:visible');
    ok(await sportIn() > 0, name + ': bei „Sport“ tauchen sie auf');
    await p.click('#occChips button[data-occ=""]:visible');
    ok((await pressed(p, '#occChips')).join() === 'Alle', name + ': „Alle“ hebt die Wahl auf');
    // Anprobieren mit Anlass
    await p.click('#occChips button[data-occ="Büro"]:visible');
    await p.locator('#sugCards .sug').first().locator('.sug-try').click();
    ok(await wait(async () => (await p.evaluate(() => document.documentElement.dataset.view)) === 'schrank'), name + ': „Anprobieren“ funktioniert mit Anlass');
    await open(p); await openCtl(p);

    console.log('--- ' + name + ': Schalter für Auswahl');
    const hasIdle = async () => (await reasons(p)).some(r => /noch nie getragen|lange nicht getragen/.test(r));
    await p.click('#occChips button[data-occ=""]:visible');
    ok(await p.locator('#optRare').isChecked() && await p.locator('#optOwn').isChecked(), name + ': „Selten Getragenes“ und „Nur Besitz“ sind anfangs an');
    ok(await hasIdle(), name + ': Gründe nennen Nichtgetragenes (' + (await reasons(p)).join(' | ') + ')');
    await p.uncheck('#optRare');
    ok(!(await hasIdle()) && /Gewählt nach Wetter und Farben\./.test(await p.textContent('#sugNote')), name + ': ohne „Selten Getragenes“ fehlt der Hinweis');
    ok(JSON.parse(await prefs(p)).rare === false, name + ': Wahl ist gespeichert');
    await p.reload(); await ready(p); await open(p); await openCtl(p);
    ok(!(await p.locator('#optRare').isChecked()) && await p.locator('#optOwn').isChecked(), name + ': Wahl bleibt nach Neustart');
    await p.check('#optRare');
    ok(JSON.parse(await prefs(p)).rare === true, name + ': wieder an');
    // Packliste: Anlass und Auswahl gehören nicht dazu, das Wetter schon
    await p.click('#sugModePack');
    ok(!(await p.locator('#occSec').isVisible()) && !(await p.locator('#optSec').isVisible()) && await p.locator('.sug-w button:visible').first().isVisible(), name + ': Packliste zeigt nur die Wetterwahl');
    await p.click('#sugModeOut');
    ok(await p.locator('#occSec').isVisible() && await p.locator('#optSec').isVisible(), name + ': Outfit-Ansicht zeigt Anlass und Auswahl wieder');
    if (mobile) {
      const sizes = await p.evaluate(() => [...document.querySelectorAll('#occChips button, .sug-w button, #wxOn, #optRare, #optOwn')].map(b => { const r = (b.closest('label') || b).getBoundingClientRect(); return Math.round(r.height); }));
      ok(sizes.every(h => h >= 40), name + ': Bedienelemente sind groß genug (' + sizes.join(',') + ')');
    }
    ok(errors.length === 0, name + ': keine Skriptfehler ' + errors.join(' | '));
    ok((await p.evaluate(() => window.__csp)).length === 0, name + ': keine CSP-Verstöße');
    await ctx.close();
  }

  console.log('--- Wunschteile');
  {
    const items = [
      it('t1', 'Weißes Shirt', 'Oberteil', 'Weiß'), it('t2', 'Rote Bluse', 'Oberteil', 'Rot'),
      it('w1', 'Traumhose', 'Hose/Rock', 'Schwarz', { status: 'wish' }),
      it('s1', 'Sneaker', 'Schuhe', 'Weiß'), it('s2', 'Stiefel', 'Schuhe', 'Braun'),
    ];
    const { ctx, p } = await session({ viewport: { width: 1280, height: 900 } }, items);
    await open(p);
    ok(/Es fehlen noch: Hose\/Rock/.test(await p.textContent('#sugNote')), 'Nur Besitz: fehlende Hose wird genannt');
    ok((await cardSubs(p)).every(s => !/Wunschteil/.test(s)), 'Nur Besitz: keine Wunschteile in den Vorschlägen');
    await p.uncheck('#optOwn');
    ok(await wait(async () => (await cardSubs(p)).some(s => /1 Wunschteil/.test(s))), 'ohne „Nur Besitz“: Wunschteil kommt vor und ist als solches benannt (' + (await cardSubs(p)).join(' | ') + ')');
    ok(!/Es fehlen noch/.test(await p.textContent('#sugNote')), 'Hinweis auf fehlende Hose entfällt');
    ok(JSON.parse(await prefs(p)).own === false, 'Wahl ist gespeichert');
    await p.locator('#sugCards .sug').first().locator('.sug-try').click();
    ok(await wait(async () => (await p.evaluate(() => document.documentElement.dataset.view)) === 'schrank'), 'Anprobieren mit Wunschteil klappt');
    ok(await wait(async () => (await p.locator('#board img.p').count()) >= 3), 'Wunschteil liegt auf dem Board');
    await ctx.close();
  }

  console.log('--- Größenwechsel und echter Standort');
  {
    wxMode = 'good';
    const { ctx, p } = await session({ viewport: { width: 1280, height: 900 } });
    await open(p); await p.check('#wxOn'); await wait(async () => /Jetzt/.test(await status(p)));
    await p.setViewportSize({ width: 390, height: 800 });
    ok(await wait(() => p.locator('#sugCtl').evaluate(e => e.parentElement.id === 'sugDetBody')), 'Schmaler: Block wandert in „Anpassen“');
    await openCtl(p);
    ok(await p.locator('#wxOn').isChecked() && /Jetzt 11 °C/.test(await status(p)), 'Zustand (Schalter, Anzeige) bleibt beim Verschieben');
    await p.setViewportSize({ width: 1280, height: 900 });
    ok(await wait(() => p.locator('#sugCtl').evaluate(e => e.parentElement.id === 'sugSide')) && await p.locator('#wxOn').isChecked(), 'Breiter: Block wandert zurück ins Seitenfeld');
    await ctx.close();
  }
  if (engine === 'chromium') {
    wxMode = 'good'; wxCalls = [];
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, geolocation: { latitude: 48.137154, longitude: 11.576124 }, permissions: ['geolocation'] });
    await ctx.route('https://api.open-meteo.com/**', wxHandler);
    const p = await ctx.newPage();
    await p.goto(BASE); await ready(p); await open(p); await p.check('#wxOn');
    ok(await wait(async () => /Jetzt 11 °C/.test(await status(p))), 'Echte Standort-Schnittstelle des Browsers liefert Wetter');
    ok(wxCalls.length === 1 && new URL(wxCalls[0].url).searchParams.get('latitude') === '48.1' && new URL(wxCalls[0].url).searchParams.get('longitude') === '11.6', 'gerundet auf 48,1 / 11,6');
    await ctx.close();
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p2 = await ctx2.newPage(); wxCalls = [];
    await ctx2.route('https://api.open-meteo.com/**', wxHandler);
    await p2.goto(BASE); await ready(p2); await open(p2); await p2.check('#wxOn');
    ok(await wait(async () => /Ohne Standort|nicht verfügbar|nicht rechtzeitig/.test(await status(p2)), 15000) && wxCalls.length === 0, 'Ohne Erlaubnis des Browsers: Meldung und keine Abfrage');
    await ctx2.close();
  }

  console.log('--- Nur die erlaubten Ziele');
  ok([...hosts].every(h => h === 'api.open-meteo.com'), 'ins Netz ging nur api.open-meteo.com (' + [...hosts].join(', ') + ')');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage(); const blocked = [];
    await p.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
    await p.goto(BASE); await ready(p);
    const r = await p.evaluate(async () => { try { await fetch('https://example.org/x'); return 'durch'; } catch { return 'blockiert'; } });
    ok(r === 'blockiert' && (await p.evaluate(() => window.__csp)).some(v => /connect-src/.test(v)), 'andere Adressen bleiben durch die CSP gesperrt');
    await ctx.close();
  }
} finally {
  await browser.close(); server.close();
}
console.log(result.fails ? `\n${result.fails} Prüfung(en) fehlgeschlagen` : '\nAlle Prüfungen bestanden');
process.exit(result.fails ? 1 : 0);
