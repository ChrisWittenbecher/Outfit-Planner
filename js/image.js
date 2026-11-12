// @ts-nocheck
import { loadImg } from './core.js';
import { IMAGE_LIMITS } from './scraper.js';
import { dominantColor } from './color.js';

export async function norm(src, max = 1000){ // verkleinert; behält Transparenz bei PNGs
  const im = await loadImg(src, /^https?:/.test(src));
  if(!(im.naturalWidth > 0) || im.naturalWidth * im.naturalHeight > IMAGE_LIMITS.pixels) throw new Error('Bild zu groß');
  const k = Math.min(1, max / Math.max(im.width, im.height));
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
  const x = c.getContext('2d', {willReadFrequently:true}); x.drawImage(im, 0, 0, c.width, c.height);
  const d = x.getImageData(0, 0, c.width, c.height).data; let t = 0;
  for(let i = 3; i < d.length; i += 16) if(d[i] < 240) t++;
  const alpha = t > d.length / 16 * .01;
  return {url: alpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', .9), alpha};
}
function cutout(cv, tol){ // Hintergrund = vom Rand aus erreichbare, ähnlich gefärbte Fläche
  const w = cv.width, h = cv.height, x = cv.getContext('2d', {willReadFrequently:true}), id = x.getImageData(0, 0, w, h), d = id.data, n = w * h;
  const R = [], G = [], B = [], edge = i => { R.push(d[i*4]); G.push(d[i*4+1]); B.push(d[i*4+2]); };
  for(let i = 0; i < w; i++){ edge(i); edge((h-1)*w + i); } for(let j = 1; j < h-1; j++){ edge(j*w); edge(j*w + w-1); }
  const med = a => a.sort((p, q) => p - q)[a.length >> 1], mr = med(R), mg = med(G), mbl = med(B);
  const dm = i => Math.hypot(d[i*4]-mr, d[i*4+1]-mg, d[i*4+2]-mbl);
  const dp = (i, j) => Math.hypot(d[i*4]-d[j*4], d[i*4+1]-d[j*4+1], d[i*4+2]-d[j*4+2]);
  const tg = tol * 2.4, ts = Math.max(5, tol * .3), bg = new Uint8Array(n), st = new Int32Array(n); let sp = 0;
  const seed = i => { if(!bg[i] && (d[i*4+3] < 10 || dm(i) < tg)){ bg[i] = 1; st[sp++] = i; } };
  for(let i = 0; i < w; i++){ seed(i); seed((h-1)*w + i); } for(let j = 0; j < h; j++){ seed(j*w); seed(j*w + w-1); }
  while(sp){
    const i = st[--sp], px = i % w, py = (i / w) | 0;
    const nb = [px > 0 ? i-1 : -1, px < w-1 ? i+1 : -1, py > 0 ? i-w : -1, py < h-1 ? i+w : -1];
    for(const j of nb) if(j >= 0 && !bg[j] && (d[j*4+3] < 10 || (dp(i, j) < ts && dm(j) < tg))){ bg[j] = 1; st[sp++] = j; }
  }
  const seen = new Uint8Array(n), comps = []; 
  for(let s0 = 0; s0 < n; s0++){
    if(bg[s0] || seen[s0]) continue;
    const list = [s0]; seen[s0] = 1;
    for(let q = 0; q < list.length; q++){ const i = list[q], px = i % w, py = (i / w) | 0;
      for(const j of [px > 0 ? i-1 : -1, px < w-1 ? i+1 : -1, py > 0 ? i-w : -1, py < h-1 ? i+w : -1]) if(j >= 0 && !bg[j] && !seen[j]){ seen[j] = 1; list.push(j); } }
    comps.push(list);
  }
  const big = Math.max(0, ...comps.map(c => c.length));
  comps.forEach(c => { if(c.length < Math.max(30, n * .004) && c.length < big) c.forEach(i => bg[i] = 1); });
  // Kante: 1 px abtragen und weichzeichnen
  const fg = i => i < 0 || i >= n ? 1 : (bg[i] ? 0 : 1), er = new Uint8Array(n);
  for(let i = 0; i < n; i++){ const px = i % w, py = (i / w) | 0; er[i] = !bg[i] && (px === 0 || fg(i-1)) && (px === w-1 || fg(i+1)) && (py === 0 || fg(i-w)) && (py === h-1 || fg(i+w)) ? 255 : 0; }
  for(let py = 0; py < h; py++) for(let px = 0; px < w; px++){
    let s = 0, c = 0; for(let dy = -1; dy <= 1; dy++) for(let dx = -1; dx <= 1; dx++){ const X = px+dx, Y = py+dy; if(X >= 0 && X < w && Y >= 0 && Y < h){ s += er[Y*w+X]; c++; } }
    const i = py*w + px; d[i*4+3] = Math.round(s / c * d[i*4+3] / 255);
  }
  x.putImageData(id, 0, 0); return cv;
}
function trim(cv){ // schneidet transparenten Rand weg
  const w = cv.width, h = cv.height, d = cv.getContext('2d', {willReadFrequently:true}).getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for(let y = 0; y < h; y++) for(let x = 0; x < w; x++) if(d[(y*w + x)*4 + 3] > 16){ if(x < x0) x0 = x; if(x > x1) x1 = x; if(y < y0) y0 = y; if(y > y1) y1 = y; }
  if(x1 < 0) return cv;
  const p = Math.round(Math.max(x1 - x0, y1 - y0) * .03) + 1; x0 = Math.max(0, x0-p); y0 = Math.max(0, y0-p); x1 = Math.min(w-1, x1+p); y1 = Math.min(h-1, y1+p);
  const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
  o.getContext('2d').drawImage(cv, x0, y0, o.width, o.height, 0, 0, o.width, o.height); return o;
}
/** Sagt ehrlich, woran das KI-Freistellen scheiterte, statt immer „Internet nötig“ zu behaupten. */
export function aiFailure(e, blocked){
  if(blocked.length) return 'KI-Freistellen: von den Sicherheitsregeln blockiert (' + blocked.slice(0, 2).join(', ') + ').';
  if(typeof navigator !== 'undefined' && navigator.onLine === false) return 'KI-Freistellen nicht verfügbar: kein Internet.';
  const why = String(e && (e.message || e.name) || e).replace(/\s+/g, ' ').slice(0, 90);
  return 'KI-Freistellen konnte nicht starten (' + why + ').';
}
let aiBlocked = [];
if(typeof document !== 'undefined') document.addEventListener('securitypolicyviolation', e => { if(aiBlocked.length < 4) aiBlocked.push(e.violatedDirective + ' ' + (e.blockedURI || '').slice(0, 40)); });
export const aiBlockedList = () => aiBlocked;
async function aiCut(cv, say = () => {}){ // optional: genaues KI-Freistellen im Browser (lädt Modell von jsDelivr/imgly)
  say('KI-Modell wird geladen … (einmalig ca. 40 MB)');
  aiBlocked = [];
  const m = await import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/+esm');
  const blob = await m.removeBackground(cv.toDataURL('image/png'), {progress:(k, c, t) => { if(t) say('KI: ' + Math.round(c / t * 100) + ' %'); }});
  const im = await loadImg(URL.createObjectURL(blob)), o = document.createElement('canvas'); o.width = im.width; o.height = im.height; o.getContext('2d').drawImage(im, 0, 0); return o;
}
function countParts(cv){ // zählt getrennte Teile (z. B. Schuhpaar = 2)
  const k = Math.min(1, 160 / Math.max(cv.width, cv.height)), w = Math.max(1, Math.round(cv.width * k)), h = Math.max(1, Math.round(cv.height * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', {willReadFrequently:true}); x.drawImage(cv, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data, seen = new Uint8Array(w * h), sizes = [];
  for(let s0 = 0; s0 < w * h; s0++){
    if(seen[s0] || d[s0*4+3] < 128) continue; const list = [s0]; seen[s0] = 1;
    for(let q = 0; q < list.length; q++){ const i = list[q], px = i % w, py = (i / w) | 0;
      for(const j of [px > 0 ? i-1 : -1, px < w-1 ? i+1 : -1, py > 0 ? i-w : -1, py < h-1 ? i+w : -1]) if(j >= 0 && !seen[j] && d[j*4+3] >= 128){ seen[j] = 1; list.push(j); } }
    sizes.push(list.length);
  }
  const big = Math.max(0, ...sizes); return sizes.filter(n => n >= big * .3 && n >= 20).length;
}
function mirrorPair(cv){ // ergänzt einen gespiegelten zweiten Schuh
  const g = Math.round(cv.width * .04), o = document.createElement('canvas'); o.width = cv.width * 2 + g; o.height = cv.height; const x = o.getContext('2d');
  x.drawImage(cv, 0, 0); x.save(); x.translate(o.width, 0); x.scale(-1, 1); x.drawImage(cv, 0, 0); x.restore(); return o;
}
/**
 * @param {{orig:string, crop:?{x:number,y:number,w:number,h:number}, alpha:boolean, rm:boolean, tol:number, ai:boolean, mirror:boolean, mirrorTouched:boolean}} d
 * @param {string} cat Kategorie (steuert die Schuh-Spiegelung)
 * @param {(t:string, err?:boolean)=>void} [say] Meldungen für die Oberfläche
 * @returns {Promise<{img:string, cut:boolean, mirror:boolean}>}
 */
export async function makeImage(d, cat, say = () => {}){
  const im = await loadImg(d.orig), c = d.crop || {x:0, y:0, w:im.width, h:im.height};
  const k = Math.min(1, 700 / Math.max(c.w, c.h)), cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(c.w * k)); cv.height = Math.max(1, Math.round(c.h * k));
  cv.getContext('2d', {willReadFrequently:true}).drawImage(im, c.x, c.y, c.w, c.h, 0, 0, cv.width, cv.height);
  let out = cv, cut = false;
  if(d.rm){
    cut = true;
    if(d.alpha) out = cv;
    else if(d.ai){ try{ out = await aiCut(cv, say); say(''); }catch(e){ d.ai = false; console.error('KI-Freistellen', e); say(aiFailure(e, aiBlocked) + ' Es gilt die normale Freistellung.', true); out = cutout(cv, d.tol); } }
    else out = cutout(cv, d.tol);
    out = trim(out);
  }
  if(cat === 'Schuhe'){ if(d.rm && !d.mirrorTouched) d.mirror = countParts(out) < 2; if(d.mirror) out = mirrorPair(out); } else d.mirror = false;
  return {img: cut ? out.toDataURL('image/png') : out.toDataURL('image/jpeg', .9), cut, mirror: !!d.mirror};
}
/** Häufigste Farbe eines fertigen Bildes (nur auf dem Gerät gerechnet). @returns {Promise<string|null>} */
export async function detectColor(src, cut){
  const im = await loadImg(src), k = Math.min(1, 64 / Math.max(im.width, im.height));
  const w = Math.max(1, Math.round(im.width * k)), h = Math.max(1, Math.round(im.height * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', {willReadFrequently:true}); x.drawImage(im, 0, 0, w, h);
  return dominantColor(x.getImageData(0, 0, w, h).data, w, h, {center:!cut});
}
