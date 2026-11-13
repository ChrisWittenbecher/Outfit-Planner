import { createHash } from 'node:crypto';

/**
 * Nachgestelltes Google für die Browser-Tests: Anmeldung, Token-Austausch (Hilfsdienst) und der App-Ordner in Google Drive.
 * @param {{ ORIGIN: string, W: string, ok: (cond: boolean, msg: string) => void }} cfg ORIGIN = Adresse der Testseite, W = Adresse des Hilfsdienstes
 */
export function fakeGoogle({ ORIGIN, W, ok }) {
  const G = 'https://www.googleapis.com';
  const fake = { files: new Map(), challenge: new Map(), calls: [], revoked: 0, refreshFails: false, uploads: 0 };
  const md5 = t => createHash('md5').update(t).digest('hex');
  const cors = { 'access-control-allow-origin': ORIGIN, 'access-control-allow-headers': 'authorization, content-type, x-upload-content-type', 'access-control-allow-methods': 'GET, POST, PUT, PATCH', 'access-control-expose-headers': 'location' };
  const jsonRes = (o, status = 200) => ({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(o) });

  async function setup(ctx, { clientId = 'test-client.apps.googleusercontent.com', patchPage = true } = {}) {
    const p = await ctx.newPage();
    const errors = [], failed = [], block = { on: false };
    p.on('pageerror', e => errors.push(e.message + ' @ ' + String(e.stack || '').replace(/\s+/g, ' ').slice(0, 400)));
    p.on('requestfailed', r => { const u = new URL(r.url()); if (u.origin === G) failed.push(r.method() + ' ' + u.pathname + ' ' + (r.failure()?.errorText || '')); });
    if (process.env.DEBUG) { p.on('console', m => console.log('  [console]', m.text())); p.on('requestfailed', r => console.log('  [failed]', r.method(), r.url(), r.failure()?.errorText)); }
    await p.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
    if (patchPage) {   // eigener Hilfsdienst und eigene Client-ID für die Seite (nicht nötig, wenn die echten Adressen nachgestellt werden)
      await p.route(`${ORIGIN}/js/config.js`, r => r.fulfill({ contentType: 'text/javascript', body: `export const WORKER_URL = '${W}'; export const GOOGLE_CLIENT_ID = '${clientId}';` }));
      await p.route(u => u.origin === ORIGIN && (u.pathname === '/' || u.pathname === '/index.html'), async r => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()).replace("connect-src 'self'", `connect-src 'self' ${W}`) }); });
    }
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
      if (path === '/auth/token' && fake.tokenFails) return r.fulfill(jsonRes({ error: 'upstream', detail: 'invalid_client' }, 502));
      if (path === '/auth/token') {
        const want = fake.challenge.get(body.code), got = createHash('sha256').update(body.verifier).digest('base64url');
        if (!want || want !== got) return r.fulfill(jsonRes({ error: 'invalid_grant' }, 400));
        return r.fulfill(jsonRes({ access_token: 'AT-1', expires_in: 3600, refresh_token: 'RT-secret-123456', scope: 'https://www.googleapis.com/auth/drive.appdata' }));
      }
      if (path === '/auth/refresh') return fake.refreshFails ? r.fulfill(jsonRes({ error: 'invalid_grant' }, 400)) : r.fulfill(jsonRes({ access_token: 'AT-2', expires_in: 3600 }));
      if (path === '/auth/revoke') { fake.revoked++; return r.fulfill(jsonRes({ ok: true })); }
      r.fulfill(jsonRes({ error: 'not_found' }, 404));
    });
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    await p.route('https://lh3.googleusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
    await p.route(`${G}/**`, async r => {
      const req = r.request(), u = new URL(req.url());
      if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
      if (block.on) return r.fulfill(jsonRes({ error: { errors: [{ reason: 'backendError' }] } }, 503));
      if (!/^Bearer AT-\d$/.test(req.headers().authorization || '')) return r.fulfill(jsonRes({ error: { errors: [{ reason: 'authError' }] } }, 401));
      const slot = [...fake.files.values()][0];
      if (u.pathname === '/drive/v3/about') { fake.calls.push('about ' + u.searchParams.get('fields')); return r.fulfill(jsonRes({ user: { displayName: 'Erika Muster', emailAddress: 'erika@example.org', photoLink: 'https://lh3.googleusercontent.com/a/test=s64' } })); }
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
    return { p, errors, failed, block };
  }
  return { fake, setup, md5 };
}
