// @ts-nocheck
/**
 * Anprobe – Strichmensch als Proportionshilfe.
 */
import { $, announce, loadImg, state } from './core.js';
import { flush } from './storage.js';
 // Safari: kein Seitenzoom beim Spreizen

/* ---------- Strichmensch (Proportionshilfe) ---------- */
export function syncFigure(){ $('figure').toggleAttribute('hidden', !state.data.figure); $('figBtn').setAttribute('aria-pressed', String(!!state.data.figure)); }
$('figBtn').onclick = () => { state.data.figure = !state.data.figure; syncFigure(); flush(); announce(state.data.figure ? 'Strichmensch eingeblendet' : 'Strichmensch ausgeblendet'); };
/** Der Strichmensch als Bild (für den PNG-Export). */
export function figureImage(){
  const svg = new XMLSerializer().serializeToString($('figure')).replace(/ hidden=""/, '');
  return loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
}