// @ts-nocheck
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const sheetMode = () => matchMedia('(max-width: 560px)').matches;
const EXIT_MS = 260;
const FLING = 0.11;      // px/ms: ab dieser Geschwindigkeit genügt ein kurzer Wisch
const PULL = 0.3;        // Anteil der Sheet-Höhe, ab dem auch langsames Ziehen schließt
const STALE = 100;       // ms: eine ältere Bewegung zählt nicht mehr als Schwung
const SHEET_EASE = 'cubic-bezier(.32, .72, 0, 1)';
const pending = new WeakMap();

// Zurück-Taste, Zurück-Wischen und Browser-Zurück schließen zuerst den obersten Dialog, statt die Seite zu verlassen.
// Jeder geöffnete Dialog legt einen Verlaufseintrag an; schließt er anders (Button, Wischen, Esc), wird dieser wieder entfernt.
const stack = [];          // Dialoge mit eigenem Verlaufseintrag, oberster zuletzt
let undoing = 0;           // ausstehende history.back()-Aufrufe, die wir selbst ausgelöst haben
const waiting = [];        // Dialoge, deren Eintrag erst nach dem ausstehenden Zurück angelegt wird

function track(d) {
  if (stack.includes(d) || waiting.includes(d)) return;
  if (undoing) { waiting.push(d); return; }
  try { history.pushState({ anprobeDialog: stack.length + 1 }, ''); stack.push(d); } catch { /* ohne Verlauf bleibt es beim bisherigen Verhalten */ }
}

export function showDialog(d) {
  pending.get(d)?.(false);
  if (!d.open) { d.showModal(); track(d); }
}

// 'close' sprudelt nicht nach oben, wird aber in der Capture-Phase gesehen
document.addEventListener('close', e => {
  const d = e.target;
  const w = waiting.indexOf(d);
  if (w >= 0) waiting.splice(w, 1);
  const i = stack.indexOf(d);
  if (i < 0) return;
  stack.splice(i, 1);
  if (i === stack.length) { undoing++; history.back(); }   // war der oberste: eigenen Eintrag wieder entfernen
}, true);

window.addEventListener('popstate', () => {
  if (undoing) {
    undoing--;
    if (!undoing) while (waiting.length) { const d = waiting.shift(); if (d.open) track(d); }
    return;
  }
  const d = stack.pop();           // Nutzer ist zurückgegangen: Eintrag ist schon weg
  if (d?.open) closeDialog(d);
});

/** Schließt mit kurzer Ausblendung. Bei reduzierter Bewegung sofort. */
export function closeDialog(d, how = '', anim = null) {
  if (!d.open || pending.has(d)) return;
  if (calm()) { d.close(); return; }
  d.dataset.closing = how;
  const end = commit => {
    clearTimeout(timer); d.removeEventListener('animationend', onEnd); pending.delete(d);
    delete d.dataset.closing;
    if (commit && d.open) d.close();
    anim?.cancel();
  };
  const onEnd = e => { if (e.target === d && !e.pseudoElement) end(true); };
  const timer = setTimeout(() => end(true), EXIT_MS);
  d.addEventListener('animationend', onEnd);
  pending.set(d, end);
}

document.addEventListener('cancel', e => {
  if (e.target instanceof HTMLDialogElement && !calm() && !pending.has(e.target)) { e.preventDefault(); closeDialog(e.target); }
}, true);

// Tippen neben ein einfaches Menü schließt es
document.addEventListener('click', e => {
  const d = e.target;
  if (!(d instanceof HTMLDialogElement) || !d.open || d.dataset.dismiss !== 'backdrop') return;
  const r = d.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeDialog(d);
});

// Wischen am Griff schließt das Bottom-Sheet
document.addEventListener('pointerdown', e => {
  const grab = e.target instanceof Element && e.target.closest('.grab');
  const d = grab && grab.closest('dialog');
  if (!d || !d.open || !sheetMode() || pending.has(d) || !e.isPrimary || e.button) return;
  const y0 = e.clientY;
  let last = { y: y0, t: performance.now() }, v = 0, dy = 0;
  grab.setPointerCapture(e.pointerId);
  const move = m => {
    const now = performance.now();
    dy = m.clientY - y0;
    if (dy < 0) dy = -Math.sqrt(-dy) * 2;   // nach oben wächst der Widerstand
    if (now > last.t) v = (m.clientY - last.y) / (now - last.t);
    last = { y: m.clientY, t: now };
    d.style.transform = `translateY(${dy}px)`;
  };
  const up = ev => {
    grab.removeEventListener('pointermove', move); grab.removeEventListener('pointerup', up); grab.removeEventListener('pointercancel', up);
    if (performance.now() - last.t > STALE) v = 0;
    const from = dy, away = ev.type === 'pointerup' && (from > d.getBoundingClientRect().height * PULL || v > FLING);
    d.style.transform = '';
    if (calm()) { if (away) d.close(); return; }
    if (away) {
      const a = d.animate([{ transform: `translateY(${from}px)` }, { transform: 'translateY(100%)' }], { duration: 220, easing: SHEET_EASE, fill: 'forwards' });
      closeDialog(d, 'drag', a);
    } else if (from) {
      d.animate([{ transform: `translateY(${from}px)` }, { transform: 'translateY(0)' }], { duration: 260, easing: SHEET_EASE });
    }
  };
  grab.addEventListener('pointermove', move); grab.addEventListener('pointerup', up); grab.addEventListener('pointercancel', up);
});
