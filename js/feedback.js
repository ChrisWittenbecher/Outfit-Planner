// @ts-check

// Rückmeldung (Fehler oder Wunsch) als GitHub-Issue. Die App sendet nichts selbst: Sie baut nur die Adresse der „Neues Issue“-Seite des
// öffentlichen Projekts mit vorausgefülltem Text. Abgeschickt wird erst auf GitHub, nach einem Klick der Person und mit ihrem eigenen Konto.
// Deshalb gibt es kein Token, keinen Server und keine Anfrage der App an GitHub.

export const REPO = 'ChrisWittenbecher/Outfit-Planner';
export const ISSUE_URL = `https://github.com/${REPO}/issues/new`;
/** Grenzen: GitHub nimmt Adressen bis etwa 8 000 Zeichen an, wir bleiben deutlich darunter. */
export const LIMITS = Object.freeze({ title: 100, text: 1500, info: 240, url: 6500 });

export const KINDS = Object.freeze({
  bug: { label: 'Fehler melden', ask: 'Was ist passiert? Was hast du erwartet?', gh: 'bug', prefix: 'Fehler' },
  idea: { label: 'Wunsch oder Idee', ask: 'Was wünschst du dir? Wofür brauchst du es?', gh: 'enhancement', prefix: 'Wunsch' },
});
/** @typedef {keyof typeof KINDS} Kind */
/** @param {unknown} k @returns {k is Kind} */
export const isKind = k => typeof k === 'string' && Object.prototype.hasOwnProperty.call(KINDS, k);

// Steuerzeichen, Zeilen- und Absatztrenner, Richtungs- und Zero-Width-Zeichen (außer Zeilenumbruch und Tabulator)
const CONTROL = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F\\u2028\\u2029\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]', 'g');

/**
 * Bereinigt freien Text: einheitliche Zeilenenden, keine Steuerzeichen, keine Leerzeichen am Rand, begrenzte Länge.
 * @param {unknown} s @param {number} max @param {boolean} [multiline]
 */
export function cleanText(s, max, multiline = false) {
  let t = typeof s === 'string' ? s : '';
  t = t.replace(/\r\n?/g, '\n').replace(CONTROL, '');
  t = multiline ? t.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n') : t.replace(/\s+/g, ' ');
  return [...t.trim()].slice(0, max).join('');
}

/**
 * Technische Angaben, nur Zeichenketten, damit sie sich lesen und prüfen lassen.
 * @param {{ version?: unknown, mode?: unknown, screen?: unknown, device?: unknown }} i
 * @returns {string} Markdown-Liste, leer ohne Angaben
 */
export function infoBlock(i) {
  const rows = [['Version', i.version], ['Anzeige', i.mode], ['Bildschirm', i.screen], ['Gerät', i.device]]
    .map(([k, v]) => [k, cleanText(v, 160)]).filter(([, v]) => v);
  return rows.map(([k, v]) => `- ${k}: ${v}`).join('\n').slice(0, LIMITS.info * 4);
}

/**
 * Text des Issues.
 * @param {Kind} kind @param {string} text @param {string} info
 */
export function buildBody(kind, text, info) {
  const k = isKind(kind) ? kind : 'bug';
  const parts = [`### ${KINDS[k].prefix}`, '', text || '_(keine Beschreibung)_'];
  if (info) parts.push('', '### Angaben aus der App', '', info);
  parts.push('', '_Gesendet aus dem Outfit-Planner._');
  return parts.join('\n');
}

/**
 * Adresse der vorausgefüllten „Neues Issue“-Seite. Host und Pfad sind fest, Eingaben landen nur als kodierte Werte in der Abfrage.
 * Wird die Adresse zu lang, kürzt die Funktion die Beschreibung (trimmed = true).
 * @param {{ kind: Kind, title: string, text: string, info?: string }} f
 * @returns {{ url: string, title: string, body: string, trimmed: boolean }}
 */
export function buildIssue(f) {
  const kind = isKind(f.kind) ? f.kind : 'bug';
  const title = cleanText(f.title, LIMITS.title);
  const info = cleanText(f.info, LIMITS.info * 4, true);
  let text = cleanText(f.text, LIMITS.text, true);
  const make = (/** @type {string} */ t) => {
    const body = buildBody(kind, t, info);
    const q = `labels=${encodeURIComponent(KINDS[kind].gh)}&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    return { url: `${ISSUE_URL}?${q}`, body };
  };
  let out = make(text), trimmed = false;
  while (out.url.length > LIMITS.url && text.length > 40) {
    trimmed = true;
    text = [...text].slice(0, Math.floor([...text].length * 0.85)).join('').trimEnd() + ' …';
    out = make(text);
  }
  return { url: out.url, title, body: out.body, trimmed };
}

/**
 * Der vollständige Text zum Kopieren (Titel, Leerzeile, Meldung), ohne Kürzung für die Adresse.
 * @param {{ kind: Kind, title: string, text: string, info?: string }} f
 */
export function plainText(f) {
  const kind = isKind(f.kind) ? f.kind : 'bug';
  return cleanText(f.title, LIMITS.title) + '\n\n' + buildBody(kind, cleanText(f.text, LIMITS.text, true), cleanText(f.info, LIMITS.info * 4, true));
}

/**
 * Prüft die Eingaben. Gibt den Text der Meldung und das betroffene Feld zurück, oder null, wenn alles passt.
 * @param {{ title: string, text: string }} f
 * @returns {{ field: 'title' | 'text', message: string } | null}
 */
export function problem(f) {
  if (cleanText(f.title, LIMITS.title).length < 3) return { field: 'title', message: 'Bitte gib einen kurzen Titel ein, mindestens drei Zeichen.' };
  if (cleanText(f.text, LIMITS.text, true).length < 10) return { field: 'text', message: 'Bitte beschreibe es in ein paar Worten, mindestens zehn Zeichen.' };
  return null;
}
