// @ts-nocheck
import { haptic } from './haptics.js';
import * as Scraper from './scraper.js';
import { CATS, newId, readFile, state } from './core.js';
import { detectColor, makeImage, norm } from './image.js';
import { MAX_BATCH, nameFromFile } from './intake.js';
import { recordPrice } from './prices.js';
import { renderAll } from './render.js';
import { flush } from './storage.js';
import { step, undo } from './history.js';
import { toast } from './ui.js';

let busy = false;
const yieldUi = () => new Promise(r => setTimeout(r, 0));

/** Fügt mehrere Bilder auf einmal hinzu: freigestellt, mit Namen aus dem Dateinamen, in einem Schritt rückgängig zu machen. */
export async function addMany(files){
  if(busy){ toast('Es läuft noch ein Import. Bitte kurz warten.', {kind:'error'}); return; }
  const images = files.filter(f => f && typeof f.type === 'string' && f.type.startsWith('image/'));
  const list = images.slice(0, MAX_BATCH), notImage = files.length - images.length, tooMany = images.length - list.length;
  if(!list.length){ toast('Das sind keine Bilder.', {kind:'error'}); return; }
  busy = true;
  const cat = state.filter !== 'Alle' ? state.filter : CATS[0], wish = state.statusFilter === 'wish';
  const made = []; let failed = 0;
  try{
    for(let i = 0; i < list.length; i++){
      toast('Bild ' + (i + 1) + ' von ' + list.length + ' wird verarbeitet …', {ms:120000});
      await yieldUi();
      const f = list[i];
      try{
        if(f.size > Scraper.IMAGE_LIMITS.bytes) throw new Error('zu groß');
        const n = await norm(await readFile(f));
        const r = await makeImage({orig:n.url, crop:null, alpha:n.alpha, rm:true, tol:28, mirror:false, mirrorTouched:false}, cat);
        const it = {id:newId(), img:r.img, orig:n.url, alpha:n.alpha, cut:r.cut, mirror:r.mirror, name:nameFromFile(f.name, Scraper.sanitizeText), cat, link:'', price:null, cur:'EUR', status:wish ? 'wish' : 'own', priceHistory:recordPrice([], null), tags:[]};
        const color = await detectColor(r.img, r.cut).catch(() => null); if(color) it.color = color;
        made.push(it);
      }catch(e){ failed++; }
    }
  } finally { busy = false; }
  if(!made.length){ toast('Kein Bild konnte verarbeitet werden.', {kind:'error'}); return; }
  step(); state.data.items.unshift(...made); renderAll(); flush();
  const skipped = failed + notImage + tooMany;
  const why = [failed + notImage ? (failed + notImage) + ' nicht lesbar' : '', tooMany ? tooMany + ' über dem Limit von ' + MAX_BATCH : ''].filter(Boolean).join(', ');
  haptic('success');
  toast(made.length + (made.length === 1 ? ' Teil' : ' Teile') + ' hinzugefügt (Kategorie ' + cat + (wish ? ', Wunschliste' : '') + ')' + (skipped ? '. Übersprungen: ' + why : '') + '. Namen und Angaben änderst du mit ✎.', {ms:skipped ? 14000 : 10000, action:{label:'Rückgängig', fn:undo}});
}
