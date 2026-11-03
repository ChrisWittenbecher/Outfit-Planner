// @ts-nocheck
/**
 * Anprobe – Outfit-Fitter (Oberfläche): misst die Umrisse der Teile und ordnet sie passend zueinander an.
 * Die Rechnung steht in js/fit.js (rein, getestet); hier liegen Messung am Bild, Anwenden aufs Board und der Knopf.
 *
 * Automatisch passiert das nur, solange nichts von Hand verstellt wurde (state.fitted). Wer ein Teil verschiebt,
 * skaliert oder dreht, behält sein Layout; „Passend anordnen“ stellt die Passform jederzeit wieder her.
 */
import * as Fit from './fit.js';
import { $, announce, item, loadImg, state } from './core.js';
import { aspects, pieceEls, stylePiece } from './board.js';
import { drawKnob, syncBench } from './rotation.js';
import { renderSum } from './outfits.js';
import { persist } from './storage.js';

const measured = new Map();   // Schlüssel aus Id und Bildlänge -> Versprechen mit { aspect, waist, hem }
const FALLBACK = { aspect: 1.3, waist: Fit.DEFAULTS.waist, hem: Fit.DEFAULTS.hem };

/** Misst Seitenverhältnis und Umriss eines Teils (einmal je Bild, danach aus dem Zwischenspeicher). */
function measure(it){
  const key = it.id + ':' + it.img.length + ':' + (it.cut ? 1 : 0);
  if(!measured.has(key)) measured.set(key, (async () => {
    try{
      const im = await loadImg(it.img);
      const aspect = im.naturalHeight / im.naturalWidth || FALLBACK.aspect;
      if(!it.cut) return {aspect, waist:Fit.DEFAULTS.waist, hem:Fit.DEFAULTS.hem};   // ohne Freistellung kein Umriss
      const W = 64, H = Math.max(8, Math.min(192, Math.round(W * aspect)));
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d', {willReadFrequently:true}); x.drawImage(im, 0, 0, W, H);
      const px = x.getImageData(0, 0, W, H).data, alpha = new Uint8Array(W * H);
      for(let i = 0; i < alpha.length; i++) alpha[i] = px[i * 4 + 3];
      return {aspect, ...Fit.bandRatios(alpha, W, H)};
    }catch(e){ return FALLBACK; }
  })());
  return measured.get(key);
}

let tok = 0;
/** Ordnet alle Teile auf dem Board passend an (Größe, Lage, Drehung 0°). Das zuletzt gestartete Anordnen gewinnt. */
export async function fitBoard(){
  const my = ++tok;
  const parts = (await Promise.all(state.board.map(async p => {
    const it = item(p.id); if(!it) return null;
    return {id:p.id, cat:it.cat, ...await measure(it)};
  }))).filter(Boolean);
  if(my !== tok || !parts.length) return;
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

$('fit').onclick = async () => { await fitBoard(); announce('Teile passend angeordnet'); };
