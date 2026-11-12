import test from 'node:test';
import assert from 'node:assert/strict';
import { authUrl, b64url, challengeOf, randomToken, readReturn, redirectUri } from '../../js/cloudauth.js';
import { mergeData } from '../../js/syncmerge.js';

test('PKCE: Prüfwert entspricht dem Beispiel aus RFC 7636', async () => {
  assert.equal(await challengeOf('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('Zufallswerte: Base64url, ausreichend lang, jedes Mal anders', () => {
  const a = randomToken(), b = randomToken();
  assert.match(a, /^[A-Za-z0-9_-]{43,}$/); assert.notEqual(a, b);
  assert.equal(b64url(Uint8Array.from([251, 255, 254])), '-__-');
});

test('Rücksprungadresse: Ordner der App mit Schrägstrich', () => {
  assert.equal(redirectUri({ origin: 'https://outfit-planner.org', pathname: '/' }), 'https://outfit-planner.org/');
  assert.equal(redirectUri({ origin: 'https://outfit-planner.org', pathname: '/index.html' }), 'https://outfit-planner.org/');
  assert.equal(redirectUri({ origin: 'https://x.github.io', pathname: '/Outfit-Planner/index.html' }), 'https://x.github.io/Outfit-Planner/');
});

test('Anmelde-Adresse: Code-Fluss mit PKCE, nur App-Ordner, keine alten Rechte', () => {
  const u = new URL(authUrl({ clientId: 'id.apps.googleusercontent.com', redirect: 'https://outfit-planner.org/', state: 's1', challenge: 'c1' }));
  assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  const q = u.searchParams;
  assert.equal(q.get('response_type'), 'code'); assert.equal(q.get('code_challenge_method'), 'S256'); assert.equal(q.get('code_challenge'), 'c1');
  assert.equal(q.get('scope'), 'https://www.googleapis.com/auth/drive.appdata'); assert.equal(q.get('state'), 's1');
  assert.equal(q.get('access_type'), 'offline'); assert.equal(q.get('prompt'), 'consent'); assert.equal(q.get('include_granted_scopes'), 'false');
});

test('Rückkehr: Code oder Fehler nur mit state, sonst ignorieren', () => {
  assert.deepEqual(readReturn('?code=4%2Fabc&state=zz&scope=x'), { code: '4/abc', state: 'zz', error: '' });
  assert.deepEqual(readReturn('?error=access_denied&state=zz'), { code: '', state: 'zz', error: 'access_denied' });
  assert.equal(readReturn('?code=abc'), null); assert.equal(readReturn(''), null); assert.equal(readReturn('?state=zz'), null);
});

test('Zusammenführen: nichts geht verloren, dieses Gerät gewinnt bei gleicher Kennung', () => {
  const local = { items: [{ id: 'a', name: 'lokal' }, { id: 'b' }], outfits: [{ id: 'o1' }], wears: [{ day: '2026-11-01', o: 'o1' }], plans: { '2026-11-02': 'o1' }, board: [1] };
  const remote = { items: [{ id: 'a', name: 'cloud' }, { id: 'c' }], outfits: [{ id: 'o2' }], wears: [{ day: '2026-11-01', o: 'o1' }, { day: '2026-11-03', o: 'o2' }], plans: { '2026-11-02': 'o2', '2026-11-04': 'o2' } };
  const m = mergeData(local, remote);
  assert.deepEqual(m.items.map(i => i.id), ['a', 'b', 'c']); assert.equal(m.items[0].name, 'lokal');
  assert.deepEqual(m.outfits.map(o => o.id), ['o1', 'o2']);
  assert.equal(m.wears.length, 2);
  assert.deepEqual(m.plans, { '2026-11-02': 'o1', '2026-11-04': 'o2' });
  assert.deepEqual(m.board, [1]);
  assert.deepEqual(local.items.map(i => i.id), ['a', 'b']);   // Eingaben bleiben unverändert
});
