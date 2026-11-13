// @ts-nocheck
import * as Fit from './fit.js';
import { $, announce, item, loadImg, state } from './core.js';
import { aspects, pieceEls, piecesFor, stylePiece } from './board.js';
import { drawKnob, syncBench } from './rotation.js';
import { renderSum } from './outfits.js';
import { persist } from './storage.js';
import { step, undo } from './history.js';
import { toast } from './ui.js';

const measured = new Map();
const FALLBACK = { aspect: 1.3, waist: Fit.DEFAULTS.waist, hem: Fit.DEFAULTS.hem };
const MEASURE_MS = 6000;

function measure(it){
  const key = it.id + ':' + it.img.length + ':' + (it.cut ? 1 : 0);
  const forget = () => { measured.delete(key); return FALLBACK; };   // Ersatzmaße nicht merken: beim nächsten Mal wird neu gemessen
  if(!measured.has(key)) measured.set(key, Promise.race([(async () => {
    try{
      const im = await loadImg(it.img);
      const aspect = im.naturalHeight / im.naturalWidth || FALLBACK.aspect;
      if(!it.cut) return {aspect, waist:Fit.DEFAULTS.waist, hem:Fit.DEFAULTS.hem};
      const W = 64, H = Math.max(8, Math.min(192, Math.round(W * aspect)));
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d', {willReadFrequently:true}); x.drawImage(im, 0, 0, W, H);
      const px = x.getImageData(0, 0, W, H).data, alpha = new Uint8Array(W * H);
      for(let i = 0; i < alpha.length; i++) alpha[i] = px[i * 4 + 3];
      return {aspect, ...Fit.bandRatios(alpha, W, H)};
    }catch(e){ return forget(); }
  })(), new Promise(res => setTimeout(() => res(forget()), MEASURE_MS))]));
  return measured.get(key);
}

let tok = 0;
/**
 * @returns {Promise<boolean|null>} true = angeordnet, false = Fehler, null = von einem neueren Aufruf abgelöst oder nichts zu tun
 */
export async function fitBoard(){
  const my = ++tok;
  try{
    const parts = (await Promise.all(state.board.map(async p => {
      const it = item(p.id); if(!it) return null;
      return {id:p.id, cat:it.cat, ...await measure(it)};
    }))).filter(Boolean);
    if(my !== tok || !parts.length) return null;
    apply(parts);
    return true;
  }catch(e){ console.error('Anordnen fehlgeschlagen', e); return false; }
}

/** Ordnet die Teile passend an, ohne das Board anzufassen (z. B. zum direkten Speichern eines Vorschlags). Bei Fehlern bleiben die Standardplätze. */
export async function layoutItems(list){
  const pieces = piecesFor(list);
  try{
    const parts = await Promise.all(pieces.map(async p => ({id:p.id, cat:item(p.id).cat, ...await measure(item(p.id))})));
    for(const s of Fit.layout(parts)){ const p = pieces.find(k => k.id === s.id); if(p){ p.x = s.x; p.y = s.y; p.w = s.w; p.r = 0; } }
  }catch(e){ /* Standardplätze genügen */ }
  return pieces;
}

function apply(parts){
  const slots = Fit.layout(parts);
  for(const s of slots){
    const p = state.board.find(k => k.id === s.id); if(!p) continue;
    p.x = s.x; p.y = s.y; p.w = s.w; p.r = 0;
    aspects.set(p.id, parts.find(k => k.id === p.id).aspect);
  }
  state.fitted = true;
  const board = $('board'); board.classList.add('snap');   // weiches Gleiten (nur bei erlaubter Bewegung, siehe CSS)
  pieceEls.forEach((el, id) => { const p = state.board.find(k => k.id === id); if(p) stylePiece(p, el); });
  setTimeout(() => board.classList.remove('snap'), 400);
  drawKnob(); syncBench(); renderSum(); persist();
}

$('fit').onclick = async () => {
  step();
  const done = await fitBoard();
  if(done === true){ announce('Teile passend angeordnet'); toast('Teile passend angeordnet', {haptic:'success', action:{label:'Rückgängig', fn:undo}}); }
  else if(done === false) toast('Anordnen hat nicht geklappt. Bitte versuche es noch einmal.', {kind:'error'});
};
