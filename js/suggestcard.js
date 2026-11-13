// @ts-check
import { NEUTRAL, WEATHER_LABEL } from './stylist.js';

/** @typedef {import('./stylist.js').Weather} Weather */

/** @type {Record<Weather, string>} */
const BY_WEATHER = { kalt: 'Warm eingepackt', mild: 'Ruhiger Alltag', warm: 'Leicht und luftig', regen: 'Für den Regen' };

/** @type {Record<Weather, string>} */
const SHORT = { kalt: 'warm', mild: 'mild', warm: 'luftig', regen: 'trocken' };

/**
 * Kurzer Titel für eine Vorschlagskarte. Gewählt wird der erste passende Titel, der in dieser Runde noch nicht vergeben ist,
 * damit die drei Karten nie gleich heißen.
 * @param {{ pieces: readonly { cat?: string, color?: string }[], reasons: readonly string[] }} s
 * @param {Weather} weather
 * @param {readonly string[]} [taken] schon vergebene Titel
 * @param {string} [occasion] gewählter Anlass; steht dann vorn im Titel („Büro, trocken“)
 */
export function cardTitle(s, weather, taken = [], occasion = '') {
  /** @type {string[]} */
  const options = [];
  if (occasion && SHORT[weather]) options.push(occasion + ', ' + SHORT[weather]);
  if (s.reasons.some(r => /nie getragen|lange nicht getragen/.test(r))) options.push('Wiederentdeckt');
  options.push(BY_WEATHER[weather] || 'Vorschlag');
  const accents = new Set(s.pieces.map(p => p.color).filter(c => !!c && !NEUTRAL.has(c)));
  options.push(accents.size === 0 ? 'Ruhig und klar' : accents.size === 1 ? 'Mit Farbakzent' : 'Bunt gemischt');
  options.push(s.pieces.some(p => p.cat === 'Jacke') ? 'Mit Jacke' : 'Ohne Jacke');
  return options.find(t => !taken.includes(t)) ?? 'Vorschlag ' + (taken.length + 1);
}

/** Zeile unter dem Titel. @param {number} count Anzahl Teile @param {Weather} weather */
export const cardSub = (count, weather) => count + (count === 1 ? ' Teil' : ' Teile') + ' · ' + (WEATHER_LABEL[weather] || '');

/**
 * Startwert für „Heute für dich“: gleicher Tag und gleiche Runde ergeben dieselben Vorschläge, ein neuer Tag neue.
 * @param {string} day Tag (JJJJ-MM-TT) @param {number} round Zähler für „Neue Vorschläge“
 */
export function seedFor(day, round) {
  let h = 2166136261;
  for (let i = 0; i < day.length; i++) { h ^= day.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 1000003) + Math.max(0, Math.floor(round)) * 7919;
}
