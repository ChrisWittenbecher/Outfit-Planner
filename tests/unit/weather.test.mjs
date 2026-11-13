import test from 'node:test';
import assert from 'node:assert/strict';
import { API, ATTRIBUTION, headline, parseWeather, roundCoord, subline, toWeather, weatherUrl } from '../../js/weather.js';

const day = (hours, temps) => ({ time: hours, temperature_2m: temps });
const ok = (cur, hourly) => ({ latitude: 52.5, longitude: 13.4, current: { time: '2026-11-13T12:00', interval: 900, ...cur }, ...(hourly ? { hourly } : {}) });

test('roundCoord rundet auf eine Stelle und liefert nie −0', () => {
  assert.equal(roundCoord(52.5208), 52.5);
  assert.equal(roundCoord(13.4049), 13.4);
  assert.equal(roundCoord(-0.04), 0);
  assert.ok(Object.is(roundCoord(-0.04), 0));
  assert.equal(roundCoord(-122.4194), -122.4);
});

test('weatherUrl: feste Adresse, gerundete Koordinaten, feste Wettergrößen', () => {
  const u = new URL(/** @type {string} */ (weatherUrl(52.52084, 13.40493)));
  assert.equal(u.origin + u.pathname, API);
  assert.equal(u.protocol, 'https:');
  assert.equal(u.hostname, 'api.open-meteo.com');
  assert.equal(u.searchParams.get('latitude'), '52.5');
  assert.equal(u.searchParams.get('longitude'), '13.4');
  assert.equal(u.searchParams.get('current'), 'temperature_2m,apparent_temperature,precipitation,weather_code');
  assert.equal(u.searchParams.get('timezone'), 'auto');
  assert.deepEqual([...u.searchParams.keys()].sort(), ['current', 'forecast_days', 'hourly', 'latitude', 'longitude', 'timezone']);
  assert.ok(!/52\.52|13\.40/.test(u.href), 'genaue Koordinaten stehen nicht in der Adresse');
});

test('weatherUrl: ungültige Koordinaten ergeben keine Adresse', () => {
  for (const [a, b] of [[NaN, 1], [1, Infinity], [91, 0], [0, 181], ['52', '13'], [null, null], [undefined, 3], [{}, []]]) assert.equal(weatherUrl(a, b), null, String(a) + ',' + String(b));
  assert.ok(weatherUrl(-90, 180) && weatherUrl(90, -180));
});

test('toWeather: Regen, Schnee, Kälte, Wärme', () => {
  assert.equal(toWeather(15, 61, 0), 'regen');
  assert.equal(toWeather(30, 95, 0), 'regen');
  assert.equal(toWeather(15, null, 0.5), 'regen');
  assert.equal(toWeather(15, 3, 0.1), 'mild');
  assert.equal(toWeather(0, 73, 0), 'kalt');
  assert.equal(toWeather(9, 2, 0), 'kalt');
  assert.equal(toWeather(10, 2, 0), 'mild');
  assert.equal(toWeather(21, 0, 0), 'mild');
  assert.equal(toWeather(22, 0, 0), 'warm');
});

test('parseWeather: normale Antwort mit Abendwert', () => {
  const hours = Array.from({ length: 24 }, (_, i) => `2026-11-13T${String(i).padStart(2, '0')}:00`);
  const r = parseWeather(ok({ temperature_2m: 11.4, apparent_temperature: 9.6, precipitation: 0.6, weather_code: 61 }, day(hours, hours.map((_, i) => 12 - i * 0.2))));
  assert.ok(r);
  assert.equal(r.temp, 11); assert.equal(r.feels, 10); assert.equal(r.code, 61); assert.equal(r.text, 'leichter Regen');
  assert.equal(r.weather, 'regen'); assert.equal(r.rain, true);
  assert.equal(r.evening, Math.round(12 - 20 * 0.2));
  assert.equal(headline(r), '11 °C, leichter Regen');
  assert.equal(subline(r), 'Abend 8 °C');
});

test('parseWeather: ohne Stundenwerte und ohne Code', () => {
  const r = parseWeather(ok({ temperature_2m: 25 }));
  assert.ok(r);
  assert.equal(r.weather, 'warm'); assert.equal(r.text, ''); assert.equal(r.code, null); assert.equal(r.evening, null);
  assert.equal(headline(r), '25 °C'); assert.equal(subline(r), '');
});

test('parseWeather: Unsinn wird abgelehnt', () => {
  const bad = [null, undefined, 5, 'x', [], {}, { current: null }, { current: [] }, { current: 'x' },
    ok({ temperature_2m: 'warm' }), ok({ temperature_2m: NaN }), ok({ temperature_2m: Infinity }), ok({ temperature_2m: 999 }), ok({ temperature_2m: -999 }), ok({})];
  for (const b of bad) assert.equal(parseWeather(b), null, JSON.stringify(b));
});

test('parseWeather: einzelne schlechte Felder fallen auf sichere Werte zurück', () => {
  let r = parseWeather(ok({ temperature_2m: 12, apparent_temperature: 'kalt', precipitation: -3, weather_code: 'x' }));
  assert.ok(r); assert.equal(r.feels, 12); assert.equal(r.code, null); assert.equal(r.rain, false);
  r = parseWeather(ok({ temperature_2m: 12, weather_code: 1.5 })); assert.ok(r && r.code === null);
  r = parseWeather(ok({ temperature_2m: 12, weather_code: 100 })); assert.ok(r && r.code === null);
  r = parseWeather(ok({ temperature_2m: 12, weather_code: 4 })); assert.ok(r && r.code === 4 && r.text === '', 'unbekannter, aber gültiger Code: kein Text');
});

test('parseWeather: Stundenlisten werden streng geprüft', () => {
  const t = ['2026-11-13T19:00', '2026-11-13T20:00'];
  assert.equal(parseWeather(ok({ temperature_2m: 10 }, day(t, [9, 8])))?.evening, 8);
  assert.equal(parseWeather(ok({ temperature_2m: 10 }, day(t, [9])))?.evening, null, 'ungleich lange Listen');
  assert.equal(parseWeather(ok({ temperature_2m: 10 }, day(t, [9, 'x'])))?.evening, null);
  assert.equal(parseWeather(ok({ temperature_2m: 10 }, day(t, [9, 999])))?.evening, null);
  assert.equal(parseWeather(ok({ temperature_2m: 10 }, day(['x', 5], [9, 8])))?.evening, null);
  assert.equal(parseWeather(ok({ temperature_2m: 10 }, day(Array(49).fill('2026-11-13T20:00'), Array(49).fill(8))))?.evening, null, 'zu viele Einträge');
  assert.equal(parseWeather(ok({ temperature_2m: 10 }, 'x'))?.evening, null);
  assert.equal(parseWeather(ok({ temperature_2m: 10 }, [1, 2]))?.evening, null);
  assert.equal(parseWeather(ok({ temperature_2m: 10 }, day(t, [9, 8])), 19)?.evening, 9, 'andere Abendstunde');
});

test('parseWeather: Schadcode in Feldern wird nie weitergereicht', () => {
  const r = parseWeather(ok({ temperature_2m: 10, weather_code: '<img src=x onerror=alert(1)>' }));
  assert.ok(r); assert.equal(r.text, '');
  const o = JSON.parse('{"current":{"temperature_2m":10,"__proto__":{"polluted":true},"weather_code":3}}');
  assert.ok(parseWeather(o)); assert.equal(/** @type {any} */ ({}).polluted, undefined);
});

test('Quellenangabe: Name und beide Links (CC BY 4.0)', () => {
  assert.match(ATTRIBUTION.text, /Open-Meteo\.com/);
  assert.equal(ATTRIBUTION.href, 'https://open-meteo.com/');
  assert.equal(ATTRIBUTION.licence, 'https://creativecommons.org/licenses/by/4.0/');
});
