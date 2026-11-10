// @ts-nocheck
import * as Scraper from './scraper.js';
import { $, CATS, DROP, money, newId, parsePrice, readFile, state } from './core.js';
import { baseHistory, LEGACY_T, recordPrice } from './prices.js';
import { detectColor, makeImage, norm } from './image.js';
import { COLOR_NAMES } from './color.js';
import { parseTags } from './search.js';
import { addMany } from './batch.js';
import { MAX_BATCH } from './intake.js';
import { fetchImage, fetchProduct, linkFetchEnabled } from './linkfetch.js';
import { renderAll } from './render.js';
import { flush } from './storage.js';
import { confirmBox } from './ui.js';
import { closeDialog, showDialog } from './sheet.js';

const blank = () => ({orig:null, alpha:false, crop:null, rm:true, tol:28, ai:false, img:null, cut:false, mirror:false, mirrorTouched:false, colorTouched:false});
function syncMirror(){ $('mirrorRow').hidden = $('cat').value !== 'Schuhe'; if(state.draft) $('mirror').checked = !!state.draft.mirror; }
let tok = 0;
/** Verarbeitet das Bild im Dialog und zeigt das Ergebnis an. */
async function process(){
  if(!state.draft || !state.draft.orig) return; const my = ++tok; state.draft.busy = true;
  try{
    const r = await makeImage(state.draft, $('cat').value, status);
    if(my !== tok) return;
    state.draft.img = r.img; state.draft.cut = r.cut;
    const el = new Image(); el.src = state.draft.img; el.alt = ''; $('res').replaceChildren(el); syncMirror(); autoColor(r.img, r.cut, my);
  }catch(e){ if(my === tok) status('Bild konnte nicht verarbeitet werden.', true); }
  finally{ if(my === tok) state.draft.busy = false; }
}
/** Erkennt die Farbe und trägt sie ein, solange du sie nicht selbst gewählt hast. */
async function autoColor(src, cut, my){
  const dr = state.draft;
  try{ const c = await detectColor(src, cut); if(dr === state.draft && !dr.colorTouched && (my === undefined || my === tok)) $('color').value = c || ''; }catch(e){}
}
let ptm; const processSoon = () => { clearTimeout(ptm); ptm = setTimeout(process, 120); };

CATS.forEach(c => $('cat').add(new Option(c, c)));
COLOR_NAMES.forEach(c => $('color').add(new Option(c, c)));
$('color').onchange = () => { if(state.draft) state.draft.colorTouched = true; };
export function status(t, err){ $('status').textContent = t; $('status').className = err ? 'err' : ''; }
function showOrig(){
  const d = $('drop');
  if(!state.draft || !state.draft.orig){ d.className = ''; d.textContent = DROP; return; }
  d.className = 'has'; d.innerHTML = '<div id="pv"><img alt=""><div id="selbox"></div></div>';
  const pv = $('pv'), im = pv.querySelector('img'), box = $('selbox'); im.src = state.draft.orig;
  pv.onpointerdown = e => {
    e.preventDefault(); pv.setPointerCapture(e.pointerId);
    const r = im.getBoundingClientRect(), cl = (v, m) => Math.max(0, Math.min(m, v)), sx = cl(e.clientX - r.left, r.width), sy = cl(e.clientY - r.top, r.height); let cur = {x:sx, y:sy, w:0, h:0};
    pv.onpointermove = m => { const ex = cl(m.clientX - r.left, r.width), ey = cl(m.clientY - r.top, r.height); cur = {x:Math.min(sx, ex), y:Math.min(sy, ey), w:Math.abs(ex - sx), h:Math.abs(ey - sy)}; Object.assign(box.style, {display:'block', left:cur.x+'px', top:cur.y+'px', width:cur.w+'px', height:cur.h+'px'}); };
    pv.onpointerup = () => {
      pv.onpointermove = pv.onpointerup = null;
      if(cur.w < 12 || cur.h < 12){ state.draft.crop = null; box.style.display = 'none'; }
      else { const kx = im.naturalWidth / r.width, ky = im.naturalHeight / r.height; state.draft.crop = {x:Math.round(cur.x*kx), y:Math.round(cur.y*ky), w:Math.round(cur.w*kx), h:Math.round(cur.h*ky)}; }
      process();
    };
  };
}
function syncOpts(){ syncMirror(); $('rm').checked = state.draft.rm; $('tol').value = state.draft.tol; $('tol').disabled = !state.draft.rm || state.draft.alpha; $('ai').disabled = !state.draft.rm || state.draft.alpha; }
function showHistory(it){
  const h = it && it.priceHistory || [], box = $('priceHistory');
  box.hidden = h.length < 2;
  $('priceList').replaceChildren(...[...h].reverse().map(pt => {
    const li = document.createElement('li');
    const when = pt.t <= LEGACY_T ? 'früher' : new Date(pt.t).toLocaleDateString('de-DE');
    li.textContent = when + ' · ' + money(pt.v, it.cur);
    return li;
  }));
}
export function openDlg(it){
  state.editing = it || null;
  state.draft = it ? {...blank(), orig:it.orig || it.img, alpha:!!it.alpha, rm:it.orig ? !!it.cut : true, img:it.img, cut:!!it.cut, mirror:!!it.mirror, mirrorTouched:true} : blank();
  $('dlgTitle').textContent = it ? 'Teil bearbeiten' : 'Neues Teil';
  $('url').value = it ? it.link || '' : ''; $('url').removeAttribute('aria-invalid'); $('name').value = it ? it.name : ''; $('cat').value = it ? it.cat : CATS[0];
  $('price').value = it && it.price != null ? it.price.toFixed(2).replace('.', ',') : ''; $('cur').value = it && it.cur || 'EUR';
  $('itemState').value = it ? (it.status === 'wish' ? 'wish' : 'own') : (state.statusFilter === 'wish' ? 'wish' : 'own');
  showHistory(it);
  $('tags').value = it && Array.isArray(it.tags) ? it.tags.join(', ') : '';
  $('color').value = it && it.color || '';
  if(it){ state.draft.colorTouched = !!it.color; if(!it.color) autoColor(it.img, !!it.cut); }
  $('multiTip').hidden = !!it;
  clearPicker(); $('shopLinkGo').disabled = false; shopTok++; $('shopLinkGo').hidden = !!it || !linkFetchEnabled(); $('linkHint').hidden = !!it || !linkFetchEnabled();
  status(''); showOrig(); syncOpts();
  if(it){ const r = new Image(); r.src = it.img; r.alt = ''; $('res').replaceChildren(r); if(!it.orig) process(); }
  else $('res').replaceChildren(Object.assign(document.createElement('span'), {textContent:'Noch kein Bild'}));
  showDialog($('dlg'));
}
async function adopt(n){
  if(!state.draft) state.draft = blank();
  state.draft.orig = n.url; state.draft.alpha = n.alpha; state.draft.crop = null; state.draft.ai = false; showOrig(); syncOpts(); await process();
}
const setSource = async src => adopt(await norm(src));

async function takeFile(f){ if(f && f.type.startsWith('image/')){ if(!$('dlg').open) openDlg(); if(f.size > Scraper.IMAGE_LIMITS.bytes){ status('Das Bild ist zu groß (höchstens ' + Math.round(Scraper.IMAGE_LIMITS.bytes / 1e6) + ' MB). Bitte ein kleineres Bild oder einen Screenshot verwenden.', true); return; } try{ await setSource(await readFile(f)); }catch(e){ status('Bild konnte nicht gelesen werden.', true); } } }
let pickTok = 0, pickUrls = [];
function clearPicker(){
  pickTok++; for(const u of pickUrls) URL.revokeObjectURL(u);
  pickUrls = []; $('pickRow').replaceChildren(); $('imgPick').hidden = true;
}
/** Zeigt alle Produktbilder zur Auswahl; geladen wird nach und nach über den Hilfsdienst (höchstens zwei gleichzeitig). */
async function showPicker(urls, files, current){
  if(urls.length < 2) return;
  const my = pickTok, row = $('pickRow');
  $('imgPick').hidden = false;
  const slots = urls.map(() => { const w = document.createElement('div'); w.className = 'wait'; row.append(w); return w; });
  const mark = b => { for(const x of row.querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b)); };
  let next = 0;
  const worker = async () => {
    while(next < urls.length){
      const i = next++, u = urls[i];
      const f = files.get(u) || await fetchImage(u);
      if(my !== pickTok) return;
      if(!f){ slots[i].remove(); continue; }
      const b = document.createElement('button'), img = document.createElement('img'), src = URL.createObjectURL(f);
      pickUrls.push(src); img.src = src; img.alt = ''; img.decoding = 'async';
      b.type = 'button'; b.setAttribute('aria-label', 'Bild ' + (i + 1) + ' von ' + urls.length + ' verwenden'); b.setAttribute('aria-pressed', String(u === current));
      b.append(img);
      b.onclick = async () => { mark(b); status('Bild wird übernommen …'); await takeFile(f); if(my === pickTok) status('Bild gewechselt. Bitte kurz prüfen und speichern.'); };
      slots[i].replaceWith(b);
    }
  };
  await Promise.all([worker(), worker()]);
  if(my === pickTok && !row.querySelector('button')) $('imgPick').hidden = true;
}
/** Füllt das Formular mit geprüften Shop-Daten und holt das Bild über den Hilfsdienst. */
async function applyShopData(d){
  if(!$('dlg').open) openDlg();
  if(!d.ok){ status(d.error, true); return false; }
  const got = [];
  if(d.name){ $('name').value = d.name; got.push('Name'); }
  if(d.price != null){ $('price').value = d.price.toFixed(2).replace('.', ','); $('cur').value = d.cur; got.push('Preis'); }
  if(d.link){ $('url').value = d.link; $('url').removeAttribute('aria-invalid'); got.push('Link'); }
  if(d.cat){ $('cat').value = d.cat; syncMirror(); got.push('Kategorie'); }
  if(d.color){ $('color').value = d.color; state.draft.colorTouched = true; got.push('Farbe'); }
  if(d.brand){ const tags = parseTags($('tags').value + ',' + d.brand, Scraper.sanitizeText); $('tags').value = tags.join(', '); }
  clearPicker();
  const files = new Map();
  if(d.imageUrl){
    const f = await fetchImage(d.imageUrl);
    if(f){ files.set(d.imageUrl, f); await takeFile(f); if(state.draft && state.draft.orig) got.push('Bild'); }
  }
  showPicker(d.images, files, got.includes('Bild') ? d.imageUrl : '');
  const noImg = !got.includes('Bild');
  if(!got.length) status('Auf dieser Seite wurden keine Produktdaten gefunden. Bitte die Felder selbst ausfüllen.', true);
  else status('Übernommen: ' + got.join(', ') + '.' + (noImg ? ' Das Bild bitte als Screenshot oder Datei hinzufügen.' : ' Bitte kurz prüfen und speichern.') + (d.outdated ? ' Hinweis: Der Hilfsdienst ist veraltet, deshalb fehlt die Bildauswahl. Bitte den Code in Cloudflare aktualisieren (worker/ANLEITUNG.md).' : ''), noImg);
  return true;
}
$('dlg').addEventListener('close', clearPicker);
let shopTok = 0;
async function loadShopLink(){
  const raw = $('url').value.trim();
  if(!raw){ status('Bitte einen Produktlink einfügen.', true); return; }
  const my = ++shopTok; $('shopLinkGo').disabled = true; status('Produktdaten werden geladen …');
  try{
    const d = await fetchProduct(Scraper.normalizeLinkInput(raw));
    if(my !== shopTok) return;
    await applyShopData(d);
  }catch(e){ if(my === shopTok) status(e instanceof Error ? e.message : 'Das hat nicht geklappt.', true); }
  finally{ if(my === shopTok) $('shopLinkGo').disabled = false; }
}
$('shopLinkGo').onclick = loadShopLink;
$('url').onkeydown = e => { if(e.key === 'Enter' && !state.editing && linkFetchEnabled()){ e.preventDefault(); loadShopLink(); } };
// Ein eingefügter Link lädt sofort; getippte Links laden erst auf „Laden“ oder Enter.
$('url').addEventListener('paste', () => { if(state.editing || !linkFetchEnabled()) return; setTimeout(() => { if(/^https?:\/\/\S+$/i.test($('url').value.trim())) loadShopLink(); }, 0); });
$('addBtn').onclick = () => openDlg();
$('fab').onclick = () => openDlg();
$('cancel').onclick = () => closeDialog($('dlg'));
$('drop').onclick = () => { if(!state.draft || !state.draft.orig) $('file').click(); };
$('drop').onkeydown = e => { if(e.key === 'Enter' && (!state.draft || !state.draft.orig)) $('file').click(); };
$('pick').onclick = () => $('file').click();
const intake = files => {
  if(files.length > 1 && !state.editing){ closeDialog($('dlg')); addMany(files); }   // mehrere Bilder: ohne Dialog, jedes freigestellt und hinzugefügt
  else takeFile(files[0]);
};
$('file').onchange = e => { const files = [...e.target.files]; e.target.value = ''; if(files.length) intake(files); };
['dragover','dragenter'].forEach(t => $('drop').addEventListener(t, e => { e.preventDefault(); $('drop').classList.add('over'); }));
['dragleave','drop'].forEach(t => $('drop').addEventListener(t, e => { e.preventDefault(); $('drop').classList.remove('over'); }));
$('drop').addEventListener('drop', e => { const files = [...e.dataTransfer.files]; if(files.length) intake(files); });
document.addEventListener('paste', e => { if(e.target === $('url')) return; const f = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/')); if(f){ e.preventDefault(); takeFile(f.getAsFile()); } });
$('cat').onchange = () => { syncMirror(); if(state.draft && state.draft.orig) process(); };
$('mirror').onchange = () => { state.draft.mirror = $('mirror').checked; state.draft.mirrorTouched = true; process(); };
$('rm').onchange = () => { state.draft.rm = $('rm').checked; state.draft.ai = false; syncOpts(); process(); };
$('tol').oninput = () => { state.draft.tol = +$('tol').value; state.draft.ai = false; processSoon(); };
let aiOk = false;   // Zustimmung gilt nur für diese Sitzung
$('ai').onclick = async () => {
  if(!state.draft.orig) return;
  if(!aiOk && !await confirmBox({title:'KI-Freistellen laden?', text:'Dafür lädt die App einmalig Programmcode und ein Modell (ca. 40 MB) von jsDelivr und staticimgly.com. Deine Bilder bleiben auf dem Gerät. Ohne Zustimmung nutzt du die normale Freistellung.', ok:'Laden'})) return;
  aiOk = true; state.draft.ai = true; process();
};
$('rcrop').onclick = () => { if(!state.draft) return; state.draft.crop = null; const b = $('selbox'); if(b) b.style.display = 'none'; process(); };

$('ok').onclick = () => {
  if(!state.draft || !state.draft.img){ status('Bitte zuerst ein Bild hinzufügen.', true); return; }
  if(state.draft.busy){ status('Einen Moment, das Bild wird noch verarbeitet …', true); return; }
  const raw = $('url').value.trim(), v = raw ? Scraper.validateUrl(Scraper.normalizeLinkInput(raw)) : null;
  if(v && !v.ok){ status('Der Link ist ungültig: ' + v.error, true); $('url').setAttribute('aria-invalid', 'true'); return; }
  const price = Scraper.sanitizePrice(parsePrice($('price').value)), cur = Scraper.normalizeCurrency($('cur').value, 'EUR'), ed = state.editing;
  const prev = ed && ed.cur === cur ? baseHistory(ed.priceHistory || [], ed.price) : [];
  const f = {img:state.draft.img, orig:state.draft.orig, alpha:state.draft.alpha, cut:state.draft.cut, mirror:!!state.draft.mirror, name:Scraper.sanitizeText($('name').value) || 'Ohne Namen', cat:$('cat').value, link:v ? v.url : '', price, cur, status:$('itemState').value === 'wish' ? 'wish' : 'own', priceHistory:recordPrice(prev, price), tags:parseTags($('tags').value, Scraper.sanitizeText)};
  if(COLOR_NAMES.includes($('color').value)) f.color = $('color').value;
  if(state.editing){ Object.assign(state.editing, f); if(!f.color) delete state.editing.color; } else { const n = {id:newId(), ...f}; state.data.items.unshift(n); state.fresh = n.id; }
  renderAll(); state.fresh = null; flush(); closeDialog($('dlg'));
};