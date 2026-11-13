// @ts-check
// Haptisches Feedback, sparsam und nur auf Touch-Geräten: Android über die Vibration API,
// iPhone (Safari ab 17.4) über einen unsichtbaren Schalter, dessen Umlegen ein Tippen auslöst.
import { $, TOUCH } from './core.js';

const KEY = 'anprobe-haptics';
/** @type {Record<string, number[]>} Muster in Millisekunden: Vibration, Pause, Vibration … */
const PATTERNS = { tick: [8], select: [12], success: [10, 55, 16], warn: [24, 60, 24], error: [30, 50, 30, 50, 30] };
/** Wie oft der iPhone-Schalter umgelegt wird, damit das Gefühl zur Art passt */
const TAPS = { tick: 1, select: 1, success: 2, warn: 2, error: 3 };

const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const canVibrate = typeof navigator.vibrate === 'function';
/** Gibt es auf diesem Gerät überhaupt etwas zu spüren? */
export const hapticsAvailable = TOUCH && (canVibrate || ios);

const read = () => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } };
let on = read();
export const hapticsOn = () => hapticsAvailable && on;
/** @param {boolean} v */
export function setHaptics(v) {
  on = !!v;
  try { if (on) localStorage.removeItem(KEY); else localStorage.setItem(KEY, 'off'); } catch { /* Speicher gesperrt */ }
  if (on) haptic('tick');
}

/** @type {HTMLLabelElement | null} */
let sw = null;
function iosSwitch() {
  if (sw) return sw;
  const l = document.createElement('label'); l.className = 'haptic'; l.setAttribute('aria-hidden', 'true');
  const i = document.createElement('input'); i.type = 'checkbox'; i.setAttribute('switch', ''); i.tabIndex = -1;
  l.append(i); document.body.append(l);
  return (sw = l);
}

/** Legt den Schalter um, ohne dass der Fokus mitwandert (Tastatur und Screenreader bleiben, wo sie waren). @param {HTMLLabelElement} l */
function tap(l) {
  const before = document.activeElement;
  l.click();
  const now = document.activeElement;
  if (now === before || !(now instanceof HTMLElement) || !l.contains(now)) return;
  if (before instanceof HTMLElement && before !== document.body && before.isConnected) {
    // WebKit scrollt den Knopf trotz preventScroll in die Mitte, auch wenn er weit außerhalb des Bildschirms liegt: die Seite sprang beim Tippen auf ein Teil
    const x = scrollX, y = scrollY;
    before.focus({ preventScroll: true });
    if (scrollX !== x || scrollY !== y) scrollTo({ left: x, top: y, behavior: 'instant' });
  } else now.blur();
}

/** @param {'tick'|'select'|'success'|'warn'|'error'} kind */
export function haptic(kind = 'tick') {
  if (!hapticsOn()) return;
  try {
    if (canVibrate) { navigator.vibrate(PATTERNS[kind] || PATTERNS.tick); return; }
    const l = iosSwitch(), n = TAPS[kind] || 1;
    for (let k = 0; k < n; k++) setTimeout(() => tap(l), k * 70);
  } catch { /* Haptik ist nur ein Zusatz */ }
}

// Kleines Tippen bei Bedienelementen, deutlicheres Muster bei Löschen. Alles andere bleibt still.
const TICK = '#fab, #addBtn, #undo, #redo, #theme, #stageBtn, #statusChips button, #chips button, #tagChips button, #sum .lay button, #bigger, #smaller, #front, #back, #fit, #shuffle, #grid .card';
const WARN = '#clear, button.danger';
document.addEventListener('click', e => {
  const t = e.target instanceof Element ? e.target : null;
  if (!t || t.closest('button:disabled')) return;
  if (t.closest(WARN)) haptic('warn'); else if (t.closest(TICK)) haptic('tick');
}, true);

// Schalter im Menü „Mehr“ (nur wo es etwas zu spüren gibt)
const btn = /** @type {HTMLButtonElement} */ ($('mHaptic'));
if (hapticsAvailable) {
  btn.hidden = false;
  const paint = () => { btn.textContent = 'Haptik: ' + (on ? 'An' : 'Aus'); btn.setAttribute('aria-pressed', String(on)); };
  paint();
  btn.addEventListener('click', () => { setHaptics(!on); paint(); });
}
