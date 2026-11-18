import { devices } from 'playwright';
import { checker, closed, engine, launch, startServer } from './helpers.mjs';

// Rückmeldung: Hinweis in der Fußzeile, Dialog für Fehler und Wünsche, vorausgefülltes GitHub-Issue (kein Versand durch die App).
const PORT = 8768, BASE = `http://localhost:${PORT}/index.html`, REPO = '/ChrisWittenbecher/Outfit-Planner/issues/new';
const { ok, state: result } = checker();
const server = await startServer(PORT);
const browser = await launch();
const ready = p => p.waitForSelector('html[data-ready]', { state: 'attached' });
const wait = async (cond, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await cond()) return true; await new Promise(r => setTimeout(r, 40)); } return false; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

try {
  for (const [name, opts] of [['iPhone 13', { ...devices['iPhone 13'], permissions: [] }], ['Desktop', { viewport: { width: 1280, height: 900 } }]]) {
    const mobile = name !== 'Desktop';
    console.log('--- ' + name);
    const ctx = await browser.newContext(opts);
    if (engine === 'chromium') await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://localhost:${PORT}` });
    const github = [], external = [];
    ctx.on('request', r => {
      const u = new URL(r.url());
      if (u.hostname === 'github.com') github.push(r.url());
      else if (!/^(localhost|127\.0\.0\.1)$/.test(u.hostname) && u.protocol.startsWith('http')) external.push(r.url());
    });
    await ctx.route('https://github.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>GitHub (Nachbau im Test)</title>' }));
    const p = await ctx.newPage();
    const errors = [], native = [];
    p.on('pageerror', e => errors.push(e.message));
    p.on('dialog', d => { native.push(d.type()); d.dismiss(); });
    await p.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
    await p.goto(BASE); await ready(p);

    const isOpen = () => p.evaluate(() => document.getElementById('fbDlg').open);
    const open = async () => { await p.locator('#fbBtn').scrollIntoViewIfNeeded(); await p.click('#fbBtn'); await p.waitForFunction(() => document.getElementById('fbDlg').open); };
    const close = async () => { await p.click('#fbClose'); return closed(p, 'fbDlg'); };
    const err = () => p.evaluate(() => { const e = document.getElementById('fbErr'); return e.hidden ? '' : e.textContent.trim(); });
    const status = async () => { await wait(() => p.evaluate(() => { const e = document.getElementById('fbStatus'); return !e.hidden && e.textContent.trim() !== ''; }), 1500); return p.evaluate(() => { const e = document.getElementById('fbStatus'); return e.hidden ? '' : e.textContent.trim(); }); };
    const calm = () => p.evaluate(() => Promise.all(document.getAnimations().filter(a => a.effect.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {}))));
    /** Klickt „Auf GitHub öffnen“ und gibt die Adresse zurück, die geöffnet wurde. */
    const send = async () => {
      const before = github.length;
      await p.click('#fbSend');
      if (!await wait(() => github.length > before, 8000)) return null;
      return new URL(github[github.length - 1]);
    };

    console.log('--- Hinweis in der Fußzeile');
    await p.locator('#fbBtn').scrollIntoViewIfNeeded();
    ok(await p.locator('.ver--fb').isVisible(), 'Hinweis ist sichtbar');
    ok(/Fehler gefunden oder eine Idee\?/.test(await p.textContent('.ver--fb')), 'Text: Fehler gefunden oder eine Idee?');
    ok((await p.textContent('#fbBtn')).trim() === 'Rückmeldung geben', 'Schaltfläche „Rückmeldung geben“');
    const fb = await p.locator('#fbBtn').boundingBox(), ver = await p.locator('.ver:not(.ver--fb)').boundingBox();
    ok(fb && ver && fb.y < ver.y, 'steht über der Versionszeile');
    ok(!await isOpen() && github.length === 0, 'vor dem Klick ist nichts offen und nichts an GitHub gegangen');

    if (mobile) {
      await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await sleep(400);
      const hit = await p.evaluate(() => {
        const f = document.getElementById('fab').getBoundingClientRect(), out = [];
        if (getComputedStyle(document.getElementById('fab')).display === 'none') return out;
        for (const id of ['fbBtn', 'updBtn']) { const b = document.getElementById(id).getBoundingClientRect(); if (b.left < f.right && b.right > f.left && b.top < f.bottom && b.bottom > f.top) out.push(id); }
        return out;
      });
      ok(hit.length === 0, 'am Seitenende verdeckt die Schaltfläche „+“ keinen Link der Fußzeile: ' + hit.join(' '));
    }

    console.log('--- Dialog öffnen');
    await open();
    ok(await p.locator('#fbDlg').isVisible(), 'Dialog ist offen');
    ok((await p.textContent('#fbTitle')).trim() === 'Fehler oder Anregung', 'Überschrift');
    ok(await p.getAttribute('#fbBug', 'aria-pressed') === 'true' && await p.getAttribute('#fbIdea', 'aria-pressed') === 'false', 'Fehler ist vorgewählt');
    ok(/Öffentlich sichtbar/.test(await p.textContent('.fb-note')) && /GitHub-Konto/.test(await p.textContent('.fb-note')), 'Hinweis: öffentlich, GitHub-Konto nötig');
    ok(await p.isChecked('#fbInfo'), 'Version und Gerät anhängen ist vorgewählt');
    const focusId = await p.evaluate(() => document.activeElement.id || document.activeElement.tagName);
    ok(focusId !== 'fbTitleIn' || !mobile, `kein Tastaturfokus beim Öffnen am Handy (Fokus: ${focusId})`);
    ok(await p.evaluate(() => document.getElementById('fbDlg').contains(document.activeElement)), 'Fokus liegt im Dialog');

    console.log('--- Prüfung der Eingaben');
    ok(await send() === null && github.length === 0, 'leer: nichts wird geöffnet');
    ok(/Titel/.test(await err()), `Fehlermeldung zum Titel: ${await err()}`);
    ok(await p.getAttribute('#fbTitleIn', 'aria-invalid') === 'true' && await p.evaluate(() => document.activeElement.id) === 'fbTitleIn', 'Titel markiert und fokussiert');
    await p.fill('#fbTitleIn', 'ab');
    ok(await err() === '', 'beim Tippen verschwindet die Meldung');
    ok(await p.getAttribute('#fbTitleIn', 'aria-invalid') === null, 'und die Markierung');
    await p.click('#fbSend');
    ok(/Titel/.test(await err()), 'zwei Zeichen sind zu wenig');
    await p.fill('#fbTitleIn', 'Speichern geht nicht');
    await p.click('#fbSend');
    ok(/beschreibe/i.test(await err()) && await p.evaluate(() => document.activeElement.id) === 'fbText', 'ohne Beschreibung: Meldung, Fokus im Text');
    await p.fill('#fbText', 'kurz');
    await p.click('#fbSend');
    ok(/zehn Zeichen/.test(await err()), 'zu kurze Beschreibung wird abgelehnt');
    ok(github.length === 0, 'bisher ging nichts an GitHub');
    ok((await p.locator('#fbErr').getAttribute('role')) === 'alert', 'Fehlermeldung wird angesagt (role=alert)');

    console.log('--- Enter im Titel schickt nichts');
    await p.focus('#fbTitleIn'); await p.keyboard.press('Enter');
    ok(await p.evaluate(() => document.activeElement.id) === 'fbText' && github.length === 0, 'Enter springt zur Beschreibung');

    console.log('--- Fehler an GitHub übergeben');
    await p.fill('#fbText', 'Wenn ich auf Speichern tippe, passiert nichts. Erwartet hatte ich ein neues Teil.');
    let u = await send();
    ok(!!u, 'GitHub wird in einem neuen Tab angefragt');
    ok(u && u.origin === 'https://github.com' && u.pathname === REPO, 'feste Adresse: github.com' + REPO);
    ok(u && u.searchParams.get('labels') === 'bug', 'Label bug');
    ok(u && u.searchParams.get('title') === 'Speichern geht nicht', 'Titel übernommen');
    const body = u ? u.searchParams.get('body') : '';
    ok(/### Fehler\n\nWenn ich auf Speichern tippe/.test(body), 'Beschreibung übernommen');
    ok(/### Angaben aus der App/.test(body) && /- Version: \d+\.\d+\.\d+/.test(body) && /- Bildschirm: \d+×\d+/.test(body) && /- Gerät: /.test(body) && /- Anzeige: /.test(body), 'Angaben: Version, Anzeige, Bildschirm, Gerät');
    const shown = await p.evaluate(() => document.getElementById('ver').textContent);
    ok(body.includes('- Version: ' + shown), `Version stimmt mit der Anzeige überein (${shown})`);
    ok(await isOpen(), 'der Dialog bleibt offen, der Text geht nicht verloren');
    ok(/Submit new issue/.test(await status()) && /noch/.test(await status()), `Hinweis: auf GitHub noch abschicken (${await status()})`);
    ok(await err() === '', 'das ist keine Fehlermeldung');
    ok(github.filter(x => !x.includes('/issues/new')).length === 0, 'außer der Issue-Seite wurde nichts an GitHub gesendet');
    ok(external.length === 0, 'und die App selbst fragt keine fremde Adresse an: ' + external.join(' '));

    await p.fill('#fbTitleIn', ''); await p.click('#fbSend');
    ok(/Titel/.test(await err()) && await p.evaluate(() => document.getElementById('fbStatus').hidden), 'ein Fehler blendet die frühere Erfolgsmeldung aus');
    await p.fill('#fbTitleIn', 'Speichern geht nicht');

    console.log('--- Wunsch ohne Angaben');
    await p.click('#fbIdea');
    ok(await p.getAttribute('#fbIdea', 'aria-pressed') === 'true' && await p.getAttribute('#fbBug', 'aria-pressed') === 'false', 'Wunsch ist gewählt');
    ok(/Was wünschst du dir/.test(await p.textContent('#fbTextLabel')), 'Frage wechselt mit');
    await p.uncheck('#fbInfo');
    u = await send();
    ok(u && u.searchParams.get('labels') === 'enhancement', 'Label enhancement');
    ok(u && /### Wunsch\n\n/.test(u.searchParams.get('body')) && !/Angaben aus der App/.test(u.searchParams.get('body')), 'Überschrift Wunsch, keine Angaben ohne Häkchen');
    ok(u && !u.searchParams.get('body').includes('Mozilla') && !u.searchParams.get('body').includes('Version'), 'weder Gerät noch Version ohne Häkchen');
    await p.check('#fbInfo');

    console.log('--- Sonderzeichen bleiben Text');
    await p.fill('#fbTitleIn', 'Idee & Test #1 ?x=y');
    await p.fill('#fbText', 'Zeile 1\nZeile 2 mit Umlauten äöü ß und 😀 und &labels=evil&title=x #hash %41 <b>fett</b>');
    u = await send();
    ok(u && u.pathname === REPO && u.hash === '', 'Pfad und Anker bleiben fest');
    ok(u && [...u.searchParams.keys()].sort().join() === 'body,labels,title', 'nur labels, title, body');
    ok(u && u.searchParams.get('labels') === 'enhancement', 'Eingaben ändern das Label nicht');
    ok(u && u.searchParams.get('title') === 'Idee & Test #1 ?x=y', 'Titel unverändert');
    ok(u && u.searchParams.get('body').includes('Zeile 1\nZeile 2 mit Umlauten äöü ß und 😀 und &labels=evil&title=x #hash %41 <b>fett</b>'), 'Beschreibung unverändert, mit Zeilenumbruch');

    console.log('--- Zu langer Text');
    await p.fill('#fbText', '漢 '.repeat(740));
    const n0 = github.length; u = await send();
    ok(u && github.length === n0 + 1 && u.href.length <= 6500, `Adresse bleibt kurz genug (${u && u.href.length})`);
    ok(/gekürzt/.test(await status()) && /Text kopieren/.test(await status()), 'Hinweis: gekürzt, „Text kopieren“ nennt den ganzen Text');

    console.log('--- Text kopieren');
    await p.fill('#fbText', 'Der Kalender zeigt den falschen Monat. Passiert nur am Monatsende.');
    await p.click('#fbCopy');
    ok(await wait(async () => /kopiert|nicht geklappt/.test(await status())), 'Rückmeldung zum Kopieren');
    if (engine === 'chromium') {
      const clip = await p.evaluate(() => navigator.clipboard.readText());
      ok(clip.startsWith('Idee & Test #1 ?x=y\n\n### Wunsch\n\nDer Kalender zeigt den falschen Monat'), 'Zwischenablage: Titel, Leerzeile, Meldung');
    } else console.log('INFO  Zwischenablage lesen nur in Chromium');
    const n1 = github.length; await p.click('#fbCopy'); await sleep(300);
    ok(github.length === n1, 'Kopieren öffnet GitHub nicht');

    console.log('--- Layout');
    for (const w of [320, 360, 390, 768, 1280]) {
      await p.setViewportSize({ width: w, height: 800 }); await sleep(250); await calm();
      const lay = await p.evaluate(() => {
        const d = document.getElementById('fbDlg'), r = d.getBoundingClientRect(), out = [];
        for (const id of ['fbSend', 'fbCopy', 'fbClose', 'fbBug', 'fbIdea', 'fbTitleIn', 'fbText']) {
          const b = document.getElementById(id).getBoundingClientRect();
          if (b.left < r.left - 1 || b.right > r.right + 1) out.push(id + ' ragt seitlich heraus');
          if (b.width < 60) out.push(id + ' zu schmal (' + Math.round(b.width) + ')');
        }
        const wide = [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 6).map(e => (e.id ? '#' + e.id : e.tagName.toLowerCase() + '.' + e.className) + ' ' + Math.round(e.getBoundingClientRect().right));
        return { over: document.documentElement.scrollWidth > innerWidth, out, h: r.height <= innerHeight + 1, info: `scrollWidth ${document.documentElement.scrollWidth}, innerWidth ${innerWidth}, Dialog ${Math.round(r.width)}×${Math.round(r.height)}, innerHeight ${innerHeight}, max-height ${getComputedStyle(d).maxHeight}, zu breit: ${wide.join('; ')}` };
      });
      ok(!lay.over && lay.out.length === 0 && lay.h, `${w} px: nichts ragt heraus, Dialog passt in die Höhe ${lay.out.join(', ')} [${lay.info}]`);
    }
    await p.setViewportSize(opts.viewport || { width: 390, height: 844 }); await sleep(250); await calm();
    if (mobile) {
      const small = await p.evaluate(() => ['fbSend', 'fbCopy', 'fbClose', 'fbBug', 'fbIdea', 'fbTitleIn'].map(id => [id, document.getElementById(id).getBoundingClientRect().height]).filter(([, h]) => h < 39.5));
      ok(small.length === 0, 'Bedienelemente groß genug (mindestens 40 px): ' + JSON.stringify(small));
    }

    console.log('--- Schließen und Wiederkehr');
    await p.fill('#fbTitleIn', 'Nicht abgeschickt'); await p.fill('#fbText', 'Dieser Text soll erhalten bleiben, wenn ich nur schließe.');
    ok(await close(), 'Abbrechen schließt');
    ok(await p.evaluate(() => document.activeElement.id) === 'fbBtn', 'Fokus kehrt zur Schaltfläche zurück');
    await open();
    ok(await p.inputValue('#fbTitleIn') === 'Nicht abgeschickt' && (await p.inputValue('#fbText')).startsWith('Dieser Text soll'), 'ein nicht abgeschickter Entwurf bleibt erhalten');
    await p.keyboard.press('Escape');
    ok(await closed(p, 'fbDlg'), 'Esc schließt');
    await open();
    await p.goBack();
    ok(await closed(p, 'fbDlg'), 'Zurück schließt den Dialog, die Seite bleibt');
    ok(new URL(p.url()).pathname === '/index.html', 'und bleibt auf der App');
    await open(); u = await send();
    ok(!!u, 'abgeschickt');
    await close(); await open();
    ok(await p.inputValue('#fbTitleIn') === '' && await p.inputValue('#fbText') === '', 'nach dem Absenden beginnt ein neuer Dialog leer');
    ok(await p.evaluate(() => document.getElementById('fbStatus').hidden && document.getElementById('fbErr').hidden), 'ohne alte Meldungen');
    await close();

    console.log('--- Tastatur');
    await open();
    await p.keyboard.press('Tab');
    const order = [];
    for (let i = 0; i < 9; i++) { order.push(await p.evaluate(() => document.activeElement.id)); await p.keyboard.press('Tab'); }
    ok(['fbBug', 'fbIdea', 'fbTitleIn', 'fbText', 'fbInfo', 'fbSend', 'fbCopy', 'fbClose'].every(id => order.includes(id)), 'alle Bedienelemente per Tab erreichbar: ' + order.join(' '));
    ok(await p.evaluate(() => document.getElementById('fbDlg').contains(document.activeElement)), 'der Fokus bleibt im Dialog');
    await close();

    console.log('--- Fehlerfreiheit');
    ok(errors.length === 0, 'keine Skriptfehler: ' + errors.join(' | '));
    ok((await p.evaluate(() => window.__csp)).length === 0, 'keine CSP-Verstöße');
    ok(native.length === 0, 'keine nativen Dialoge');
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(result.fails ? result.fails + ' FEHLER' : 'ALLES OK');
process.exit(result.fails ? 1 : 0);
