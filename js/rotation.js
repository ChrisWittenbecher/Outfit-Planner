// @ts-nocheck
import * as Geo from './geometry.js';
import { $, item, state } from './core.js';
import { KNOB_GAP, applyLive, centerOf, heightOf, moveCenter, selPiece, setRotation } from './board.js';

export function placeKnob(p, lockFlip){
  const ctl = $('board').querySelector('.rot-ctl'); if(!ctl) return;
  const h = heightOf(p), up = h / 2 + KNOB_GAP, cos = Math.cos((p.r || 0) * Math.PI / 180), c = centerOf(p);
  const flip = lockFlip ?? ((c.y - up * cos < 16) && (c.y + up * cos < 584));
  ctl.dataset.flip = flip ? '1' : '0';
  Object.assign(ctl.style, {left:c.x + 'px', top:c.y + 'px', zIndex:String(state.board.length + 2), transform:`rotate(${p.r || 0}deg)`});
  const knob = ctl.querySelector('.rot-knob'), stem = ctl.querySelector('.rot-stem');
  knob.style.top = ((flip ? up : -up) - 11) + 'px';
  stem.style.top = (flip ? h / 2 : -up + 11) + 'px'; stem.style.height = (KNOB_GAP - 11) + 'px';
  knob.setAttribute('aria-valuenow', String(Math.round(p.r || 0))); knob.setAttribute('aria-valuetext', Geo.angleAria(p.r || 0));
}
export function drawKnob(){
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
      const c = centerOf(p), a = Geo.angleFromCenter(c.x, c.y, (m.clientX - rect.left) / state.K, (m.clientY - rect.top) / state.K); if(a === null) return;
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

export function syncBench(){
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