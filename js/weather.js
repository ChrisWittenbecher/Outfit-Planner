// @ts-check
// Wetter für „Heute für dich“ (Open-Meteo, https://open-meteo.com/, Daten unter CC BY 4.0).
// Reine Logik: Adresse bauen, Antwort streng prüfen, auf die vier Stufen des Stylisten abbilden. Das Abrufen selbst steht in wx.js.

/** @typedef {import('./stylist.js').Weather} Weather */
/** @typedef {{ temp: number, feels: number, code: number | null, text: string, weather: Weather, evening: number | null, rain: boolean }} Report */

export const API = 'https://api.open-meteo.com/v1/forecast';
export const ATTRIBUTION = Object.freeze({ text: 'Wetterdaten von Open-Meteo.com', href: 'https://open-meteo.com/', licence: 'https://creativecommons.org/licenses/by/4.0/' });
/** Größte Antwort, die gelesen wird (Zeichen). */
export const MAX_BODY = 60000;

/** Auf eine Nachkommastelle runden (etwa 10 km). Der genaue Standort verlässt das Gerät nie. @param {number} n */
export const roundCoord = n => Math.round(n * 10) / 10 + 0;

/**
 * Adresse der Abfrage. Enthält nur gerundete Koordinaten und feste Wettergrößen.
 * @param {unknown} lat @param {unknown} lon @returns {string | null} null bei ungültigen Koordinaten
 */
export function weatherUrl(lat, lon) {
  if (typeof lat !== 'number' || typeof lon !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const q = new URLSearchParams({
    latitude: String(roundCoord(lat)), longitude: String(roundCoord(lon)),
    current: 'temperature_2m,apparent_temperature,precipitation,weather_code',
    hourly: 'temperature_2m', forecast_days: '1', timezone: 'auto',
  });
  return API + '?' + q.toString();
}

/** @type {Record<number, string>} */
const TEXT = {
  0: 'klar', 1: 'überwiegend klar', 2: 'teils bewölkt', 3: 'bedeckt', 45: 'Nebel', 48: 'Nebel mit Reif',
  51: 'leichter Nieselregen', 53: 'Nieselregen', 55: 'starker Nieselregen', 56: 'gefrierender Nieselregen', 57: 'gefrierender Nieselregen',
  61: 'leichter Regen', 63: 'Regen', 65: 'starker Regen', 66: 'gefrierender Regen', 67: 'gefrierender Regen',
  71: 'leichter Schneefall', 73: 'Schneefall', 75: 'starker Schneefall', 77: 'Schneegriesel',
  80: 'leichte Regenschauer', 81: 'Regenschauer', 82: 'starke Regenschauer', 85: 'leichte Schneeschauer', 86: 'Schneeschauer',
  95: 'Gewitter', 96: 'Gewitter mit Hagel', 97: 'schweres Gewitter', 99: 'Gewitter mit Hagel',
};
const isRain = (/** @type {number} */ c) => (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || (c >= 95 && c <= 99);
const isSnow = (/** @type {number} */ c) => (c >= 71 && c <= 77) || c === 85 || c === 86;

/** Ist das eine Zahl in sinnvollem Bereich? @param {unknown} v @param {number} lo @param {number} hi @returns {v is number} */
const inRange = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

/**
 * Stufe für den Stylisten. Regen und Gewitter zählen als „regen“, Schnee und Frost als „kalt“, sonst entscheidet die gefühlte Temperatur.
 * @param {number} feels gefühlte Temperatur in °C @param {number | null} code Wettercode @param {number} precip Niederschlag in mm
 * @returns {Weather}
 */
export function toWeather(feels, code, precip) {
  if ((code !== null && isRain(code)) || precip >= 0.2) return 'regen';
  if (code !== null && isSnow(code)) return 'kalt';
  return feels <= 9 ? 'kalt' : feels >= 22 ? 'warm' : 'mild';
}

/**
 * Prüft die Antwort des Dienstes und macht daraus eine kurze Meldung. Unbekannte Felder werden ignoriert, alles Unplausible führt zu null.
 * @param {unknown} raw @param {number} [eveningHour] Stunde für „Abend“ (Ortszeit)
 * @returns {Report | null}
 */
export function parseWeather(raw, eveningHour = 20) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const cur = /** @type {Record<string, unknown>} */ (raw).current;
  if (!cur || typeof cur !== 'object' || Array.isArray(cur)) return null;
  const c = /** @type {Record<string, unknown>} */ (cur);
  if (!inRange(c.temperature_2m, -80, 60)) return null;
  const temp = c.temperature_2m;
  const feels = inRange(c.apparent_temperature, -90, 70) ? c.apparent_temperature : temp;
  const precip = inRange(c.precipitation, 0, 500) ? c.precipitation : 0;
  const code = typeof c.weather_code === 'number' && Number.isInteger(c.weather_code) && c.weather_code >= 0 && c.weather_code <= 99 ? c.weather_code : null;
  /** @type {number | null} */
  let evening = null;
  const h = /** @type {Record<string, unknown>} */ (raw).hourly;
  if (h && typeof h === 'object' && !Array.isArray(h)) {
    const times = /** @type {Record<string, unknown>} */ (h).time, temps = /** @type {Record<string, unknown>} */ (h).temperature_2m;
    if (Array.isArray(times) && Array.isArray(temps) && times.length === temps.length && times.length <= 48) {
      const stamp = String(eveningHour).padStart(2, '0') + ':00';
      const i = times.findIndex(t => typeof t === 'string' && t.length === 16 && t.endsWith('T' + stamp));
      if (i >= 0 && inRange(temps[i], -80, 60)) evening = Math.round(temps[i]);
    }
  }
  return {
    temp: Math.round(temp), feels: Math.round(feels), code, evening,
    text: code !== null && TEXT[code] ? TEXT[code] : '',
    weather: toWeather(feels, code, precip),
    rain: precip >= 0.2 || (code !== null && isRain(code)),
  };
}

/** Eine Zeile für die Anzeige, z. B. „11 °C, leichter Regen“. @param {Report} r */
export const headline = r => r.temp + ' °C' + (r.text ? ', ' + r.text : '');

/** Zweite Zeile, z. B. „Abend 8 °C“ (leer, wenn es keine Abendwerte gibt). @param {Report} r */
export const subline = r => (r.evening !== null ? 'Abend ' + r.evening + ' °C' : '');
