// @ts-nocheck
import * as Scraper from './scraper.js';
import { $, CATS, DROP, money, newId, parsePrice, readFile, state } from './core.js';
import { baseHistory, LEGACY_T, recordPrice } from './prices.js';
import { makeImage, norm } from './image.js';
import { renderAll } from './render.js';
import { flush } from './storage.js';
import { confirmBox } from './ui.js';
import { closeDialog, showDialog } from './sheet.js';

const blank = () => ({orig:null, alpha:false, crop:null, rm:true, tol:28, ai:false, img:null, cut:false, mirror:false, mirrorTouched:false});
function syncMirror(){ $('mirrorRow').hidden = $('cat').value !== 'Schuhe'; if(state.draft) $('mirror').checked = !!state.draft.mirror; }
let tok = 0;
/** Verarbeitet das Bild im Dialog und zeigt das Ergebnis an. */
async function process(){
  if(!state.draft || !state.draft.orig) return; const my = ++tok; state.draft.busy = true;
  try{
    const r = await makeImage(state.draft, $('cat').value, status);
    if(my !== tok) return;
    state.draft.img = r.img; state.draft.cut = r.cut;
    const el = new Image(); el.src = state.draft.img; el.alt = ''; $('res').replaceChildren(el); syncMirror();
  }catch(e){ if(my === tok) status('Bild konnte nicht verarbeitet werden.', true); }
  finally{ if(my === tok) state.draft.busy = false; }
}
let ptm; const processSoon = () => { clearTimeout(ptm); ptm = setTimeout(process, 120); };

CATS.forEach(c => $('cat').add(new Option(c, c)));
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
  $('imgUrl').value = ''; $('imgUrl').removeAttribute('aria-invalid'); $('imgLoad').disabled = false; linkTok++;
  $('url').value = it ? it.link || '' : ''; $('url').removeAttribute('aria-invalid'); $('name').value = it ? it.name : ''; $('cat').value = it ? it.cat : CATS[0];
  $('price').value = it && it.price != null ? it.price.toFixed(2).replace('.', ',') : ''; $('cur').value = it && it.cur || 'EUR';
  $('itemState').value = it ? (it.status === 'wish' ? 'wish' : 'own') : (state.statusFilter === 'wish' ? 'wish' : 'own');
  showHistory(it);
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

let linkTok = 0;
const LINK_WAIT = 20000;   // ms, danach gilt das Laden als gescheitert
async function loadFromLink(){
  const raw = $('imgUrl').value.trim();
  if(!raw){ status('Bitte einen Bildlink einfügen.', true); return; }
  const v = Scraper.validateUrl(Scraper.normalizeLinkInput(raw));
  if(!v.ok){ status('Der Bildlink ist ungültig: ' + v.error, true); $('imgUrl').setAttribute('aria-invalid', 'true'); return; }
  $('imgUrl').removeAttribute('aria-invalid');
  const my = ++linkTok; $('imgLoad').disabled = true; status('Bild wird geladen …');
  try{
    const n = await Promise.race([norm(v.url), new Promise((_, rej) => setTimeout(() => rej(new Error('Zeit')), LINK_WAIT))]);
    if(my !== linkTok) return;
    await adopt(n); if(my === linkTok) status('');
  }catch(e){
    if(my !== linkTok) return;
    const page = !Scraper.looksLikeImageUrl(v.url);
    if(page && !$('url').value.trim()){
      $('url').value = v.url; $('url').removeAttribute('aria-invalid');
      status('Das ist ein Link zu einer Seite, nicht zu einem Bild. Er wurde als Shop-Link übernommen. Das Bild bitte als Screenshot oder Datei hinzufügen.', true);
    } else if(page) status('Das ist ein Link zu einer Seite, nicht zu einem Bild. Dein Shop-Link bleibt unverändert. Bitte den Bildlink verwenden oder das Bild als Screenshot hinzufügen.', true);
    else status('Dieses Bild lässt sich nicht direkt laden, der Server erlaubt es nicht. Speichere das Bild oder mache einen Screenshot und füge ihn hinzu. Der Shop-Link bleibt erhalten.', true);
  }finally{ if(my === linkTok) $('imgLoad').disabled = false; }
}
$('imgLoad').onclick = loadFromLink;
$('imgUrl').onkeydown = e => { if(e.key === 'Enter'){ e.preventDefault(); loadFromLink(); } };
$('imgUrl').oninput = () => $('imgUrl').removeAttribute('aria-invalid');
async function takeFile(f){ if(f && f.type.startsWith('image/')){ if(!$('dlg').open) openDlg(); if(f.size > Scraper.IMAGE_LIMITS.bytes){ status('Das Bild ist zu groß (höchstens ' + Math.round(Scraper.IMAGE_LIMITS.bytes / 1e6) + ' MB). Bitte ein kleineres Bild oder einen Screenshot verwenden.', true); return; } try{ await setSource(await readFile(f)); }catch(e){ status('Bild konnte nicht gelesen werden.', true); } } }
$('addBtn').onclick = () => openDlg();
$('fab').onclick = () => openDlg();
$('cancel').onclick = () => closeDialog($('dlg'));
$('drop').onclick = () => { if(!state.draft || !state.draft.orig) $('file').click(); };
$('drop').onkeydown = e => { if(e.key === 'Enter' && (!state.draft || !state.draft.orig)) $('file').click(); };
$('pick').onclick = () => $('file').click();
$('file').onchange = e => { takeFile(e.target.files[0]); e.target.value = ''; };
['dragover','dragenter'].forEach(t => $('drop').addEventListener(t, e => { e.preventDefault(); $('drop').classList.add('over'); }));
['dragleave','drop'].forEach(t => $('drop').addEventListener(t, e => { e.preventDefault(); $('drop').classList.remove('over'); }));
$('drop').addEventListener('drop', e => takeFile(e.dataTransfer.files[0]));
document.addEventListener('paste', e => { const f = [...(e.clipboardData?.items || [])].find(i => i.type.startsWith('image/')); if(f){ e.preventDefault(); takeFile(f.getAsFile()); } });
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
  const f = {img:state.draft.img, orig:state.draft.orig, alpha:state.draft.alpha, cut:state.draft.cut, mirror:!!state.draft.mirror, name:Scraper.sanitizeText($('name').value) || 'Ohne Namen', cat:$('cat').value, link:v ? v.url : '', price, cur, status:$('itemState').value === 'wish' ? 'wish' : 'own', priceHistory:recordPrice(prev, price)};
  if(state.editing) Object.assign(state.editing, f); else { const n = {id:newId(), ...f}; state.data.items.unshift(n); state.fresh = n.id; }
  renderAll(); state.fresh = null; flush(); closeDialog($('dlg'));
};