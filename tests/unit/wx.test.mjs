import test from 'node:test';
import assert from 'node:assert/strict';
import { CACHE_MS, MESSAGES, getWeather, resetCache } from '../../js/wx.js';

const GOOD = { current: { temperature_2m: 11.4, apparent_temperature: 9.2, precipitation: 0.4, weather_code: 61 }, hourly: { time: ['2026-11-13T20:00'], temperature_2m: [8.1] } };
const here = (lat, lon) => ({ getCurrentPosition: ok => ok({ coords: { latitude: lat, longitude: lon } }) });
const failing = code => ({ getCurrentPosition: (_ok, err) => err({ code }) });
const reply = (body, init = {}) => async (url, opts) => { reply.calls.push({ url, opts }); return { ok: init.ok ?? true, status: init.status ?? 200, headers: { get: k => (init.headers || {})[k.toLowerCase()] ?? null }, text: async () => typeof body === 'string' ? body : JSON.stringify(body) }; };
reply.calls = [];
const fresh = () => { resetCache(); reply.calls.length = 0; };

test('Erfolg: Standort wird gerundet, Antwort geprüft, Meldung gebaut', async () => {
  fresh();
  const r = await getWeather({ geo: here(52.5200066, 13.404954), fetchFn: reply(GOOD) });
  assert.equal(r.ok, true); assert.equal(r.cached, false);
  assert.equal(r.report.weather, 'regen'); assert.equal(r.report.temp, 11);
  assert.equal(reply.calls.length, 1);
  const u = new URL(reply.calls[0].url);
  assert.equal(u.origin, 'https://api.open-meteo.com');
  assert.equal(u.searchParams.get('latitude'), '52.5'); assert.equal(u.searchParams.get('longitude'), '13.4');
  assert.ok(!reply.calls[0].url.includes('52.52') && !reply.calls[0].url.includes('13.40'), 'genauer Standort steht nicht in der Adresse');
});

test('Abfrage ohne Cookies, ohne Referrer, ohne Weiterleitung, ohne Zwischenspeicher', async () => {
  fresh();
  await getWeather({ geo: here(48.1, 11.6), fetchFn: reply(GOOD) });
  const o = reply.calls[0].opts;
  assert.equal(o.method, 'GET'); assert.equal(o.credentials, 'omit'); assert.equal(o.referrerPolicy, 'no-referrer');
  assert.equal(o.redirect, 'error'); assert.equal(o.cache, 'no-store'); assert.ok(o.signal instanceof AbortSignal);
  assert.equal(o.body, undefined);
});

test('Zwischenspeicher: zweite Abfrage am selben Ort kommt aus dem Speicher, nach 30 Minuten oder mit force nicht', async () => {
  fresh();
  const geo = here(48.14, 11.58), t0 = 1_000_000;
  await getWeather({ geo, fetchFn: reply(GOOD), now: t0 });
  const b = await getWeather({ geo, fetchFn: reply(GOOD), now: t0 + 60_000 });
  assert.equal(b.ok && b.cached, true); assert.equal(reply.calls.length, 1);
  const c = await getWeather({ geo, fetchFn: reply(GOOD), now: t0 + CACHE_MS + 1 });
  assert.equal(c.ok && c.cached, false); assert.equal(reply.calls.length, 2);
  const d = await getWeather({ geo, fetchFn: reply(GOOD), now: t0 + CACHE_MS + 2, force: true });
  assert.equal(d.ok && d.cached, false); assert.equal(reply.calls.length, 3);
  const e = await getWeather({ geo: here(50.0, 8.2), fetchFn: reply(GOOD), now: t0 + CACHE_MS + 3 });
  assert.equal(e.ok && e.cached, false, 'anderer Ort: neue Abfrage');
});

test('Zeitsprung rückwärts nutzt den Speicher nicht', async () => {
  fresh();
  const geo = here(48.14, 11.58);
  await getWeather({ geo, fetchFn: reply(GOOD), now: 5_000_000 });
  const r = await getWeather({ geo, fetchFn: reply(GOOD), now: 1_000 });
  assert.equal(r.ok && r.cached, false);
});

test('Standort verweigert, nicht verfügbar, Zeitüberschreitung, nicht unterstützt', async () => {
  fresh();
  assert.deepEqual(await getWeather({ geo: failing(1), fetchFn: reply(GOOD) }), { ok: false, reason: 'denied' });
  assert.deepEqual(await getWeather({ geo: failing(2), fetchFn: reply(GOOD) }), { ok: false, reason: 'unavailable' });
  assert.deepEqual(await getWeather({ geo: failing(3), fetchFn: reply(GOOD) }), { ok: false, reason: 'timeout' });
  assert.deepEqual(await getWeather({ geo: undefined, fetchFn: reply(GOOD) }), { ok: false, reason: 'unsupported' });
  assert.deepEqual(await getWeather({ geo: {}, fetchFn: reply(GOOD) }), { ok: false, reason: 'unsupported' });
  assert.equal(reply.calls.length, 0, 'ohne Standort geht nichts ins Netz');
});

test('Standort mit Unsinn oder Ausnahme führt zu „nicht verfügbar“, nie zu einer Abfrage', async () => {
  fresh();
  for (const coords of [null, {}, { latitude: 'x', longitude: 1 }, { latitude: NaN, longitude: 1 }, { latitude: 1, longitude: Infinity }]) {
    assert.deepEqual(await getWeather({ geo: { getCurrentPosition: ok => ok({ coords }) }, fetchFn: reply(GOOD) }), { ok: false, reason: 'unavailable' });
  }
  assert.deepEqual(await getWeather({ geo: { getCurrentPosition() { throw new Error('boom'); } }, fetchFn: reply(GOOD) }), { ok: false, reason: 'unavailable' });
  assert.equal(reply.calls.length, 0);
});

test('Koordinaten außerhalb der Erde werden nicht gesendet', async () => {
  fresh();
  const r = await getWeather({ geo: here(120, 20), fetchFn: reply(GOOD) });
  assert.deepEqual(r, { ok: false, reason: 'unavailable' });
  assert.equal(reply.calls.length, 0);
});

test('Netzfehler, Serverfehler, kaputte oder riesige Antworten', async () => {
  fresh();
  const geo = here(48.1, 11.6);
  assert.equal((await getWeather({ geo, fetchFn: async () => { throw new TypeError('Failed to fetch'); } })).reason, 'offline');
  assert.equal((await getWeather({ geo, fetchFn: reply('', { ok: false, status: 500 }) })).reason, 'http');
  assert.equal((await getWeather({ geo, fetchFn: reply('<html>', {}) })).reason, 'bad');
  assert.equal((await getWeather({ geo, fetchFn: reply('{"current":') })).reason, 'bad');
  assert.equal((await getWeather({ geo, fetchFn: reply({ current: { temperature_2m: 'heiß' } }) })).reason, 'bad');
  assert.equal((await getWeather({ geo, fetchFn: reply({ current: { temperature_2m: 999 } }) })).reason, 'bad');
  assert.equal((await getWeather({ geo, fetchFn: reply('x'.repeat(70000)) })).reason, 'bad');
  assert.equal((await getWeather({ geo, fetchFn: reply(GOOD, { headers: { 'content-length': '900000' } }) })).reason, 'bad');
  assert.equal((await getWeather({ geo, fetchFn: reply('null') })).reason, 'bad');
  assert.equal((await getWeather({ geo, fetchFn: reply('[]') })).reason, 'bad');
});

test('Misserfolge werden nicht zwischengespeichert', async () => {
  fresh();
  const geo = here(48.1, 11.6);
  await getWeather({ geo, fetchFn: reply('{}') });
  const r = await getWeather({ geo, fetchFn: reply(GOOD) });
  assert.equal(r.ok && r.cached, false);
});

test('Zeitüberschreitung der Abfrage bricht ab', async () => {
  fresh();
  const hang = (_url, o) => new Promise((_res, rej) => o.signal.addEventListener('abort', () => rej(new DOMException('abgebrochen', 'AbortError'))));
  const t = setTimeout(() => {}, 0); clearTimeout(t);
  const realSet = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...a) => realSet(fn, ms >= 10000 ? 5 : ms, ...a);
  try {
    const r = await getWeather({ geo: here(48.1, 11.6), fetchFn: hang });
    assert.deepEqual(r, { ok: false, reason: 'http' });
  } finally { globalThis.setTimeout = realSet; }
});

test('Jeder Grund hat eine Meldung für die Seite', () => {
  for (const k of ['denied', 'unavailable', 'timeout', 'unsupported', 'offline', 'http', 'bad']) assert.ok(MESSAGES[k] && MESSAGES[k].length > 10, k);
});
