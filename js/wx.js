// @ts-check
// Wetter holen: Standort vom Gerät (nur mit Erlaubnis), eine Abfrage an Open-Meteo, Antwort streng prüfen.
// Datenschutz: Der Standort wird auf 0,1° gerundet (etwa 10 km), nirgends gespeichert und geht nur an api.open-meteo.com.
// Ohne Cookies, ohne Referrer, ohne Anmeldedaten. Das Ergebnis liegt höchstens eine halbe Stunde im Arbeitsspeicher.

import { MAX_BODY, parseWeather, roundCoord, weatherUrl } from './weather.js';

/** @typedef {import('./weather.js').Report} Report */
/** @typedef {'denied' | 'unavailable' | 'timeout' | 'unsupported' | 'offline' | 'http' | 'bad'} Reason */
/** @typedef {{ ok: true, report: Report, cached: boolean } | { ok: false, reason: Reason }} Result */

export const CACHE_MS = 30 * 60 * 1000;
export const GEO_TIMEOUT_MS = 10000;
export const FETCH_TIMEOUT_MS = 10000;

/** Meldungen für die Seite, nach Grund. */
export const MESSAGES = Object.freeze(/** @type {Record<Reason, string>} */ ({
  denied: 'Ohne Standort kann ich das Wetter nicht holen. Wähle es unten selbst.',
  unavailable: 'Dein Standort ist gerade nicht verfügbar. Wähle das Wetter selbst.',
  timeout: 'Der Standort kam nicht rechtzeitig an. Versuche es noch einmal oder wähle das Wetter selbst.',
  unsupported: 'Dieses Gerät kann seinen Standort nicht melden. Wähle das Wetter selbst.',
  offline: 'Das Wetter ist ohne Netz nicht erreichbar. Wähle es selbst.',
  http: 'Der Wetterdienst antwortet gerade nicht. Wähle das Wetter selbst.',
  bad: 'Die Antwort des Wetterdienstes war nicht brauchbar. Wähle das Wetter selbst.',
}));

/** @type {{ key: string, at: number, report: Report } | null} */
let cache = null;

/** Nur für Tests. */
export function resetCache() { cache = null; }

/**
 * Standort abfragen. Gibt gerundete Koordinaten zurück, sonst den Grund des Scheiterns.
 * @param {{ getCurrentPosition: Function } | undefined} geo
 * @returns {Promise<{ lat: number, lon: number } | Reason>}
 */
function locate(geo) {
  if (!geo || typeof geo.getCurrentPosition !== 'function') return Promise.resolve('unsupported');
  return new Promise(resolve => {
    let done = false;
    const end = (/** @type {{ lat: number, lon: number } | Reason} */ v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } };
    const timer = setTimeout(() => end('timeout'), GEO_TIMEOUT_MS + 2000);
    try {
      geo.getCurrentPosition(
        (/** @type {any} */ pos) => {
          const c = pos && pos.coords;
          const lat = c && c.latitude, lon = c && c.longitude;
          if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon)) end('unavailable');
          else end({ lat: roundCoord(lat), lon: roundCoord(lon) });
        },
        (/** @type {any} */ err) => end(err && err.code === 1 ? 'denied' : err && err.code === 3 ? 'timeout' : 'unavailable'),
        { enableHighAccuracy: false, timeout: GEO_TIMEOUT_MS, maximumAge: 10 * 60 * 1000 },
      );
    } catch { end('unavailable'); }
  });
}

/**
 * Wetter für den aktuellen Standort.
 * @param {{ force?: boolean, now?: number, geo?: { getCurrentPosition: Function }, fetchFn?: typeof fetch }} [opts] Hilfsmittel für Tests
 * @returns {Promise<Result>}
 */
export async function getWeather(opts = {}) {
  const now = opts.now ?? Date.now();
  const geo = 'geo' in opts ? opts.geo : (typeof navigator !== 'undefined' ? navigator.geolocation : undefined);
  const place = await locate(geo);
  if (typeof place === 'string') return { ok: false, reason: place };
  const url = weatherUrl(place.lat, place.lon);
  if (!url) return { ok: false, reason: 'unavailable' };
  const key = place.lat + ',' + place.lon;
  if (!opts.force && cache && cache.key === key && now - cache.at >= 0 && now - cache.at < CACHE_MS) return { ok: true, report: cache.report, cached: true };

  const doFetch = opts.fetchFn || (typeof fetch === 'function' ? fetch : null);
  if (!doFetch) return { ok: false, reason: 'unsupported' };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await doFetch(url, { method: 'GET', credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', redirect: 'error', signal: ctl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) return { ok: false, reason: 'http' };
    const declared = Number(res.headers && res.headers.get && res.headers.get('content-length'));
    if (declared > MAX_BODY) return { ok: false, reason: 'bad' };
    const text = await res.text();
    if (typeof text !== 'string' || text.length > MAX_BODY) return { ok: false, reason: 'bad' };
    let raw;
    try { raw = JSON.parse(text); } catch { return { ok: false, reason: 'bad' }; }
    const report = parseWeather(raw);
    if (!report) return { ok: false, reason: 'bad' };
    cache = { key, at: now, report };
    return { ok: true, report, cached: false };
  } catch {
    return { ok: false, reason: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : ctl.signal.aborted ? 'http' : 'offline' };
  } finally { clearTimeout(timer); }
}
