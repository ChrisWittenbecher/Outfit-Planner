// @ts-nocheck
import * as Geo from './geometry.js';
import { cleanPieces, fixOrder } from './board.js';
import { state } from './core.js';

const idb = new Promise((res, rej) => {
  const q = indexedDB.open('anprobe', 1);
  q.onupgradeneeded = () => q.result.createObjectStore('kv');
  q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
});
export async function load(){
  for(let n = 0; n < 4; n++){
    try{
      const d = await idb;
      const v = await new Promise((res, rej) => { const q = d.transaction('kv').objectStore('kv').get('s'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      if(v){ state.data = {items:v.items || [], outfits:v.outfits || []}; state.board = fixOrder(cleanPieces(v.board)); state.fitted = v.fitted !== false; state.data.outfits = state.data.outfits.filter(o => o && typeof o.name === 'string'); state.data.outfits.forEach(o => { o.pieces = fixOrder(Geo.sanitizePieces(o.pieces)); }); }
      navigator.storage?.persist?.(); return true;
    }catch(e){ await new Promise(r => setTimeout(r, 250)); }
  }
  return false; // Lesen fehlgeschlagen: nichts überschreiben
}
let pt = 0, ready = false, hook = null;
export function onFlush(fn){ hook = fn; }
export async function flush(){ clearTimeout(pt); pt = 0; if(!ready) return; state.data.board = state.board; state.data.fitted = state.fitted; hook?.(); try{ const d = await idb; d.transaction('kv','readwrite').objectStore('kv').put(state.data,'s'); }catch(e){} }
export function persist(){ if(!pt) pt = setTimeout(flush, 200); } // speichert spätestens 200 ms nach einer Änderung
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'hidden') flush(); });
addEventListener('pagehide', flush);
export function setReady(v){ ready = v; }
