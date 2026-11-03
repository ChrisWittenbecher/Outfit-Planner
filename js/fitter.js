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
import { step, undo } from './history.js';
import { toast } from './ui.js';

const measured = new Map();   // Schlüssel aus Id und Bildlänge -> Versprechen mit { aspect, waist, hem }
const FALLBACK = { aspect: 1.3, waist: Fit.DEFAULTS.waist, hem: Fit.DEFAULTS.hem };
const MEASURE_MS = 6000;   // so lange wartet das Anordnen höchstens auf ein Bild; danach gelten Standardmaße (ein hängendes Bild blockiert nie alles)

/** Misst Seitenverhältnis und Umriss eines Teils (einmal je Bild, danach aus dem Zwischenspeicher). */
function measure(it){
  const key = it.id + ':' + it.img.length + ':' + (it.cut ? 1 : 0);
  const forget = () => { measured.delete(key); return FALLBACK; };   // Ersatzmaße nicht merken: beim nächsten Mal wird neu gemessen
  if(!measured.has(key)) measured.set(key, Promise.race([(async () => {
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
    }catch(e){ return forget(); }
  })(), new Promise(res => setTimeout(() => res(forget()), MEASURE_MS))]));
  return measured.get(key);
}

let tok = 0;
/**
 * Ordnet alle Teile auf dem Board passend an (Größe, Lage, Drehung 0°). Das zuletzt gestartete Anordnen gewinnt.
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
  step();   // eigener Schritt, damit „Rückgängig“ genau diese Anordnung zurücknimmt
  const done = await fitBoard();
  if(done === true){ announce('Teile passend angeordnet'); toast('Teile passend angeordnet', {action:{label:'Rückgängig', fn:undo}}); }   // sichtbare Rückmeldung (auf dem Handy liegt das Board oft außerhalb des Bildschirms)
  else if(done === false) toast('Anordnen hat nicht geklappt. Bitte versuche es noch einmal.', {kind:'error'});
};
