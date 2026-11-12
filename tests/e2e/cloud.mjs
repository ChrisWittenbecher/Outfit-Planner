import { createHash } from 'node:crypto';
import { addItem, checker, launch, startServer } from './helpers.mjs';

const PORT = 8749, ORIGIN = `http://localhost:${PORT}`, W = 'https://anprobe.test.workers.dev', G = 'https://www.googleapis.com';
const { ok, state: result } = checker();
const server = await startServer(PORT);
const browser = await launch();
const wait = async (cond, ms = 25000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await cond()) return true; await new Promise(r => setTimeout(r, 100)); } return false; };

// ---- nachgestelltes Google: Anmeldung, Token-Austausch (Hilfsdienst) und Drive-App-Ordner ----
const fake = { files: new Map(), challenge: new Map(), calls: [], revoked: 0, refreshFails: false, uploads: 0 };
const md5 = t => createHash('md5').update(t).digest('hex');
const cors = { 'access-control-allow-origin': ORIGIN, 'access-control-allow-headers': 'authorization, content-type, x-upload-content-type', 'access-control-allow-methods': 'GET, POST, PUT, PATCH', 'access-control-expose-headers': 'location' };
const jsonRes = (o, status = 200) => ({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(o) });

async function setup(ctx, { clientId = 'test-client.apps.googleusercontent.com' } = {}) {
  const p = await ctx.newPage();
  const errors = [], block = { on: false };
  p.on('pageerror', e => errors.push(e.message));
  if (process.env.DEBUG) { p.on('console', m => console.log('  [console]', m.text())); p.on('requestfailed', r => console.log('  [failed]', r.method(), r.url(), r.failure()?.errorText)); }
  await p.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  await p.route(`${ORIGIN}/js/config.js`, r => r.fulfill({ contentType: 'text/javascript', body: `export const WORKER_URL = '${W}'; export const GOOGLE_CLIENT_ID = '${clientId}';` }));
  await p.route(u => u.origin === ORIGIN && (u.pathname === '/' || u.pathname === '/index.html'), async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace("connect-src 'self'", `connect-src 'self' ${W}`) }); });
  await p.route('https://accounts.google.com/**', r => {
    const u = new URL(r.request().url()), q = u.searchParams;
    fake.calls.push('auth ' + q.get('scope') + ' ' + q.get('code_challenge_method'));
    fake.challenge.set('CODE-' + fake.challenge.size, q.get('code_challenge'));
    const code = 'CODE-' + (fake.challenge.size - 1);
    r.fulfill({ status: 200, contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(`${q.get('redirect_uri')}?code=${code}&scope=x&state=${q.get('state')}`)})</script>` });
  });
  await p.route(`${W}/auth/**`, async r => {
    const req = r.request(), path = new URL(req.url()).pathname;
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    const body = req.postDataJSON(); fake.calls.push('worker ' + path);
    if (path === '/auth/token') {
      const want = fake.challenge.get(body.code), got = createHash('sha256').update(body.verifier).digest('base64url');
      if (!want || want !== got) return r.fulfill(jsonRes({ error: 'invalid_grant' }, 400));
      return r.fulfill(jsonRes({ access_token: 'AT-1', expires_in: 3600, refresh_token: 'RT-secret-123456', scope: 'https://www.googleapis.com/auth/drive.appdata' }));
    }
    if (path === '/auth/refresh') return fake.refreshFails ? r.fulfill(jsonRes({ error: 'invalid_grant' }, 400)) : r.fulfill(jsonRes({ access_token: 'AT-2', expires_in: 3600 }));
    if (path === '/auth/revoke') { fake.revoked++; return r.fulfill(jsonRes({ ok: true })); }
    r.fulfill(jsonRes({ error: 'not_found' }, 404));
  });
  await p.route(`${G}/**`, async r => {
    const req = r.request(), u = new URL(req.url());
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
    if (block.on) return r.fulfill(jsonRes({ error: { errors: [{ reason: 'backendError' }] } }, 503));
    if (!/^Bearer AT-\d$/.test(req.headers().authorization || '')) return r.fulfill(jsonRes({ error: { errors: [{ reason: 'authError' }] } }, 401));
    const slot = [...fake.files.values()][0];
    if (u.pathname === '/drive/v3/files' && req.method() === 'GET') {
      ok(u.searchParams.get('spaces') === 'appDataFolder', 'Suche nur im App-Ordner');
      return r.fulfill(jsonRes({ files: slot ? [{ id: slot.id, md5Checksum: slot.md5, modifiedTime: slot.t, size: String(slot.text.length) }] : [] }));
    }
    if (u.pathname.startsWith('/drive/v3/files/') && u.searchParams.get('alt') === 'media') return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: slot.text });
    if (u.pathname.startsWith('/upload/drive/v3/files') && u.searchParams.get('uploadType') === 'resumable') {
      if (req.method() === 'PUT') {
        fake.uploads++;
        const text = req.postData() || '', id = slot?.id || 'file-1';
        fake.files.set(id, { id, text, md5: md5(text), t: new Date().toISOString() });
        return r.fulfill(jsonRes({ id, md5Checksum: md5(text), modifiedTime: fake.files.get(id).t }));
      }
      if (req.method() === 'POST') { const meta = req.postDataJSON(); ok(Array.isArray(meta.parents) && meta.parents[0] === 'appDataFolder', 'neue Datei liegt im App-Ordner'); }
      return r.fulfill({ status: 200, headers: { ...cors, location: `${G}/upload/drive/v3/files?uploadType=resumable&upload_id=${Date.now()}` }, body: '' });
    }
    if (u.pathname.startsWith('/upload/drive/v3/files') && req.method() === 'PUT') {
      fake.uploads++;
      const text = req.postData() || '', id = slot?.id || 'file-1';
      fake.files.set(id, { id, text, md5: md5(text), t: new Date().toISOString() });
      return r.fulfill(jsonRes({ id, md5Checksum: md5(text), modifiedTime: fake.files.get(id).t }));
    }
    r.fulfill(jsonRes({ error: 'nope' }, 404));
  });
  return { p, errors, block };
}
const names = text => JSON.parse(text).items.map(i => i.name).sort();
const remoteNames = () => { const f = [...fake.files.values()][0]; return f ? names(f.text) : null; };
const cards = p => p.locator('#grid .card').count();
const signIn = async p => { await p.click('#cloudBtn'); await p.waitForFunction(() => document.getElementById('cloudDlg').open); await p.click('#cloudIn'); await p.waitForSelector('html[data-ready]', { state: 'attached' }); };

try {
  console.log('--- ohne Google-Einrichtung');
  let ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let { p } = await setup(ctx, { clientId: '' });
  await p.goto(`${ORIGIN}/index.html`); await p.waitForSelector('html[data-ready]', { state: 'attached' });
  ok(await p.evaluate(() => document.getElementById('cloudBtn').hidden && document.getElementById('mCloud').hidden), 'ohne Client-ID bleibt die Google-Sicherung ausgeblendet');
  await ctx.close();

  console.log('--- Gerät A: anmelden und sichern');
  const ctxA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const A = await setup(ctxA); const a = A.p;
  await a.goto(`${ORIGIN}/index.html`); await a.waitForSelector('html[data-ready]', { state: 'attached' });
  await addItem(a, { trigger: '#addBtn', name: 'Shirt', cat: 'Oberteil' });
  await addItem(a, { trigger: '#addBtn', name: 'Hose', cat: 'Hose/Rock' });
  ok(await a.evaluate(() => !document.getElementById('cloudBtn').hidden) && await a.textContent('#cloudBtn') === 'Google', 'Knopf „Google“ ist da');
  await a.click('#cloudBtn'); await a.waitForFunction(() => document.getElementById('cloudDlg').open);
  ok(/versteckten Ordner/.test(await a.textContent('#cloudText')), 'Dialog erklärt, dass nur ein versteckter Ordner genutzt wird');
  await a.click('#cloudIn');
  ok(await wait(async () => remoteNames()?.join() === 'Hose,Shirt'), 'nach der Anmeldung liegen beide Teile in Google Drive: ' + remoteNames());
  ok(!/code=|state=/.test(a.url()), 'Code und state sind aus der Adresszeile verschwunden');
  ok(fake.calls.some(c => c === 'auth https://www.googleapis.com/auth/drive.appdata S256'), 'Anmeldung fragt nur das App-Ordner-Recht an, mit PKCE (S256)');
  const stored = await a.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage } }));
  ok(/RT-secret-123456/.test(stored) && !/AT-1|AT-2/.test(stored), 'nur der Auffrisch-Schlüssel wird gespeichert, kein Zugriffstoken');
  ok(!/verifier/.test(await a.evaluate(() => JSON.stringify({ ...sessionStorage }))), 'Verifier ist nach der Rückkehr gelöscht');
  ok(await a.textContent('#cloudBtn') === 'Google ✓', 'Knopf zeigt „Google ✓“');

  console.log('--- Änderung wird automatisch gesichert');
  await a.keyboard.press('Escape');
  await addItem(a, { trigger: '#addBtn', name: 'Mantel', cat: 'Jacke' });
  ok(await wait(async () => remoteNames()?.join() === 'Hose,Mantel,Shirt', 30000), 'neues Teil landet von selbst in Google Drive (' + remoteNames() + ')');

  console.log('--- Gerät B: neu anmelden und alles bekommen');
  const ctxB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const B = await setup(ctxB); const b = B.p;
  await b.goto(`${ORIGIN}/index.html`); await b.waitForSelector('html[data-ready]', { state: 'attached' });
  ok(await cards(b) === 0, 'Gerät B startet leer');
  await b.click('#cloudBtn'); await b.waitForFunction(() => document.getElementById('cloudDlg').open); await b.click('#cloudIn');
  ok(await wait(async () => await cards(b) === 3), 'Gerät B holt drei Teile von Google (ohne Rückfrage)');
  ok(await b.locator('#grid .card img').first().evaluate(i => i.complete && i.naturalWidth > 0), 'Bilder sind angekommen');

  console.log('--- B ändert, A holt den Stand');
  await b.keyboard.press('Escape');
  await b.locator('#grid .card', { hasText: 'Hose' }).hover();
  await b.locator('#grid .card', { hasText: 'Hose' }).locator('.acts button[aria-label="Löschen"]').click().catch(() => {});
  const confirmBtn = b.locator('#uiOk'); if (await confirmBtn.isVisible().catch(() => false)) await confirmBtn.click();
  ok(await wait(async () => remoteNames()?.join() === 'Mantel,Shirt', 30000), 'Löschen auf B erreicht Google Drive (' + remoteNames() + ')');
  await a.click('#cloudBtn'); await a.waitForFunction(() => document.getElementById('cloudDlg').open); await a.click('#cloudSync');
  ok(await wait(async () => await cards(a) === 2), 'A holt den neuen Stand beim Abgleichen (ohne Rückfrage, weil A nichts geändert hat)');

  console.log('--- Konflikt: beide ändern');
  await a.keyboard.press('Escape');
  A.block.on = true;   // A kann gerade nicht sichern (z. B. kein Netz)
  await addItem(a, { trigger: '#addBtn', name: 'Schal', cat: 'Accessoire' });
  await addItem(b, { trigger: '#addBtn', name: 'Mütze', cat: 'Accessoire' });
  ok(await wait(async () => remoteNames()?.includes('Mütze'), 30000), 'B sichert zuerst');
  A.block.on = false;
  await a.click('#cloudBtn'); await a.waitForFunction(() => document.getElementById('cloudDlg').open); await a.click('#cloudSync');
  ok(await wait(() => a.evaluate(() => document.getElementById('cloudConflict').open)), 'A fragt nach, weil beide Seiten Änderungen haben');
  ok(/zusammenführen/i.test(await a.textContent('#ccMerge')) && await a.locator('#ccRemote').isVisible() && await a.locator('#ccLocal').isVisible(), 'drei Möglichkeiten werden angeboten');
  await a.click('#ccMerge');
  ok(await wait(async () => remoteNames()?.join() === 'Mantel,Mütze,Schal,Shirt'), 'zusammengeführt: nichts ging verloren (' + remoteNames() + ')');
  ok(await wait(async () => await cards(a) === 4), 'A zeigt alle vier Teile');

  console.log('--- Sicherheit');
  const before = fake.calls.filter(c => c === 'worker /auth/token').length;
  await a.goto(`${ORIGIN}/index.html?code=CODE-0&state=gefaelscht`); await a.waitForSelector('html[data-ready]', { state: 'attached' });
  ok(fake.calls.filter(c => c === 'worker /auth/token').length === before, 'gefälschte Rückkehr (falscher state) wird ignoriert');
  ok(!/code=/.test(a.url()), 'und sofort aus der Adresszeile entfernt');
  fake.refreshFails = true; await a.evaluate(() => { /* Zugriffstoken verfällt: neue Seite */ });
  await a.reload(); await a.waitForSelector('html[data-ready]', { state: 'attached' });
  ok(await wait(async () => !(await a.evaluate(() => localStorage.getItem('anprobe-cloud')))?.includes('RT-secret'), 8000), 'abgelaufene Anmeldung (invalid_grant) löscht den Schlüssel');
  ok(await wait(() => a.locator('.toast', { hasText: 'Anmeldung ist abgelaufen' }).count().then(n => n > 0), 8000), 'und meldet das mit Knopf zum Neu-Anmelden');
  fake.refreshFails = false;

  console.log('--- Abmelden');
  await a.click('#cloudBtn'); await a.waitForFunction(() => document.getElementById('cloudDlg').open);
  await signInAgain(a);
  async function signInAgain(page) { await page.click('#cloudIn'); await page.waitForSelector('html[data-ready]', { state: 'attached' }); await wait(() => page.evaluate(() => (localStorage.getItem('anprobe-cloud') || '').includes('RT-secret'))); }
  await a.click('#cloudBtn'); await a.waitForFunction(() => document.getElementById('cloudDlg').open);
  await a.click('#cloudOut'); await a.waitForFunction(() => document.getElementById('uiDlg').open); await a.click('#uiOk');
  ok(await wait(async () => fake.revoked === 1), 'Abmelden widerruft den Zugriff bei Google');
  ok(await a.evaluate(() => localStorage.getItem('anprobe-cloud')) === null, 'Schlüssel ist gelöscht');
  ok(await cards(a) === 4 && remoteNames().length === 4, 'Daten hier und in Google Drive bleiben erhalten');

  for (const [n, pg, errs] of [['A', a, A.errors], ['B', b, B.errors]]) {
    ok(errs.length === 0, 'keine Skriptfehler auf ' + n + ' ' + errs.join(' | '));
    ok((await pg.evaluate(() => window.__csp)).length === 0, 'keine CSP-Verstöße auf ' + n + ' ' + JSON.stringify(await pg.evaluate(() => window.__csp)));
  }
} finally {
  await browser.close();
  server.close();
}
console.log(result.fails ? result.fails + ' FEHLER' : 'ALLES OK');
process.exit(result.fails ? 1 : 0);
