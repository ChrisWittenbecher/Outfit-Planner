// @ts-nocheck
import * as Geo from './geometry.js';
import { $, DEF, announce, imgOf, item, mb, state } from './core.js';
import { toast } from './ui.js';
import { haptic } from './haptics.js';
import { step, undo } from './history.js';
import { fitBoard } from './fitter.js';
import { renderAll } from './render.js';
import { drawKnob, placeKnob, syncBench } from './rotation.js';
import { renderSum } from './outfits.js';
import { persist } from './storage.js';
import { noDrag, pinchCount, touches } from './gestures.js';
import { renderGrid } from './wardrobe.js';

export function toggle(i){
  const auto = !state.board.length || state.fitted;
  const ex = state.board.find(p => p.id === i.id);
  if(ex){ state.board = state.board.filter(p => p !== ex); if(state.sel === i.id) state.sel = null; }
  else { state.board = state.board.filter(p => item(p.id)?.cat !== i.cat || i.cat === 'Accessoire'); addPiece(i); }
  if(state.sel && !state.board.some(p => p.id === state.sel)) state.sel = null;
  announce(i.name + (ex ? ' vom Board entfernt' : ' aufs Board gelegt'));
  renderAll();
  if(auto && state.board.length) fitBoard();   // Outfit-Fitter: Teile passen direkt zueinander
}
const RANK = {'Schuhe':0,'Hose/Rock':1,'Oberteil':2,'Jacke':3,'Accessoire':4}; // Standard-Reihenfolge von hinten nach vorn
const rank = id => RANK[item(id)?.cat] ?? 2;
/** Legt genau diese Teile aufs Board, jedes an seinem Standardplatz. */
export function placeAll(list){ state.board = []; for(const i of list) addPiece(i); }
function insertPiece(arr, i){ const d = DEF[i.cat]; let k = arr.length; while(k > 0 && rank(arr[k-1].id) > RANK[i.cat]) k--; arr.splice(k, 0, {id:i.id, x:d[0], y:d[1], w:d[2], r:0}); }
function addPiece(i){ insertPiece(state.board, i); }
/** Teile an ihren Standardplätzen in der richtigen Ebenenreihenfolge, ohne das Board zu verändern. */
export function piecesFor(list){ const a = []; for(const i of list) insertPiece(a, i); return a; }
export const cleanPieces = list => Geo.sanitizePieces(list).filter(p => imgOf(p.id));
export function fixOrder(a){ if(a.some(p => 'z' in p)){ a.sort((p, q) => rank(p.id) - rank(q.id)); a.forEach(p => delete p.z); } return a; } // ältere Daten: Reihenfolge neu setzen
export function moveLayer(id, to){ const k = state.board.findIndex(p => p.id === id); if(k < 0) return; const [p] = state.board.splice(k, 1); state.board.splice(Math.max(0, Math.min(state.board.length, to)), 0, p); renderBoard(); announce((item(id)?.name || 'Teil') + ' liegt jetzt auf Ebene ' + (state.board.findIndex(q => q.id === id) + 1) + ' von ' + state.board.length); }
export const KNOB_GAP = 30;          // Abstand des Drehgriffs zur Kante des Teils (px)
export const aspects = new Map();    // id -> Höhe/Breite des Bildes (wird beim Laden gemerkt)
export const pieceEls = new Map();   // id -> <img> auf dem Board
const aspectOf = id => aspects.get(id) ?? 1.3;
export const heightOf = p => p.w * aspectOf(p.id);
export const selPiece = () => state.board.find(k => k.id === state.sel);
export const centerOf = p => ({x:p.x + p.w / 2, y:p.y + heightOf(p) / 2});

export function stylePiece(p, im){ Object.assign(im.style, {left:p.x + 'px', top:p.y + 'px', width:p.w + 'px', transform:`rotate(${p.r || 0}deg)`}); }

/** Zeile über den Buttons: sagt, welches Teil die Buttons gerade bedienen */
export function showSelInfo(){
  const el = $('selInfo'), it = state.sel && state.board.some(k => k.id === state.sel) ? item(state.sel) : null;
  el.classList.toggle('on', !!it);
  el.textContent = it ? 'Ausgewählt: ' + it.name : (state.board.length ? 'Tippe ein Teil an, um es zu ändern' : '');
}

function select(id){
  if(state.sel === id) return; state.sel = id; haptic('select');
  pieceEls.forEach((el, k) => el.classList.toggle('sel', k === id));
  $('board').classList.add('has-sel');
  ['bigger','smaller','front','back'].forEach(b => $(b).disabled = false);
  drawKnob(); syncBench(); renderSum(); showSelInfo();
}
export function setRotation(p, deg){ p.r = Geo.normalizeAngle(deg); applyLive(p); }
export function moveCenter(p, cx, cy){
  const h = heightOf(p), c0 = centerOf(p), bb = Geo.rotatedBounds(p.w, h, p.r || 0);
  const c = Geo.clampCenter(cx ?? c0.x, cy ?? c0.y, bb.w, bb.h);
  p.x = c.x - p.w / 2; p.y = c.y - h / 2; applyLive(p);
}
export function applyLive(p, lockFlip){ state.fitted = false; const el = pieceEls.get(p.id); if(el) stylePiece(p, el); placeKnob(p, lockFlip); syncBench(); persist(); }

const DOUBLE = {ms:450, slop:48};            // Zeit (ms) und Abstand (px) zwischen zwei Tipps
const TAP_SLOP = {touch:14, mouse:4};
let lastTap = null;
function takeOff(p){
  step();
  const it = item(p.id);
  if(it) toggle(it);
  else { state.board = state.board.filter(k => k !== p); if(state.sel === p.id) state.sel = null; renderAll(); }
  toast('„' + (it ? it.name : 'Teil') + '“ vom Board genommen', {haptic:'warn', action:{label:'Rückgängig', fn:undo}});
}
function tapped(p, e){
  const now = performance.now();
  const prev = lastTap; lastTap = {id:p.id, t:now, x:e.clientX, y:e.clientY};
  if(!prev || prev.id !== p.id || now - prev.t > DOUBLE.ms || Math.hypot(e.clientX - prev.x, e.clientY - prev.y) > DOUBLE.slop) return;
  lastTap = null; takeOff(p);
}

export function renderBoard(){
  [...$('board').querySelectorAll('.p')].forEach(n => n.remove()); pieceEls.clear();
  $('hint').style.display = state.board.length ? 'none' : 'grid';
  ['bigger','smaller','front','back'].forEach(id => $(id).disabled = !state.sel);
  $('fit').disabled = !state.board.length;
  $('board').classList.toggle('has-sel', !!state.sel); showSelInfo();
  state.board.forEach((p, idx) => {
    const im = new Image(); im.src = imgOf(p.id); im.className = 'p' + (p.id === state.sel ? ' sel' : '') + mb(item(p.id)); im.draggable = false; im.alt = '';
    stylePiece(p, im); im.style.zIndex = String(idx + 1); pieceEls.set(p.id, im);
    im.onload = () => { aspects.set(p.id, im.naturalHeight / im.naturalWidth); if(p.id === state.sel){ placeKnob(p); syncBench(); } };
    im.onpointerdown = e => {
      e.preventDefault(); e.stopPropagation();
      if(touches.size > 1) return; // zweiter Finger: Geste übernimmt (siehe unten)
      im.setPointerCapture(e.pointerId); select(p.id);
      const sx = e.clientX / state.K - p.x, sy = e.clientY / state.K - p.y, slop = e.pointerType === 'touch' ? TAP_SLOP.touch : TAP_SLOP.mouse;
      const g0 = pinchCount();
      let moved = false;
      im.onpointermove = m => {
        if(noDrag) return;
        if(!moved && Math.hypot(m.clientX - e.clientX, m.clientY - e.clientY) <= slop) return;
        moved = true; moveCenter(p, m.clientX / state.K - sx + p.w / 2, m.clientY / state.K - sy + heightOf(p) / 2);
      };
      im.onpointerup = u => {
        const gesture = noDrag || touches.size > 0 || pinchCount() !== g0;   // Teil einer Zwei-Finger-Geste
        im.onpointermove = im.onpointerup = null; renderGrid(); persist();
        if(gesture || moved) lastTap = null; else tapped(p, u);
      };
    };
    im.onwheel = e => { e.preventDefault(); resize(p, e.deltaY < 0 ? 1.06 : .94); };
    $('board').append(im);
  });
  drawKnob(); syncBench(); renderSum(); persist();
}
$('board').addEventListener('pointerdown', e => { if(touches.size > 1) return; if((e.target === $('board')) && state.sel){ state.sel = null; renderBoard(); } });
function resize(p, f){ state.fitted = false; const c = centerOf(p); p.w = Geo.clamp(p.w * f, Geo.LIMITS.minW, Geo.LIMITS.maxW); const h = heightOf(p); p.x = c.x - p.w / 2; p.y = c.y - h / 2; renderBoard(); }
$('bigger').onclick = () => { const p = state.board.find(k => k.id === state.sel); if(p) resize(p, 1.1); };
$('smaller').onclick = () => { const p = state.board.find(k => k.id === state.sel); if(p) resize(p, .9); };
$('front').onclick = () => { if(state.sel) moveLayer(state.sel, state.board.length); };
$('back').onclick = () => { if(state.sel) moveLayer(state.sel, 0); };
$('clear').onclick = () => { step(); state.board = []; state.sel = null; renderAll(); };
document.addEventListener('keydown', e => {
  if(document.querySelector('dialog[open]') || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if(e.key === 'Delete' && selPiece()) takeOff(selPiece());
  if(e.key === 'Escape' && state.sel){ state.sel = null; renderBoard(); }
  const p = selPiece(); if(!p || document.activeElement !== document.body) return;
  const st = e.shiftKey ? 15 : 5, mv = e.shiftKey ? 10 : 1;
  if(e.key === '[' ){ e.preventDefault(); setRotation(p, (p.r || 0) - st); }
  else if(e.key === ']'){ e.preventDefault(); setRotation(p, (p.r || 0) + st); }
  else if(e.key.startsWith('Arrow')){ e.preventDefault(); const c = centerOf(p); moveCenter(p, c.x + ({ArrowLeft:-mv, ArrowRight:mv}[e.key] || 0), c.y + ({ArrowUp:-mv, ArrowDown:mv}[e.key] || 0)); }
});
$('shuffle').onclick = () => {
  const pick = c => { const l = state.data.items.filter(i => i.cat === c); return l[Math.floor(Math.random()*l.length)]; };
  step(); state.board = []; state.sel = null;
  ['Oberteil','Hose/Rock','Schuhe'].concat(Math.random() < .5 ? ['Jacke'] : [], Math.random() < .35 ? ['Accessoire'] : []).forEach(c => { const i = pick(c); if(i) addPiece(i); });
  if(!state.board.length) toast('Füge zuerst Teile zum Kleiderschrank hinzu.');
  renderAll();
  if(state.board.length) fitBoard();
};
export function fit(){
  state.K = Math.min(1, ($('stage').clientWidth - 36) / 400);
  const wrap = $('wrap').style; wrap.width = 400 * state.K + 'px'; wrap.height = 600 * state.K + 'px';
  $('board').style.transform = `scale(${state.K})`;
}
addEventListener('resize', fit);