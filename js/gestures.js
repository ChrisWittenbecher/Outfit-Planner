// @ts-nocheck
/**
 * Anprobe – Zwei-Finger-Geste auf dem Board (Touch): Größe, Drehung und Verschieben.
 */
import * as Geo from './geometry.js';
import { centerOf, moveCenter, selPiece } from './board.js';
import { renderGrid } from './wardrobe.js';
import { persist } from './storage.js';
import { $, state } from './core.js';

/* ==========================================================================
   Zwei-Finger-Geste auf dem Board (Touch): Größe, Drehung und Verschieben
   - Der Abstand der Finger skaliert das ausgewählte Teil um seine Mitte
   - Der Winkel zwischen den Fingern dreht es, die Mitte zwischen den Fingern verschiebt es
   - Registriert in der Capture-Phase, damit die Einzel-Finger-Bedienung unberührt bleibt
   ========================================================================== */
export const touches = new Map();    // pointerId -> {x, y} (nur Touch)
export let pinch = null, noDrag = false;
const pair = () => { const [a, b] = [...touches.values()]; return {a, b, dist:Math.hypot(a.x - b.x, a.y - b.y), mid:{x:(a.x + b.x) / 2, y:(a.y + b.y) / 2}, ang:Geo.angleFromCenter(a.x, a.y, b.x, b.y)}; };
function startPinch(){
  const p = selPiece(); if(!p){ pinch = null; return; }
  const g = pair(); if(g.dist < 12){ pinch = null; return; }
  pinch = {id:p.id, w0:p.w, r0:p.r || 0, d0:g.dist, mid0:g.mid, c0:centerOf(p), last:g.ang, rot:0};
}
function movePinch(){
  const p = pinch && selPiece(); if(!p || p.id !== pinch.id || touches.size < 2) return;
  const g = pair();
  if(g.ang !== null && pinch.last !== null){ pinch.rot += Geo.shortestDelta(pinch.last, g.ang); }
  pinch.last = g.ang ?? pinch.last;
  p.w = Geo.clamp(pinch.w0 * g.dist / pinch.d0, Geo.LIMITS.minW, Geo.LIMITS.maxW);
  p.r = Geo.normalizeAngle(pinch.r0 + pinch.rot);
  moveCenter(p, pinch.c0.x + (g.mid.x - pinch.mid0.x) / state.K, pinch.c0.y + (g.mid.y - pinch.mid0.y) / state.K);
}
function endTouch(e){
  if(!touches.delete(e.pointerId)) return;
  if(touches.size < 2 && pinch){ pinch = null; renderGrid(); persist(); }
  if(touches.size === 0) noDrag = false;
}
$('board').addEventListener('pointerdown', e => {
  if(e.pointerType !== 'touch') return;
  touches.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if(touches.size === 2){ noDrag = true; startPinch(); }
}, true);
$('board').addEventListener('pointermove', e => { const t = touches.get(e.pointerId); if(!t) return; t.x = e.clientX; t.y = e.clientY; if(pinch) movePinch(); }, true);
['pointerup', 'pointercancel'].forEach(t => $('board').addEventListener(t, endTouch, true));
$('board').addEventListener('gesturestart', e => e.preventDefault());