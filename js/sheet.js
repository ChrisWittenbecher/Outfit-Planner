// @ts-nocheck
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const sheetMode = () => matchMedia('(max-width: 560px)').matches;
const EXIT_MS = 260;
const FLING = 0.11;      // px/ms: ab dieser Geschwindigkeit genügt ein kurzer Wisch
const PULL = 0.3;        // Anteil der Sheet-Höhe, ab dem auch langsames Ziehen schließt
const STALE = 100;       // ms: eine ältere Bewegung zählt nicht mehr als Schwung
const SHEET_EASE = 'cubic-bezier(.32, .72, 0, 1)';
const pending = new WeakMap();

export function showDialog(d) {
  pending.get(d)?.(false);
  if (!d.open) d.showModal();
}

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
