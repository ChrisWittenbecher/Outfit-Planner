/* ==========================================================================
   Anprobe – Anwendungslogik
   Module (js/): geometry.js (Drehen), scraper.js (Link-Import, Bereinigung),
   barcode.js (Prüfziffer), scanner.js (Kamera), main.js (lädt die Module).
   Aufbau dieser Datei:
     1. Typen und Zustand      4. Bildverarbeitung (Freistellen, Zuschnitt)
     2. Hilfsfunktionen        5. Dialog, Link-Import, Kleiderschrank
     3. Speicher (IndexedDB)   6. Board, Drehen, Preise, Outfits, Link- und Barcode-Module
   ========================================================================== */
'use strict';

/* Abhängigkeit: js/main.js (ES-Modul) stellt window.Anprobe bereit und lädt vor dieser Datei.
   ES-Module laufen nicht per Doppelklick (file://) – dann hilft ein Hinweis statt einer leeren Seite. */
const Anprobe = /** @type {any} */ (window).Anprobe;
const Geo = Anprobe?.geometry, Scraper = Anprobe?.scraper, Barcode = Anprobe?.barcode, Scanner = Anprobe?.scanner;
if(!(Geo && Scraper && Barcode && Scanner)){
  document.getElementById('saveState').textContent = 'Module konnten nicht geladen werden. Bitte über GitHub Pages oder „python3 server.py“ öffnen (nicht per Doppelklick).';
  throw new Error('Anprobe: js/main.js (ES-Module) wurde nicht geladen');
}

/**
 * @typedef {Object} Item      Ein Kleidungsstück im Kleiderschrank
 * @property {string} id
 * @property {string} name
 * @property {'Oberteil'|'Jacke'|'Hose/Rock'|'Schuhe'|'Accessoire'} cat
 * @property {string} img       freigestelltes Bild als data:-URL
 * @property {string} [orig]    Originalbild (zum erneuten Freistellen)
 * @property {boolean} [cut]    true = Hintergrund entfernt (echte Transparenz)
 * @property {boolean} [alpha]  Original hatte schon Transparenz
 * @property {boolean} [mirror] zweiter Schuh wurde ergänzt
 * @property {string} link      Link zum Angebot (leer oder http/https)
 * @property {number|null} price
 * @property {string} cur       Währungscode, z. B. EUR
 * @property {string} [ean]     Barcode (EAN/UPC), wenn das Teil per Scan hinzugefügt wurde
 */
/**
 * @typedef {Object} Piece     Ein Teil auf dem Board. Die Reihenfolge im Array = Ebenen (hinten → vorn)
 * @property {string} id       Verweis auf Item.id
 * @property {number} x @property {number} y @property {number} w
 * @property {number} r       Drehung in Grad (0 ≤ r < 360), Drehpunkt = Bildmitte
 */
/** @typedef {{id:string, name:string, pieces:Piece[]}} Outfit */

const CATS = ['Oberteil','Jacke','Hose/Rock','Schuhe','Accessoire'];
// Standardposition: x, y, Breite, Ebene
const DEF = {'Oberteil':[100,30,200,2],'Jacke':[8,50,150,4],'Hose/Rock':[110,230,180,1],'Schuhe':[110,470,180,2],'Accessoire':[280,260,100,5]};
const $ = id => document.getElementById(id);
const enc = encodeURIComponent;
let S = {items:[], outfits:[]}, board = [], filter = 'Alle', draft = null, sel = null, editing = null, dlgEan = '', K = 1;
const LOCAL = ['localhost','127.0.0.1'].includes(location.hostname) || /^(192\.168|10)\./.test(location.hostname);
const DROP = 'Screenshot hierher ziehen, einfügen (Strg/Cmd + V) oder klicken zum Auswählen';
const item = id => S.items.find(i => i.id === id);
const imgOf = id => item(id)?.img;
const mb = it => it && it.cut ? '' : ' mb';
const loadImg = (src, cors) => new Promise((res, rej) => { const i = new Image(); if(cors) i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
const readFile = f => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
const money = (v, c) => { try{ return new Intl.NumberFormat('de-DE', {style:'currency', currency:c || 'EUR'}).format(v); }catch(e){ return v.toFixed(2) + ' ' + c; } };
const parsePrice = Scraper.parsePrice; // Preis aus Text lesen (siehe js/scraper.js)
const newId = () => 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------- Speicher (IndexedDB, bleibt im Browser erhalten) ---------- */
const idb = new Promise((res, rej) => {
  const q = indexedDB.open('anprobe', 1);
  q.onupgradeneeded = () => q.result.createObjectStore('kv');
  q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
});
async function load(){
  for(let n = 0; n < 4; n++){
    try{
      const d = await idb;
      const v = await new Promise((res, rej) => { const q = d.transaction('kv').objectStore('kv').get('s'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      if(v){ S = {items:v.items || [], outfits:v.outfits || []}; board = fixOrder(cleanPieces(v.board)); S.outfits = S.outfits.filter(o => o && typeof o.name === 'string'); S.outfits.forEach(o => { o.pieces = fixOrder(Geo.sanitizePieces(o.pieces)); }); }
      navigator.storage?.persist?.(); return true;
    }catch(e){ await new Promise(r => setTimeout(r, 250)); }
  }
  return false; // Lesen fehlgeschlagen: nichts überschreiben
}
let pt = 0, ready = false;
async function flush(){ clearTimeout(pt); pt = 0; if(!ready) return; S.board = board; try{ const d = await idb; d.transaction('kv','readwrite').objectStore('kv').put(S,'s'); }catch(e){} }
function persist(){ if(!pt) pt = setTimeout(flush, 200); } // speichert spätestens 200 ms nach einer Änderung
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'hidden') flush(); });
addEventListener('pagehide', flush);

/* ---------- Bildverarbeitung: Zuschneiden & Freistellen ---------- */
async function norm(src, max = 1000){ // verkleinert; behält Transparenz bei PNGs
  const im = await loadImg(src, /^https?:/.test(src));
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
  // kleine Reste (Schatten, Etiketten) entfernen, größte Flächen behalten
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
async function aiCut(cv){ // optional: genaues KI-Freistellen im Browser (lädt Modell von jsDelivr/imgly)
  status('KI-Modell wird geladen … (einmalig ca. 40 MB)');
  const m = await import('https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.4.5/+esm');
  const blob = await m.removeBackground(cv.toDataURL('image/png'), {progress:(k, c, t) => { if(t) status('KI: ' + Math.round(c / t * 100) + ' %'); }});
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
const blank = () => ({orig:null, alpha:false, crop:null, rm:true, tol:28, ai:false, img:null, cut:false, mirror:false, mirrorTouched:false});
function syncMirror(){ $('mirrorRow').hidden = $('cat').value !== 'Schuhe'; if(draft) $('mirror').checked = !!draft.mirror; }
let tok = 0;
/**
 * Erzeugt aus einem Original das fertige Bild: zuschneiden, Hintergrund entfernen, Schuhe ergänzen.
 * Gemeinsam genutzt vom Dialog (process) und vom Direkt-Import (Link, Barcode).
 * `d.mirror` und `d.ai` können hier angepasst werden.
 * @param {{orig:string, crop:?{x:number,y:number,w:number,h:number}, alpha:boolean, rm:boolean, tol:number, ai:boolean, mirror:boolean, mirrorTouched:boolean}} d
 * @param {string} cat Kategorie (steuert die Schuh-Spiegelung)
 * @param {(t:string, err?:boolean)=>void} [say] Meldungen für die Oberfläche
 * @returns {Promise<{img:string, cut:boolean, mirror:boolean}>}
 */
async function makeImage(d, cat, say = () => {}){
  const im = await loadImg(d.orig), c = d.crop || {x:0, y:0, w:im.width, h:im.height};
  const k = Math.min(1, 700 / Math.max(c.w, c.h)), cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(c.w * k)); cv.height = Math.max(1, Math.round(c.h * k));
  cv.getContext('2d', {willReadFrequently:true}).drawImage(im, c.x, c.y, c.w, c.h, 0, 0, cv.width, cv.height);
  let out = cv, cut = false;
  if(d.rm){
    cut = true;
    if(d.alpha) out = cv;
    else if(d.ai){ try{ out = await aiCut(cv); say(''); }catch(e){ d.ai = false; say('KI-Freistellen nicht verfügbar (Internet nötig). Nutze die normale Freistellung.', true); out = cutout(cv, d.tol); } }
    else out = cutout(cv, d.tol);
    out = trim(out);
  }
  if(cat === 'Schuhe'){ if(d.rm && !d.mirrorTouched) d.mirror = countParts(out) < 2; if(d.mirror) out = mirrorPair(out); } else d.mirror = false;
  return {img: cut ? out.toDataURL('image/png') : out.toDataURL('image/jpeg', .9), cut, mirror: !!d.mirror};
}
/** Verarbeitet das Bild im Dialog und zeigt das Ergebnis an. */
async function process(){
  if(!draft || !draft.orig) return; const my = ++tok; draft.busy = true;
  try{
    const r = await makeImage(draft, $('cat').value, status);
    if(my !== tok) return;
    draft.img = r.img; draft.cut = r.cut;
    const el = new Image(); el.src = draft.img; el.alt = ''; $('res').replaceChildren(el); syncMirror();
  }catch(e){ if(my === tok) status('Bild konnte nicht verarbeitet werden.', true); }
  finally{ if(my === tok) draft.busy = false; }
}
let ptm; const processSoon = () => { clearTimeout(ptm); ptm = setTimeout(process, 120); };

/* ---------- Hinzufügen/Bearbeiten-Dialog ---------- */
CATS.forEach(c => $('cat').add(new Option(c, c)));
const guessCat = t => Scraper.guessCategory(t);
function autoCat(t){ const c = guessCat(t); if(c){ $('cat').value = c; syncMirror(); } }
/** Kündigt eine Änderung für Bildschirmleser an (aria-live). */
function announce(t){ const a = $('announcer'); a.textContent = ''; setTimeout(() => { a.textContent = t; }, 30); }
function status(t, err){ $('status').textContent = t; $('status').className = err ? 'err' : ''; }
function showOrig(){
  const d = $('drop');
  if(!draft || !draft.orig){ d.className = ''; d.textContent = DROP; return; }
  d.className = 'has'; d.innerHTML = '<div id="pv"><img alt=""><div id="selbox"></div></div>';
  const pv = $('pv'), im = pv.querySelector('img'), box = $('selbox'); im.src = draft.orig;
  pv.onpointerdown = e => {
    e.preventDefault(); pv.setPointerCapture(e.pointerId);
    const r = im.getBoundingClientRect(), cl = (v, m) => Math.max(0, Math.min(m, v)), sx = cl(e.clientX - r.left, r.width), sy = cl(e.clientY - r.top, r.height); let cur = {x:sx, y:sy, w:0, h:0};
    pv.onpointermove = m => { const ex = cl(m.clientX - r.left, r.width), ey = cl(m.clientY - r.top, r.height); cur = {x:Math.min(sx, ex), y:Math.min(sy, ey), w:Math.abs(ex - sx), h:Math.abs(ey - sy)}; Object.assign(box.style, {display:'block', left:cur.x+'px', top:cur.y+'px', width:cur.w+'px', height:cur.h+'px'}); };
    pv.onpointerup = () => {
      pv.onpointermove = pv.onpointerup = null;
      if(cur.w < 12 || cur.h < 12){ draft.crop = null; box.style.display = 'none'; }
      else { const kx = im.naturalWidth / r.width, ky = im.naturalHeight / r.height; draft.crop = {x:Math.round(cur.x*kx), y:Math.round(cur.y*ky), w:Math.round(cur.w*kx), h:Math.round(cur.h*ky)}; }
      process();
    };
  };
}
function syncOpts(){ syncMirror(); $('rm').checked = draft.rm; $('tol').value = draft.tol; $('tol').disabled = !draft.rm || draft.alpha; $('ai').disabled = !draft.rm || draft.alpha; }
function openDlg(it){
  editing = it || null; dlgEan = it ? it.ean || '' : '';
  draft = it ? {...blank(), orig:it.orig || it.img, alpha:!!it.alpha, rm:it.orig ? !!it.cut : true, img:it.img, cut:!!it.cut, mirror:!!it.mirror, mirrorTouched:true} : blank();
  $('dlgTitle').textContent = it ? 'Teil bearbeiten' : 'Neues Teil';
  $('url').value = it ? it.link || '' : ''; $('name').value = it ? it.name : ''; $('cat').value = it ? it.cat : CATS[0];
  $('price').value = it && it.price != null ? it.price.toFixed(2).replace('.', ',') : ''; $('cur').value = it && it.cur || 'EUR';
  status(''); showOrig(); syncOpts();
  if(it){ const r = new Image(); r.src = it.img; r.alt = ''; $('res').replaceChildren(r); if(!it.orig) process(); }
  else $('res').replaceChildren(Object.assign(document.createElement('span'), {textContent:'Noch kein Bild'}));
  if(!$('dlg').open) $('dlg').showModal();
}
async function setSource(src){
  if(!draft) draft = blank();
  const n = await norm(src); draft.orig = n.url; draft.alpha = n.alpha; draft.crop = null; draft.ai = false; showOrig(); syncOpts(); await process();
}
async function takeFile(f){ if(f && f.type.startsWith('image/')){ if(!$('dlg').open) openDlg(); try{ await setSource(await readFile(f)); }catch(e){ status('Bild konnte nicht gelesen werden.', true); } } }
/** Öffnet die Auswahl „Link / Barcode / Bild“. */
function openAdd(){ setLinkStatus(''); if(!$('addDlg').open) $('addDlg').showModal(); }
$('addBtn').onclick = openAdd;
$('fab').onclick = openAdd;
$('addClose').onclick = () => $('addDlg').close();
$('addImage').onclick = () => { $('addDlg').close(); openDlg(); };
$('cancel').onclick = () => $('dlg').close();
$('drop').onclick = () => { if(!draft || !draft.orig) $('file').click(); };
$('drop').onkeydown = e => { if(e.key === 'Enter' && (!draft || !draft.orig)) $('file').click(); };
$('pick').onclick = () => $('file').click();
$('file').onchange = e => { takeFile(e.target.files[0]); e.target.value = ''; };
$('url').onkeydown = e => { if(e.key === 'Enter'){ e.preventDefault(); $('load').click(); } };
['dragover','dragenter'].forEach(t => $('drop').addEventListener(t, e => { e.preventDefault(); $('drop').classList.add('over'); }));
['dragleave','drop'].forEach(t => $('drop').addEventListener(t, e => { e.preventDefault(); $('drop').classList.remove('over'); }));
$('drop').addEventListener('drop', e => takeFile(e.dataTransfer.files[0]));
document.addEventListener('paste', e => { const f = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/')); if(f){ e.preventDefault(); takeFile(f.getAsFile()); } });
$('cat').onchange = () => { syncMirror(); if(draft && draft.orig) process(); };
$('mirror').onchange = () => { draft.mirror = $('mirror').checked; draft.mirrorTouched = true; process(); };
$('rm').onchange = () => { draft.rm = $('rm').checked; draft.ai = false; syncOpts(); process(); };
$('tol').oninput = () => { draft.tol = +$('tol').value; draft.ai = false; processSoon(); };
$('ai').onclick = () => { if(!draft.orig) return; draft.ai = true; process(); };
$('rcrop').onclick = () => { if(!draft) return; draft.crop = null; const b = $('selbox'); if(b) b.style.display = 'none'; process(); };

/* ---------- Link-Import (Bild, Name, Preis) ---------- */
function consent(){
  try{ if(localStorage.getItem('anprobe_proxy') === '1') return true; }catch(e){}
  if(!confirm('Hier läuft kein eigener Server. Für Produktlinks wird deshalb ein öffentlicher Abruf-Dienst genutzt (allorigins.win für Seiten, wsrv.nl für Bilder). Die Link-Adresse wird dabei an diese Dienste gesendet. Fortfahren?')) return false;
  try{ localStorage.setItem('anprobe_proxy', '1'); }catch(e){} return true;
}
const PROXIES = ['https://api.allorigins.win/raw?url=', 'https://api.codetabs.com/v1/proxy?quest='];
/** Lädt Text oder Bild mit Zeitlimit und Größenbegrenzung, ohne Cookies und ohne Referrer. Wirft bei Fehlern. */
async function fetchBody(url, kind, max, ms = 15000){
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try{
    const r = await fetch(url, {signal:ac.signal, credentials:'omit', referrerPolicy:'no-referrer'});
    if(!r.ok) throw new Error('HTTP ' + r.status);
    if((+r.headers.get('content-length') || 0) > max) throw new Error('zu groß');
    const body = kind === 'text' ? await r.text() : await r.blob();
    if((kind === 'text' ? body.length : body.size) > max) throw new Error('zu groß');
    return body;
  } finally { clearTimeout(t); }
}
async function getText(u){
  let blocked = false; // Seite kam an, ist aber keine Produktseite (Bot-Schutz, Cookie-Wand, Captcha)
  if(LOCAL){ try{ const t = await fetchBody('/api/raw?url=' + enc(u), 'text', Scraper.LIMITS.html); if(Scraper.looksLikeProductHtml(t)) return t; blocked = true; }catch(e){} }
  if(!consent()) throw new Error('Abgebrochen.');
  for(const p of PROXIES){ try{ const t = await fetchBody(p + enc(u), 'text', Scraper.LIMITS.html); if(t.length > 200){ if(Scraper.looksLikeProductHtml(t)) return t; blocked = true; } }catch(e){} }
  throw new Error(blocked ? 'Der Shop liefert keine lesbaren Produktdaten (Bot-Schutz?). Nutze einen Screenshot oder trage Name und Preis selbst ein.' : 'Die Seite konnte nicht abgerufen werden.');
}
async function getImg(u){ // liefert eine Bildquelle, die sich in ein Canvas zeichnen lässt
  const safe = Scraper.sanitizeImageUrl(u, location.href, {allowLocal:LOCAL});
  if(!safe) throw new Error('Diese Bild-Adresse ist nicht erlaubt.');
  if(LOCAL){ try{ const b = await fetchBody('/api/raw?url=' + enc(safe), 'blob', 15e6); if(b.type.startsWith('image/') && b.type !== 'image/svg+xml') return await readFile(b); }catch(e){} }
  try{ await loadImg(safe, true); return safe; }catch(e){}
  if(!consent()) throw new Error('Abgebrochen.');
  const p = 'https://wsrv.nl/?url=' + enc(safe) + '&w=1000&output=png';
  try{ await loadImg(p, true); return p; }catch(e){ throw new Error('Das Bild konnte nicht geladen werden. Mach stattdessen einen Screenshot.'); }
}
/**
 * Holt Produktseite und Bild zu einem GEPRÜFTEN Link (siehe Scraper.validateUrl).
 * Gibt auch bei fehlendem Bild den gefundenen Namen und Preis zurück.
 * @param {string} url
 * @returns {Promise<{info:{title:string, image:string, price:?number, cur:string}, src:string, error:string}>}
 */
async function fetchProduct(url){
  if(/\.(png|jpe?g|webp|gif|avif)$/i.test(new URL(url).pathname)){
    try{ return {info:{title:'', image:url, price:null, cur:''}, src:await getImg(url), error:''}; }
    catch(e){ return {info:{title:'', image:url, price:null, cur:''}, src:'', error:e.message}; }
  }
  const info = Scraper.parseProductHtml(await getText(url), url, {allowLocal:LOCAL});
  if(!info.image) return {info, src:'', error:'Auf der Seite wurde kein Produktbild gefunden.'};
  try{ return {info, src:await getImg(info.image), error:''}; }catch(e){ return {info, src:'', error:e.message}; }
}
function fillFromInfo(info){
  if(info.title && !$('name').value) $('name').value = info.title;
  if(info.title) autoCat(info.title);
  if(info.price != null){ $('price').value = info.price.toFixed(2).replace('.', ','); if(info.cur) $('cur').value = info.cur; }
}
$('load').onclick = async () => {
  const v = Scraper.validateUrl($('url').value, {allowLocal:LOCAL});
  $('url').setAttribute('aria-invalid', String(!v.ok));
  if(!v.ok){ status(v.error, true); return; }
  status('Lade …'); $('load').disabled = true;
  try{
    const {info, src, error} = await fetchProduct(v.url);
    fillFromInfo(info);
    if(!src){ status((info.title || info.price != null ? 'Name und Preis geladen. ' : '') + error + ' Nutze einen Screenshot.', true); return; }
    await setSource(src);
    status(info.price != null ? 'Bild, Name und Preis geladen – bitte kurz prüfen.' : 'Bild geladen. Einen Preis habe ich nicht gefunden – trage ihn ggf. ein.');
  }catch(e){ status(e.message || 'Konnte nichts laden.', true); }
  finally{ $('load').disabled = false; }
};
$('ok').onclick = () => {
  if(!draft || !draft.img){ status('Bitte zuerst ein Bild hinzufügen.', true); return; }
  if(draft.busy){ status('Einen Moment, das Bild wird noch verarbeitet …', true); return; }
  const raw = $('url').value.trim(), v = raw ? Scraper.validateUrl(raw, {allowLocal:true}) : null;
  if(v && !v.ok){ status('Der Link ist ungültig: ' + v.error, true); $('url').setAttribute('aria-invalid', 'true'); return; }
  const f = {img:draft.img, orig:draft.orig, alpha:draft.alpha, cut:draft.cut, mirror:!!draft.mirror, name:Scraper.sanitizeText($('name').value) || 'Ohne Namen', cat:$('cat').value, link:v ? v.url : '', price:Scraper.sanitizePrice(parsePrice($('price').value)), cur:Scraper.normalizeCurrency($('cur').value, 'EUR')};
  if(editing) Object.assign(editing, f); else S.items.unshift({id:newId(), ...f, ...(dlgEan ? {ean:dlgEan} : {})});
  renderAll(); flush(); $('dlg').close();
};

/* ---------- Kleiderschrank ---------- */
function renderChips(){
  $('chips').replaceChildren(...['Alle',...CATS].map(c => { const b = document.createElement('button'); b.type = 'button'; b.textContent = c; b.setAttribute('aria-pressed', String(c === filter)); b.onclick = () => { filter = c; renderAll(); }; return b; }));
}
function renderGrid(){
  const list = S.items.filter(i => filter === 'Alle' || i.cat === filter);
  $('count').textContent = S.items.length + ' Teile';
  if(!list.length){ $('grid').innerHTML = '<div class="empty">' + (S.items.length ? 'Nichts in dieser Kategorie.' : 'Noch leer. Füge deinen ersten Screenshot oder Link hinzu.') + '</div>'; return; }
  $('grid').replaceChildren(...list.map(i => {
    const d = document.createElement('div'); d.className = 'card' + (board.some(p => p.id === i.id) ? ' used' : '');
    d.innerHTML = '<img alt=""><div class="n"><span></span><small></small></div><div class="x"></div>';
    const im = d.querySelector('img'); im.src = i.img; if(!i.cut) im.classList.add('mb');
    d.querySelector('span').textContent = i.name;
    d.querySelector('small').textContent = i.cat + (i.price != null ? ' · ' + money(i.price, i.cur) : '');
    if(/^https?:/.test(i.link || '')){ const a = document.createElement('a'); a.className = 'h'; a.href = i.link; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = (hostOf(i.link) || 'Angebot') + ' ↗'; a.title = i.link; a.onclick = e => e.stopPropagation(); a.onkeydown = e => e.stopPropagation(); d.querySelector('.n').append(a); }
    const x = d.querySelector('.x');
    if(i.link){ const a = document.createElement('button'); a.textContent = '↗'; a.title = 'Zum Angebot'; a.setAttribute('aria-label', 'Zum Angebot'); a.onclick = e => { e.stopPropagation(); open(i.link, '_blank', 'noopener'); }; x.append(a); }
    const ed = document.createElement('button'); ed.textContent = '✎'; ed.title = 'Bearbeiten'; ed.setAttribute('aria-label', 'Bearbeiten'); ed.onclick = e => { e.stopPropagation(); openDlg(i); }; x.append(ed);
    const del = document.createElement('button'); del.textContent = '✕'; del.title = 'Löschen'; del.setAttribute('aria-label', 'Löschen');
    del.onclick = e => { e.stopPropagation(); if(confirm('„' + i.name + '“ löschen?')){ S.items = S.items.filter(k => k.id !== i.id); board = board.filter(p => p.id !== i.id); if(sel === i.id) sel = null; S.outfits.forEach(o => o.pieces = o.pieces.filter(p => p.id !== i.id)); renderAll(); } };
    x.append(del);
    d.tabIndex = 0; d.setAttribute('role', 'button'); d.setAttribute('aria-pressed', board.some(p => p.id === i.id));
    d.onclick = () => toggle(i);
    d.onkeydown = e => { if(e.target === d && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); toggle(i); } };
    return d;
  }));
}

/* ---------- Outfit-Board ---------- */
function toggle(i){
  const ex = board.find(p => p.id === i.id);
  if(ex){ board = board.filter(p => p !== ex); if(sel === i.id) sel = null; }
  else { board = board.filter(p => item(p.id)?.cat !== i.cat || i.cat === 'Accessoire'); addPiece(i); }
  if(sel && !board.some(p => p.id === sel)) sel = null;
  announce(i.name + (ex ? ' vom Board entfernt' : ' aufs Board gelegt'));
  renderAll();
}
const RANK = {'Schuhe':0,'Hose/Rock':1,'Oberteil':2,'Jacke':3,'Accessoire':4}; // Standard-Reihenfolge von hinten nach vorn
const rank = id => RANK[item(id)?.cat] ?? 2;
function addPiece(i){ const d = DEF[i.cat]; let k = board.length; while(k > 0 && rank(board[k-1].id) > RANK[i.cat]) k--; board.splice(k, 0, {id:i.id, x:d[0], y:d[1], w:d[2], r:0}); }
/** Bereinigt Teile aus unsicherer Quelle (Speicher, Backup) und entfernt Teile ohne Kleiderschrank-Eintrag. */
const cleanPieces = list => Geo.sanitizePieces(list).filter(p => imgOf(p.id));
function fixOrder(a){ if(a.some(p => 'z' in p)){ a.sort((p, q) => rank(p.id) - rank(q.id)); a.forEach(p => delete p.z); } return a; } // ältere Daten: Reihenfolge neu setzen
function moveLayer(id, to){ const k = board.findIndex(p => p.id === id); if(k < 0) return; const [p] = board.splice(k, 1); board.splice(Math.max(0, Math.min(board.length, to)), 0, p); renderBoard(); announce((item(id)?.name || 'Teil') + ' liegt jetzt auf Ebene ' + (board.findIndex(q => q.id === id) + 1) + ' von ' + board.length); }
/* ==========================================================================
   Modul C – Drehen und Positionieren (Schritt 2), gilt für ALLE Teile
   - Drehung um die Bildmitte (CSS rotate), Position = Mittelpunkt des Teils
   - Bedienung: Griff am Teil (Maus, Touch, Tastatur), Regler im Arbeitsplatz,
     Tasten [ und ] drehen, Pfeiltasten schieben (Shift = größere Schritte)
   - Die Mathematik liegt in js/geometry.js (rein und getestet)
   ========================================================================== */
const KNOB_GAP = 30;          // Abstand des Drehgriffs zur Kante des Teils (px)
const aspects = new Map();    // id -> Höhe/Breite des Bildes (wird beim Laden gemerkt)
const pieceEls = new Map();   // id -> <img> auf dem Board
const aspectOf = id => aspects.get(id) ?? 1.3;
const heightOf = p => p.w * aspectOf(p.id);
const selPiece = () => board.find(k => k.id === sel);
const centerOf = p => ({x:p.x + p.w / 2, y:p.y + heightOf(p) / 2});

/** Schreibt Position, Größe und Drehung ins DOM (nur über CSSOM, daher CSP-konform). */
function stylePiece(p, im){ Object.assign(im.style, {left:p.x + 'px', top:p.y + 'px', width:p.w + 'px', transform:`rotate(${p.r || 0}deg)`}); }

/** Wählt ein Teil aus (Klick, Tastatur) und zeigt Griff und Arbeitsplatz an. */
function select(id){
  if(sel === id) return; sel = id;
  pieceEls.forEach((el, k) => el.classList.toggle('sel', k === id));
  ['bigger','smaller','front','back'].forEach(b => $(b).disabled = false);
  drawKnob(); syncBench(); renderSum();
}
/** Setzt die Drehung live (ohne das Board neu aufzubauen) und speichert. */
function setRotation(p, deg){ p.r = Geo.normalizeAngle(deg); applyLive(p); }
/** Verschiebt den MITTELPUNKT; null lässt die Achse unverändert. */
function moveCenter(p, cx, cy){
  const h = heightOf(p), c0 = centerOf(p), bb = Geo.rotatedBounds(p.w, h, p.r || 0);
  const c = Geo.clampCenter(cx ?? c0.x, cy ?? c0.y, bb.w, bb.h);
  p.x = c.x - p.w / 2; p.y = c.y - h / 2; applyLive(p);
}
function applyLive(p, lockFlip){ const el = pieceEls.get(p.id); if(el) stylePiece(p, el); placeKnob(p, lockFlip); syncBench(); persist(); }

/** Positioniert den Drehgriff: oberhalb des Teils, bei Platzmangel unterhalb. */
function placeKnob(p, lockFlip){
  const ctl = $('board').querySelector('.rot-ctl'); if(!ctl) return;
  const h = heightOf(p), up = h / 2 + KNOB_GAP, cos = Math.cos((p.r || 0) * Math.PI / 180), c = centerOf(p);
  const flip = lockFlip ?? ((c.y - up * cos < 16) && (c.y + up * cos < 584));
  ctl.dataset.flip = flip ? '1' : '0';
  Object.assign(ctl.style, {left:c.x + 'px', top:c.y + 'px', zIndex:String(board.length + 2), transform:`rotate(${p.r || 0}deg)`});
  const knob = ctl.querySelector('.rot-knob'), stem = ctl.querySelector('.rot-stem');
  knob.style.top = ((flip ? up : -up) - 11) + 'px';
  stem.style.top = (flip ? h / 2 : -up + 11) + 'px'; stem.style.height = (KNOB_GAP - 11) + 'px';
  knob.setAttribute('aria-valuenow', String(Math.round(p.r || 0))); knob.setAttribute('aria-valuetext', Geo.angleAria(p.r || 0));
}
/** Erzeugt den Drehgriff für das ausgewählte Teil (Maus, Touch und Tastatur). */
function drawKnob(){
  $('board').querySelector('.rot-ctl')?.remove();
  const p = selPiece(); if(!p) return;
  const ctl = document.createElement('div'); ctl.className = 'rot-ctl';
  const stem = document.createElement('div'); stem.className = 'rot-stem';
  const knob = document.createElement('div'); knob.className = 'rot-knob'; knob.tabIndex = 0; knob.setAttribute('role', 'slider');
  knob.setAttribute('aria-label', 'Drehung des ausgewählten Teils'); knob.setAttribute('aria-valuemin', '0'); knob.setAttribute('aria-valuemax', '360');
  knob.title = 'Ziehen zum Drehen · Shift = in 15°-Schritten · Pfeiltasten = 1°';
  ctl.append(stem, knob); $('board').append(ctl); placeKnob(p);
  knob.onpointerdown = e => {
    e.preventDefault(); e.stopPropagation(); knob.setPointerCapture(e.pointerId);
    const rect = $('board').getBoundingClientRect(), flip = ctl.dataset.flip === '1';  // Seite beim Start festhalten, damit nichts springt
    knob.onpointermove = m => {
      const c = centerOf(p), a = Geo.angleFromCenter(c.x, c.y, (m.clientX - rect.left) / K, (m.clientY - rect.top) / K); if(a === null) return;
      const deg = a + (flip ? 180 : 0); p.r = Geo.normalizeAngle(m.shiftKey ? Geo.snapAngle(deg, 15) : deg); applyLive(p, flip);
    };
    knob.onpointerup = knob.onpointercancel = () => { knob.onpointermove = knob.onpointerup = knob.onpointercancel = null; };
  };
  knob.onkeydown = e => {
    const st = e.shiftKey ? 15 : 1, d = {ArrowRight:st, ArrowUp:st, ArrowLeft:-st, ArrowDown:-st}[e.key];
    if(d !== undefined){ e.preventDefault(); e.stopPropagation(); setRotation(p, (p.r || 0) + d); }
    else if(e.key === 'Home'){ e.preventDefault(); e.stopPropagation(); setRotation(p, 0); }
  };
}

/** Hält den Arbeitsplatz (Regler und Anzeigen) mit dem ausgewählten Teil synchron. */
function syncBench(){
  const p = selPiece(), on = !!p; $('benchControls').disabled = !on;
  $('benchHint').textContent = on ? 'Ausgewählt: ' + (item(p.id)?.name || 'Teil') + '. Ziehe den runden Griff am Teil oder nutze die Regler.' : 'Wähle ein Teil auf dem Board, um es stufenlos zu drehen und zu positionieren.';
  if(!on) return;
  const r = p.r || 0, c = centerOf(p), cx = Math.round(c.x), cy = Math.round(c.y);
  $('rotRange').value = String(r); $('rotRange').setAttribute('aria-valuetext', Geo.angleAria(r)); $('rotOut').textContent = Geo.formatAngle(r);
  $('posX').value = String(cx); $('posY').value = String(cy); $('posXOut').textContent = String(cx); $('posYOut').textContent = String(cy);
}
$('rotRange').oninput = () => { const p = selPiece(); if(p) setRotation(p, parseFloat($('rotRange').value)); };
$('posX').oninput = () => { const p = selPiece(); if(p) moveCenter(p, +$('posX').value, null); };
$('posY').oninput = () => { const p = selPiece(); if(p) moveCenter(p, null, +$('posY').value); };
$('rotMinus').onclick = () => { const p = selPiece(); if(p) setRotation(p, (p.r || 0) - 15); };
$('rotPlus').onclick = () => { const p = selPiece(); if(p) setRotation(p, (p.r || 0) + 15); };
$('rotReset').onclick = () => { const p = selPiece(); if(p) setRotation(p, 0); };

function renderBoard(){
  [...$('board').querySelectorAll('.p')].forEach(n => n.remove()); pieceEls.clear();
  $('hint').style.display = board.length ? 'none' : 'grid';
  ['bigger','smaller','front','back'].forEach(id => $(id).disabled = !sel);
  board.forEach((p, idx) => {
    const im = new Image(); im.src = imgOf(p.id); im.className = 'p' + (p.id === sel ? ' sel' : '') + mb(item(p.id)); im.draggable = false; im.alt = '';
    stylePiece(p, im); im.style.zIndex = String(idx + 1); pieceEls.set(p.id, im);
    im.onload = () => { aspects.set(p.id, im.naturalHeight / im.naturalWidth); if(p.id === sel){ placeKnob(p); syncBench(); } };
    im.onpointerdown = e => {
      e.preventDefault(); e.stopPropagation(); im.setPointerCapture(e.pointerId); select(p.id);
      const sx = e.clientX / K - p.x, sy = e.clientY / K - p.y;
      im.onpointermove = m => { moveCenter(p, m.clientX / K - sx + p.w / 2, m.clientY / K - sy + heightOf(p) / 2); };
      im.onpointerup = () => { im.onpointermove = im.onpointerup = null; renderGrid(); persist(); };
    };
    im.ondblclick = () => { board = board.filter(k => k !== p); if(sel === p.id) sel = null; renderAll(); };
    im.onwheel = e => { e.preventDefault(); resize(p, e.deltaY < 0 ? 1.06 : .94); };
    $('board').append(im);
  });
  drawKnob(); syncBench(); renderSum(); persist();
}
$('board').addEventListener('pointerdown', e => { if(e.target === $('board') && sel){ sel = null; renderBoard(); } });
/** Skaliert um den Mittelpunkt, damit Drehung und Position stabil bleiben. */
function resize(p, f){ const c = centerOf(p); p.w = Geo.clamp(p.w * f, Geo.LIMITS.minW, Geo.LIMITS.maxW); const h = heightOf(p); p.x = c.x - p.w / 2; p.y = c.y - h / 2; renderBoard(); }
$('bigger').onclick = () => { const p = board.find(k => k.id === sel); if(p) resize(p, 1.1); };
$('smaller').onclick = () => { const p = board.find(k => k.id === sel); if(p) resize(p, .9); };
$('front').onclick = () => { if(sel) moveLayer(sel, board.length); };
$('back').onclick = () => { if(sel) moveLayer(sel, 0); };
$('clear').onclick = () => { board = []; sel = null; renderAll(); };
document.addEventListener('keydown', e => {
  if($('dlg').open || $('scanDlg').open || $('addDlg').open || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if(e.key === 'Delete' && sel){ board = board.filter(p => p.id !== sel); sel = null; renderAll(); }
  if(e.key === 'Escape' && sel){ sel = null; renderBoard(); }
  const p = selPiece(); if(!p || document.activeElement !== document.body) return;
  const st = e.shiftKey ? 15 : 5, mv = e.shiftKey ? 10 : 1;
  if(e.key === '[' ){ e.preventDefault(); setRotation(p, (p.r || 0) - st); }
  else if(e.key === ']'){ e.preventDefault(); setRotation(p, (p.r || 0) + st); }
  else if(e.key.startsWith('Arrow')){ e.preventDefault(); const c = centerOf(p); moveCenter(p, c.x + ({ArrowLeft:-mv, ArrowRight:mv}[e.key] || 0), c.y + ({ArrowUp:-mv, ArrowDown:mv}[e.key] || 0)); }
});
$('shuffle').onclick = () => {
  const pick = c => { const l = S.items.filter(i => i.cat === c); return l[Math.floor(Math.random()*l.length)]; };
  board = []; sel = null;
  ['Oberteil','Hose/Rock','Schuhe'].concat(Math.random() < .5 ? ['Jacke'] : [], Math.random() < .35 ? ['Accessoire'] : []).forEach(c => { const i = pick(c); if(i) addPiece(i); });
  if(!board.length) alert('Füge zuerst Teile zum Kleiderschrank hinzu.');
  renderAll();
};
$('png').onclick = async () => {
  if(!board.length) return;
  const c = document.createElement('canvas'); c.width = 800; c.height = 1200; const x = c.getContext('2d');
  x.fillStyle = '#f3f4f7'; x.fillRect(0, 0, 800, 1200);
  for(const p of board){
    const im = await loadImg(imgOf(p.id)), w = p.w * 2, h = w * im.height / im.width;
    x.save(); x.globalCompositeOperation = item(p.id)?.cut ? 'source-over' : 'multiply';
    x.translate(p.x * 2 + w / 2, p.y * 2 + h / 2); x.rotate((p.r || 0) * Math.PI / 180); // Drehung um die Mitte
    x.drawImage(im, -w / 2, -h / 2, w, h); x.restore();
  }
  const a = document.createElement('a'); a.download = 'outfit.png'; a.href = c.toDataURL('image/png'); a.click();
};
function totals(pieces){
  const by = {}; let miss = 0;
  pieces.forEach(p => { const it = item(p.id); if(!it) return; if(it.price == null) miss++; else { const c = it.cur || 'EUR'; by[c] = (by[c] || 0) + it.price; } });
  return {txt:Object.entries(by).map(([c, v]) => money(v, c)).join(' + '), miss};
}
const hostOf = u => { try{ return new URL(u).hostname.replace(/^www\./, ''); }catch(e){ return ''; } };
function renderSum(){
  const box = $('sum'); box.replaceChildren(); if(!board.length) return;
  const h = document.createElement('div'); h.className = 'm m--head'; h.textContent = 'Ebenen (oben liegt vorn) · Preis · Angebot'; box.append(h);
  for(let k = board.length - 1; k >= 0; k--){
    const p = board[k], it = item(p.id); if(!it) continue;
    const r = document.createElement('div'); r.className = 'r' + (p.id === sel ? ' on' : '');
    const lay = document.createElement('span'); lay.className = 'lay';
    [['▲', 'Eine Ebene nach vorn', k + 1, k < board.length - 1], ['▼', 'Eine Ebene nach hinten', k - 1, k > 0]].forEach(([t, ti, to, en]) => { const bt = document.createElement('button'); bt.textContent = t; bt.title = ti; bt.setAttribute('aria-label', ti + ': ' + it.name); bt.disabled = !en; bt.onclick = () => moveLayer(p.id, to); lay.append(bt); });
    const n = document.createElement('button'); n.type = 'button'; n.className = 'nm'; n.textContent = it.name; n.title = it.name + ' auswählen'; n.setAttribute('aria-pressed', String(p.id === sel)); n.onclick = () => { sel = p.id; renderBoard(); };
    const pr = document.createElement('span'); pr.textContent = it.price != null ? money(it.price, it.cur) : '–';
    r.append(lay, n, pr);
    if(/^https?:/.test(it.link || '')){ const a = document.createElement('a'); a.href = it.link; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = (hostOf(it.link) || 'Angebot') + ' ↗'; a.title = 'Zum Angebot: ' + it.link; r.append(a); }
    box.append(r);
  }
  const t = totals(board), d = document.createElement('div'); d.className = 't';
  d.innerHTML = '<span>Gesamt</span><span></span>'; d.lastChild.textContent = t.txt || '–'; box.append(d);
  if(t.miss){ const m = document.createElement('div'); m.className = 'm'; m.textContent = 'Bei ' + t.miss + (t.miss === 1 ? ' Teil fehlt' : ' Teilen fehlt') + ' der Preis.'; box.append(m); }
}
$('save').onclick = () => {
  if(!board.length) return;
  const name = prompt('Name des Outfits:', 'Outfit ' + (S.outfits.length + 1)); if(name === null) return;
  S.outfits.unshift({id:'o'+Date.now(), name:name.trim() || 'Outfit', pieces:JSON.parse(JSON.stringify(board))});
  renderOuts(); flush(); // bewusste Aktion: sofort sichern, nicht erst nach dem Timer
};
$('exp').onclick = () => { S.board = board; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S)], {type:'application/json'})); a.download = 'anprobe-backup-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); };
$('imp').onclick = () => $('impf').click();
$('impf').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if(!f) return;
  try{ const j = JSON.parse(await f.text()); if(!Array.isArray(j.items)) throw 0; if(!confirm('Aktuelle Daten durch das Backup ersetzen?')) return;
    S = {items:j.items.map(i => Scraper.sanitizeItem(i, CATS)).filter(Boolean), outfits:(Array.isArray(j.outfits) ? j.outfits : []).filter(o => o && typeof o.name === 'string')}; board = fixOrder(cleanPieces(j.board)); S.outfits.forEach(o => { o.pieces = fixOrder(Geo.sanitizePieces(o.pieces)); }); sel = null; renderAll();
  }catch(err){ alert('Diese Datei ist kein gültiges Anprobe-Backup.'); }
};
function fit(){ K = Math.min(1, ($('stage').clientWidth - 36) / 400); $('wrap').style.cssText = `width:${400 * K}px;height:${600 * K}px`; $('board').style.transform = `scale(${K})`; }
addEventListener('resize', fit);

/* ---------- Gespeicherte Outfits ---------- */
function renderOuts(){
  if(!S.outfits.length){ $('outs').innerHTML = '<div class="empty empty--tight">Noch keine Outfits gespeichert.</div>'; return; }
  $('outs').replaceChildren(...S.outfits.map(o => {
    const d = document.createElement('div'); d.className = 'out';
    d.innerHTML = '<div class="mini"><div></div></div><div><b></b><small></small><div class="b"><button>Laden</button><button>Löschen</button></div></div>';
    d.querySelector('b').textContent = o.name; d.querySelector('small').textContent = totals(o.pieces).txt;
    o.pieces.forEach((p, idx) => { const s = imgOf(p.id); if(!s) return; const im = new Image(); im.src = s; im.className = mb(item(p.id)).trim(); Object.assign(im.style, {left:p.x+'px', top:p.y+'px', width:p.w+'px', zIndex:idx + 1, transform:`rotate(${p.r || 0}deg)`}); d.querySelector('.mini>div').append(im); });
    const [ld, rm] = d.querySelectorAll('button');
    ld.onclick = () => { board = fixOrder(cleanPieces(JSON.parse(JSON.stringify(o.pieces)))); sel = null; renderAll(); };
    rm.onclick = () => { if(confirm('Outfit „' + o.name + '“ löschen?')){ S.outfits = S.outfits.filter(k => k !== o); renderOuts(); flush(); } };
    return d;
  }));
}

function renderAll(){ fit(); renderChips(); renderGrid(); renderBoard(); renderOuts(); }
/* ==========================================================================
   Meldungen (Toast) mit Aktionen, z. B. „Rückgängig“
   ========================================================================== */
let toastT;
function hideToast(){ clearTimeout(toastT); $('toast').hidden = true; }
/** @param {string} msg @param {{label:string, fn:()=>void}[]} [actions] @param {number} [ms] 0 = bleibt stehen */
function showToast(msg, actions = [], ms = 10000){
  clearTimeout(toastT); $('toastMsg').textContent = msg;
  $('toastActions').replaceChildren(...actions.map(a => { const b = document.createElement('button'); b.type = 'button'; b.className = 'small'; b.textContent = a.label; b.onclick = () => { hideToast(); a.fn(); }; return b; }));
  $('toast').hidden = false; if(ms) toastT = setTimeout(hideToast, ms);
}
$('toastClose').onclick = hideToast;
function removeItem(id){
  S.items = S.items.filter(k => k.id !== id); board = board.filter(p => p.id !== id); if(sel === id) sel = null;
  S.outfits.forEach(o => { o.pieces = o.pieces.filter(p => p.id !== id); }); renderAll(); flush();
}
/**
 * Legt ein Teil direkt im Kleiderschrank an (Bild wird freigestellt, Schuhe ggf. ergänzt).
 * @param {{src:string, name:string, cat:string, link?:string, price?:?number, cur?:string, ean?:string}} o
 */
async function addItemFromImage(o){
  const n = await norm(o.src), d = {...blank(), orig:n.url, alpha:n.alpha};
  const r = await makeImage(d, o.cat);
  const it = {id:newId(), img:r.img, orig:n.url, alpha:n.alpha, cut:r.cut, mirror:r.mirror, name:Scraper.sanitizeText(o.name) || 'Ohne Namen', cat:o.cat, link:o.link || '', price:Scraper.sanitizePrice(o.price), cur:Scraper.normalizeCurrency(o.cur, 'EUR'), ...(o.ean ? {ean:o.ean} : {})};
  S.items.unshift(it); renderAll(); flush(); return it;
}
/** Standard-Meldung nach dem automatischen Hinzufügen. */
function toastAdded(it){
  showToast('„' + it.name + '“ wurde als ' + it.cat + ' hinzugefügt' + (it.price != null ? ' (' + money(it.price, it.cur) + ')' : '') + '.', [{label:'Bearbeiten', fn:() => openDlg(it)}, {label:'Rückgängig', fn:() => removeItem(it.id)}]);
}

/* ==========================================================================
   Modul A – Produkt per Link (Schritt 3)
   Eingabe prüfen (js/scraper.js) → Seite laden → Name, Bild, Preis auslesen und bereinigen →
   bei eindeutigem Ergebnis direkt hinzufügen (mit „Rückgängig“), sonst im Dialog prüfen lassen.
   ========================================================================== */
/** @param {string} t Meldung  @param {boolean} [err] Fehlerdarstellung */
function setLinkStatus(t, err){ const s = $('linkStatus'); s.textContent = t; s.className = 'status' + (err ? ' err' : ''); $('linkInput').setAttribute('aria-invalid', err ? 'true' : 'false'); }
$('linkInput').addEventListener('input', () => setLinkStatus(''));
let importing = false;
async function importFromLink(raw){
  if(importing) return;
  const v = Scraper.validateUrl(raw, {allowLocal:LOCAL});
  if(!v.ok){ setLinkStatus(v.error, true); return; }
  const dup = S.items.find(i => i.link === v.url);
  if(dup){ setLinkStatus('Dieses Produkt ist schon im Kleiderschrank: „' + dup.name + '“.', true); return; }
  importing = true; $('linkGo').disabled = true; setLinkStatus('Lade Produktseite …');
  try{
    const {info, src, error} = await fetchProduct(v.url), cat = guessCat(info.title);
    $('linkInput').value = ''; setLinkStatus(''); $('addDlg').close();
    if(src && info.title && cat){ toastAdded(await addItemFromImage({src, name:info.title, cat, link:v.url, price:info.price, cur:info.cur})); return; }
    // Nicht eindeutig (keine Kategorie, kein Bild …): alles Gefundene im Dialog zur Prüfung zeigen
    openDlg(); $('url').value = v.url; fillFromInfo(info); if(src) await setSource(src);
    status(src ? 'Bitte Kategorie und Angaben prüfen und speichern.' : error + ' Füge einen Screenshot hinzu.', !src);
  }catch(e){ setLinkStatus(e.message || 'Der Link konnte nicht importiert werden.', true); }
  finally{ importing = false; $('linkGo').disabled = false; }
}
$('linkForm').addEventListener('submit', e => { e.preventDefault(); importFromLink($('linkInput').value); });

/* ==========================================================================
   Modul B – Barcode-Scanner (Schritt 3)
   Kamera + Erkennung: js/scanner.js. Prüfziffer: js/barcode.js.
   Produktsuche: offene Datenbanken (Open Products/Beauty/Food Facts). Für Kleidung ist die Trefferquote
   niedrig – ohne Treffer öffnet sich der Dialog mit dem Barcode, und du ergänzt Bild und Namen.
   ========================================================================== */
const OFF_HOSTS = ['world.openproductsfacts.org', 'world.openbeautyfacts.org', 'world.openfoodfacts.org'];
/** @returns {Promise<?{name:string, image:string}>} */
async function lookupBarcode(code){
  const key = Barcode.lookupKey(code);
  for(const h of OFF_HOSTS){
    try{
      const j = JSON.parse(await fetchBody('https://' + h + '/api/v2/product/' + key + '.json?fields=product_name,brands,image_front_url', 'text', 200000, 8000));
      const p = j && j.status === 1 && j.product; if(!p) continue;
      const brand = Scraper.sanitizeText(String(p.brands || '').split(',')[0], 40), pn = Scraper.sanitizeText(p.product_name, 100); if(!pn) continue;
      return {name:brand && !pn.toLowerCase().includes(brand.toLowerCase()) ? brand + ' ' + pn : pn, image:Scraper.sanitizeImageUrl(p.image_front_url, 'https://' + h + '/')};
    }catch(e){ /* nächste Datenbank */ }
  }
  return null;
}
/** Verarbeitet einen geprüften Barcode (Scan oder Eingabe). @param {any} g Ergebnis von Barcode.parseGtin */
async function handleBarcode(g){
  if(!g || !g.ok){ showToast(g ? g.error : 'Ungültiger Barcode.'); return; }
  const dup = S.items.find(i => i.ean === g.code);
  if(dup){ showToast('Der Barcode ' + g.code + ' ist schon im Kleiderschrank: „' + dup.name + '“.'); return; }
  showToast('Barcode ' + g.code + ' (' + g.kind + ') erkannt – suche Produkt …', [], 0);
  const p = await lookupBarcode(g.code), cat = p ? guessCat(p.name) : '';
  if(p && p.image && cat){
    try{ const it = await addItemFromImage({src:await getImg(p.image), name:p.name, cat, ean:g.code}); toastAdded(it); return; }catch(e){ /* weiter mit Dialog */ }
  }
  hideToast(); openDlg(); dlgEan = g.code;
  if(p){ $('name').value = p.name; if(cat){ $('cat').value = cat; syncMirror(); } if(p.image) getImg(p.image).then(setSource).catch(() => {}); }
  status(p ? 'Barcode ' + g.code + ': Produkt gefunden, bitte Bild, Kategorie und Preis prüfen.' : 'Barcode ' + g.code + ' erkannt, aber in den offenen Datenbanken nicht gefunden. Füge Bild und Namen hinzu.', !p);
}
let scanner = null;
function scanSay(t, err){ $('scanStatus').textContent = t; $('scanStatus').className = 'status' + (err ? ' err' : ''); }
function scanUi(on){ $('scanView').hidden = !on; $('scanStart').hidden = on; $('scanStop').hidden = !on; }
function getScanner(){
  return scanner ??= new Scanner.BarcodeScanner({video:$('scanVideo'), onCode:code => { $('scanDlg').close(); handleBarcode(Barcode.parseGtin(code)); }, onState:(t, kind) => scanSay(t, kind === 'error'), onStop:() => scanUi(false)});
}
async function startScan(){
  scanSay('Kamera wird gestartet …'); scanUi(true);
  try{ await getScanner().start(); }
  catch(e){ scanUi(false); scanSay(e.message, true); $('eanInput').focus(); } // Fallback: Nummer von Hand eingeben
}
$('scanBtn').onclick = () => { $('addDlg').close(); $('eanInput').value = ''; $('eanInput').setAttribute('aria-invalid', 'false'); $('scanDlg').showModal(); startScan(); };
$('scanStart').onclick = startScan;
$('scanStop').onclick = () => { scanner?.stop(); scanSay('Kamera gestoppt.'); };
$('scanClose').onclick = () => { $('scanDlg').close(); openAdd(); };
$('scanDlg').addEventListener('close', () => scanner?.stop());
document.addEventListener('visibilitychange', () => { if(document.hidden) scanner?.stop(); });
function submitEan(){
  const g = Barcode.parseGtin($('eanInput').value);
  $('eanInput').setAttribute('aria-invalid', String(!g.ok));
  if(!g.ok){ scanSay(g.error, true); return; }
  scanner?.stop(); $('scanDlg').close(); handleBarcode(g);
}
$('eanGo').onclick = submitEan;
$('eanInput').onkeydown = e => { if(e.key === 'Enter'){ e.preventDefault(); submitEan(); } };
$('eanInput').oninput = e => { const t = /** @type {HTMLInputElement} */ (e.target); t.value = t.value.replace(/[^\d\s-]/g, ''); };

load().then(ok => { ready = ok; if(!ok) $('saveState').textContent = 'Speicher nicht lesbar – Änderungen werden nicht gesichert. Seite neu laden.'; renderAll(); });
