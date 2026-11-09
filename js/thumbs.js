// @ts-nocheck
import { loadImg, state, thumbMap } from './core.js';
import { db } from './storage.js';
import { thumbKey } from './model.js';

/** Längste Seite der Vorschau in Pixeln. Das reicht für Karten und Mini-Outfits auch auf dreifach dichten Bildschirmen. */
export const THUMB = 480;
const todo = new Set();   // Schlüssel id + Bild, die schon versucht wurden
let timer = 0, busy = false;

const valid = t => t && typeof t.k === 'string' && typeof t.d === 'string' && /^data:image\/(png|webp|jpeg);base64,/.test(t.d);

/** Liest gespeicherte Vorschaubilder und räumt Reste gelöschter Teile weg. */
export async function loadThumbs(){
  try{
    const d = await db(), live = new Set(state.data.items.map(i => i.id)), stale = [];
    await new Promise((res, rej) => {
      const tx = d.transaction('thumbs'), q = tx.objectStore('thumbs').openCursor();
      q.onsuccess = () => { const c = q.result; if(!c) return res(); if(live.has(c.key) && valid(c.value)) thumbMap.set(c.key, c.value); else stale.push(c.key); c.continue(); };
      q.onerror = () => rej(q.error);
    });
    if(stale.length){ const o = d.transaction('thumbs', 'readwrite').objectStore('thumbs'); for(const k of stale) o.delete(k); }
  }catch(e){}
}

/** Verkleinert ein Bild. Gibt null zurück, wenn sich das nicht lohnt. */
async function make(src){
  const im = await loadImg(src), long = Math.max(im.naturalWidth, im.naturalHeight);
  if(!long || long <= THUMB) return null;
  const f = THUMB / long, c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(im.naturalWidth * f)); c.height = Math.max(1, Math.round(im.naturalHeight * f));
  c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
  const out = c.toDataURL('image/webp', 0.85);   // ohne WebP-Unterstützung liefert der Browser PNG
  return out.length < src.length ? out : null;
}

function swap(id, k, d){
  for(const im of document.querySelectorAll('img[data-th]')) if(im.dataset.th === id && im.dataset.tk === k) im.src = d;
}

async function work(){
  if(busy) return; busy = true;
  try{
    for(let more = true; more;){
      more = false;
      for(const it of [...state.data.items]){
        const k = thumbKey(it.img), mark = it.id + '|' + k;
        if(!it.img || todo.has(mark) || thumbMap.get(it.id)?.k === k) continue;
        todo.add(mark); more = true;
        let d = null; try{ d = await make(it.img); }catch(e){}
        const now = state.data.items.find(x => x.id === it.id);
        if(!d || !now || thumbKey(now.img) !== k) continue;   // zu klein, Bild geändert oder Teil gelöscht
        const t = {k, d};
        thumbMap.set(it.id, t); swap(it.id, k, d);
        try{ (await db()).transaction('thumbs', 'readwrite').objectStore('thumbs').put(t, it.id); }catch(e){}
        await new Promise(r => setTimeout(r, 0));   // dazwischen darf die Oberfläche reagieren
      }
    }
  }finally{ busy = false; }
}

/** Erzeugt fehlende Vorschaubilder nach und nach im Hintergrund. */
export function wantThumbs(){
  if(timer) return;
  timer = setTimeout(() => { timer = 0; work(); }, 250);
}
