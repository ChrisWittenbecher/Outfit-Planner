// @ts-nocheck
import * as Geo from './geometry.js';
import { cleanPieces, fixOrder } from './board.js';
import { newId, state } from './core.js';
import { sanitizePlans, sanitizeWears } from './wear.js';
import { sanitizeText } from './scraper.js';
import { diffItems, isCurrent, legacyExpired, packState, snapshotItem, splitLegacy, unpackState } from './model.js';

/*
 * Speicherformat 2 (siehe js/model.js)
 *   kv      „s“       kleiner Datensatz ohne Bilder (Reihenfolge, Outfits, Einträge, Pläne, Board)
 *           „meta“    Erinnerungen und Hinweise
 *           „s_v1“    Kopie des alten Formats, nur nach einer Umstellung und nur 14 Tage
 *   items   ein Eintrag je Kleidungsstück
 *   thumbs  Vorschaubilder je Kleidungsstück (abgeleitet, jederzeit neu erzeugbar)
 */
const DB = 'anprobe', VERSION = 2;
const status = text => { const s = document.getElementById('saveState'); if(s) s.textContent = text; };

let handle = null;   // erst nach dem Laden gesetzt; flush() braucht die Verbindung sofort, ohne zu warten
const idb = new Promise((res, rej) => {
  const q = indexedDB.open(DB, VERSION);
  q.onupgradeneeded = () => { for(const n of ['kv', 'items', 'thumbs']) if(!q.result.objectStoreNames.contains(n)) q.result.createObjectStore(n, n === 'items' ? {keyPath:'id'} : undefined); };
  let blocked = false;
  q.onblocked = () => { blocked = true; status('Der Outfit-Planner ist noch in einem anderen Tab geöffnet. Bitte diesen Tab schließen, dann geht es hier weiter.'); };
  q.onsuccess = () => { if(blocked) status(''); q.result.onversionchange = () => { q.result.close(); handle = null; status('Der Outfit-Planner wurde in einem anderen Tab aktualisiert. Bitte diese Seite neu laden.'); }; res(q.result); };
  q.onerror = () => rej(q.error);
});
export const db = () => idb;

/** Führt `fn` in einer Transaktion aus. Die Transaktion entsteht sofort (ohne await davor), das Ergebnis kommt, wenn alles geschrieben ist. */
function run(d, stores, mode, fn){
  return new Promise((res, rej) => {
    let tx;
    try{ tx = d.transaction(stores, mode); fn(tx); }
    catch(e){ try{ tx?.abort(); }catch(_){} return rej(e); }
    tx.oncomplete = () => res(true);
    tx.onabort = () => rej(tx.error || new Error('Speichern abgebrochen'));
  });
}
const ask = (d, store, fn) => new Promise((res, rej) => { const q = fn(d.transaction(store).objectStore(store)); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });

let persisted = new Map();   // Stand der Teile im Speicher (Kopien), Grundlage für die Änderungsliste
let lastRec = '';

function apply(u){
  state.data = {items:u.items, outfits:u.outfits, wears:u.wears, plans:u.plans};
  state.board = fixOrder(cleanPieces(u.board)); state.fitted = u.fitted !== false;
  state.data.outfits = state.data.outfits.filter(o => o && typeof o.name === 'string'); state.data.outfits.forEach(o => { o.pieces = fixOrder(Geo.sanitizePieces(o.pieces)); });
  state.data.wears = sanitizeWears(u.wears, new Set(state.data.items.map(i => i.id)), sanitizeText);
  state.data.plans = sanitizePlans(u.plans, new Set(state.data.outfits.map(o => o.id)));
  persisted = new Map(state.data.items.map(i => [i.id, snapshotItem(i)]));
  lastRec = '';
}

/** Alt → neu in einer einzigen Transaktion: entweder ist alles umgestellt, oder es bleibt alles beim Alten. */
async function migrate(d, legacy){
  const { items, record } = splitLegacy(legacy, newId);
  const write = withCopy => run(d, ['kv', 'items'], 'readwrite', tx => {
    const it = tx.objectStore('items'), kv = tx.objectStore('kv');
    for(const i of items) it.put(i);
    if(withCopy) kv.put(legacy, 's_v1');
    kv.put(record, 's');
  });
  try{ await write(true); }
  catch(e){ await write(false); }   // z. B. zu wenig Platz für die Kopie: Daten sind wichtiger als das Sicherheitsnetz
  await setMeta({migratedAt:Date.now()});
  return unpackState(record, items);
}

/** Die Kopie des alten Formats nach 14 Tagen wieder freigeben. */
async function tidyLegacy(d){
  const has = await ask(d, 'kv', o => o.count('s_v1')).catch(() => 0);
  if(!has) return;
  const m = await getMeta();
  if(!m.migratedAt){ await setMeta({migratedAt:Date.now()}); return; }
  if(legacyExpired(m.migratedAt, Date.now())){ try{ await run(d, 'kv', 'readwrite', tx => tx.objectStore('kv').delete('s_v1')); await setMeta({migratedAt:0}); }catch(e){} }
}

export async function load(){
  for(let n = 0; n < 4; n++){
    try{
      const d = await idb;
      const rec = await ask(d, 'kv', o => o.get('s'));
      let u;
      if(!rec) u = unpackState(null, []);
      else if(isCurrent(rec)) u = unpackState(rec, await ask(d, 'items', o => o.getAll()));
      else u = await migrate(d, rec);
      apply(u); handle = d;
      tidyLegacy(d);
      navigator.storage?.persist?.(); return true;
    }catch(e){ await new Promise(r => setTimeout(r, 250)); }
  }
  return false; // Lesen oder Umstellen fehlgeschlagen: nichts überschreiben
}

async function kv(mode, key, val){
  const d = await idb;
  return new Promise((res, rej) => { const o = d.transaction('kv', mode).objectStore('kv'), q = mode === 'readonly' ? o.get(key) : o.put(val, key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
export async function getMeta(){ try{ const m = await kv('readonly', 'meta'); return m && typeof m === 'object' ? m : {}; }catch(e){ return {}; } }
/** Lesen und Schreiben in einer Transaktion, damit sich gleichzeitige Änderungen nicht überholen. */
export async function setMeta(patch){
  try{
    const d = await idb;
    await run(d, 'kv', 'readwrite', tx => { const o = tx.objectStore('kv'), g = o.get('meta'); g.onsuccess = () => o.put({...(g.result && typeof g.result === 'object' ? g.result : {}), ...patch}, 'meta'); });
    return true;
  }catch(e){ return false; }
}

let pt = 0, ready = false, hook = null, failed = '';
export function onFlush(fn){ hook = fn; }
const failText = e => e && e.name === 'QuotaExceededError'
  ? 'Speicher voll – Änderungen werden nicht gesichert. Lege ein Backup an und lösche Teile, die du nicht mehr brauchst.'
  : 'Speichern fehlgeschlagen – bitte ein Backup anlegen und die Seite neu laden.';

/**
 * Schreibt, was sich seit dem letzten Mal geändert hat: geänderte Teile einzeln, dazu den kleinen Datensatz.
 * Die Transaktion entsteht ohne await davor, damit sie auch beim Schließen des Tabs noch angelegt wird.
 */
export function flush(){
  clearTimeout(pt); pt = 0;
  if(!ready || !handle) return Promise.resolve(false);
  state.data.board = state.board; state.data.fitted = state.fitted;
  hook?.();
  const { puts, deletes } = diffItems(persisted, state.data.items);
  const rec = packState(state.data), json = JSON.stringify(rec);
  if(!puts.length && !deletes.length && json === lastRec) return Promise.resolve(true);
  const before = new Map([...puts, ...deletes.map(id => ({id}))].map(i => [i.id, persisted.get(i.id)]));
  const snaps = new Map(puts.map(i => [i.id, snapshotItem(i)]));
  const dropThumbs = [...deletes, ...puts.filter(i => persisted.get(i.id) && persisted.get(i.id).img !== i.img).map(i => i.id)];
  for(const [id, s] of snaps) persisted.set(id, s);
  for(const id of deletes) persisted.delete(id);
  lastRec = json;
  return run(handle, ['kv', 'items', 'thumbs'], 'readwrite', tx => {
    const it = tx.objectStore('items'), th = tx.objectStore('thumbs');
    for(const i of puts) it.put(i);
    for(const id of deletes) it.delete(id);
    for(const id of dropThumbs) th.delete(id);
    tx.objectStore('kv').put(rec, 's');
  }).then(() => { if(failed){ failed = ''; status(''); } document.dispatchEvent(new Event('anprobe:saved')); return true; }, e => {
    for(const [id, old] of before){ if(old) persisted.set(id, old); else persisted.delete(id); }   // beim nächsten Mal erneut versuchen
    lastRec = '';
    failed = failText(e); status(failed);
    return false;
  });
}
export function persist(){ if(!pt) pt = setTimeout(flush, 200); } // speichert spätestens 200 ms nach einer Änderung
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'hidden') flush(); });
addEventListener('pagehide', flush);
export function setReady(v){ ready = v; }
