// @ts-check
/** Speicherformat 2: Teile liegen einzeln im Store „items“, der Rest (ohne Bilder) als kleiner Datensatz unter kv.s. */
export const SCHEMA = 2;
/** So lange bleibt die Kopie des alten Formats (kv.s_v1) nach der Umstellung erhalten. */
export const KEEP_LEGACY_DAYS = 14;

/** @typedef {Record<string, any> & { id: string }} StoredItem */
/** @typedef {{ v: 2, order: string[], outfits: unknown[], wears: unknown[], plans: Record<string, string>, board: unknown[], fitted: boolean }} Record2 */

/** @param {unknown} v @returns {v is Record<string, unknown>} */
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);

/** Tiefe Kopie eines Teils (nur Daten). @param {StoredItem} it @returns {StoredItem} */
export function snapshotItem(it) {
  /** @type {Record<string, any>} */
  const c = { ...it };
  for (const k of Object.keys(c)) if (c[k] && typeof c[k] === 'object') c[k] = JSON.parse(JSON.stringify(c[k]));
  return /** @type {StoredItem} */ (c);
}

/** Gleiche Felder und Werte? Listen und Objekte werden verglichen, nicht nur ihre Adresse. @param {StoredItem} a @param {StoredItem} b */
export function sameItem(a, b) {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every(k => k in b && (a[k] && typeof a[k] === 'object' ? JSON.stringify(a[k]) === JSON.stringify(b[k]) : a[k] === b[k]));
}

/**
 * Was muss geschrieben werden, damit der Speicher den aktuellen Teilen entspricht?
 * @param {ReadonlyMap<string, StoredItem>} stored Stand im Speicher (Kopien)
 * @param {readonly StoredItem[]} items aktuelle Teile
 * @returns {{ puts: StoredItem[], deletes: string[] }}
 */
export function diffItems(stored, items) {
  /** @type {StoredItem[]} */
  const puts = [];
  const live = new Set();
  for (const it of items) {
    if (!it || typeof it.id !== 'string') continue;
    live.add(it.id);
    const old = stored.get(it.id);
    if (!old || !sameItem(old, it)) puts.push(it);
  }
  return { puts, deletes: [...stored.keys()].filter(id => !live.has(id)) };
}

/** Der kleine Datensatz ohne Bilder. @param {{ items: readonly StoredItem[], outfits: unknown[], wears?: unknown[], plans?: Record<string, string>, board?: unknown[], fitted?: boolean }} data @returns {Record2} */
export function packState(data) {
  return { v: SCHEMA, order: data.items.map(i => i.id), outfits: data.outfits, wears: data.wears || [], plans: data.plans || {}, board: data.board || [], fitted: data.fitted !== false };
}

/**
 * Setzt Datensatz und Teile wieder zusammen. Die Reihenfolge folgt `order`; unbekannte Kennungen und Doppelte fallen weg.
 * @param {unknown} rec
 * @param {readonly StoredItem[]} stored
 */
export function unpackState(rec, stored) {
  const r = isObj(rec) ? rec : {};
  const byId = new Map(stored.filter(i => i && typeof i.id === 'string').map(i => [i.id, i]));
  const order = Array.isArray(r.order) ? r.order.filter(/** @returns {id is string} */ id => typeof id === 'string') : [];
  /** @type {StoredItem[]} */
  const items = [];
  for (const id of order) { const it = byId.get(id); if (it) { items.push(it); byId.delete(id); } }
  return {
    items,
    outfits: Array.isArray(r.outfits) ? r.outfits : [],
    wears: Array.isArray(r.wears) ? r.wears : [],
    plans: isObj(r.plans) ? /** @type {Record<string, string>} */ (r.plans) : {},
    board: Array.isArray(r.board) ? r.board : [],
    fitted: r.fitted !== false,
  };
}

/**
 * Zerlegt einen Datensatz im alten Format (alles in einem Stück) in Teile und kleinen Datensatz.
 * Teile ohne gültige Kennung bekommen eine neue; doppelte Kennungen werden eindeutig gemacht.
 * @param {unknown} legacy
 * @param {() => string} newId
 * @returns {{ items: StoredItem[], record: Record2, fixed: number }}
 */
export function splitLegacy(legacy, newId) {
  const l = isObj(legacy) ? legacy : {};
  const raw = Array.isArray(l.items) ? l.items : [];
  const seen = new Set();
  /** @type {StoredItem[]} */
  const items = [];
  let fixed = 0;
  for (const r of raw) {
    if (!isObj(r)) { fixed++; continue; }
    let id = typeof r.id === 'string' && r.id !== '' && r.id.length <= 64 ? r.id : '';
    if (!id || seen.has(id)) { id = newId(); fixed++; }
    seen.add(id);
    items.push(/** @type {StoredItem} */ ({ ...r, id }));
  }
  return { items, record: packState({ items, outfits: Array.isArray(l.outfits) ? l.outfits : [], wears: Array.isArray(l.wears) ? l.wears : [], plans: isObj(l.plans) ? /** @type {Record<string, string>} */ (l.plans) : {}, board: Array.isArray(l.board) ? l.board : [], fitted: l.fitted !== false }), fixed };
}

/** @param {unknown} rec Ist das der Datensatz im neuen Format? */
export const isCurrent = rec => isObj(rec) && rec.v === SCHEMA && Array.isArray(rec.order);

/** Schlüssel, an dem man erkennt, ob ein Vorschaubild noch zum Bild passt. @param {unknown} img */
export const thumbKey = img => (typeof img === 'string' ? img.length + ':' + img.slice(-48) : '');

/** @param {number} migratedAt @param {number} now */
export const legacyExpired = (migratedAt, now) => Number.isFinite(migratedAt) && migratedAt > 0 && now - migratedAt > KEEP_LEGACY_DAYS * 86400000;
