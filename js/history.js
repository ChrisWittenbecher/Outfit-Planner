// @ts-nocheck
/**
 * Anprobe – Rückgängig und Wiederholen (bis zu 50 Schritte) für Kleiderschrank, Board und Outfits.
 *
 * Statt jede Aktion einzeln zu kennen, vergleicht der Verlauf nach jedem Sichern den Bestand mit dem letzten Stand
 * (siehe onFlush in storage.js). Änderungen, die schnell aufeinander folgen, etwa das Ziehen eines Teils, werden zu
 * EINEM Schritt zusammengefasst. Bilder sind Zeichenketten und werden zwischen den Ständen geteilt, nicht kopiert.
 */
import { $, announce, state } from './core.js';
import { renderAll } from './render.js';
import { flush, onFlush } from './storage.js';

const MAX = 50, GAP = 600;       // Schritte, und Pause (ms), ab der eine neue Änderung ein neuer Schritt ist
let past = [], future = [], present = null, lastT = 0, applying = false;

const clone = o => JSON.parse(JSON.stringify(o));
const snap = () => ({ items: state.data.items.map(i => ({ ...i })), outfits: clone(state.data.outfits), board: clone(state.board), fitted: state.fitted });
const sameItem = (a, b) => { const k = Object.keys(a); return k.length === Object.keys(b).length && k.every(x => x in b && (typeof a[x] === 'object' ? JSON.stringify(a[x]) === JSON.stringify(b[x]) : a[x] === b[x])); };
const same = (a, b) => a.items.length === b.items.length && a.items.every((it, k) => sameItem(it, b.items[k])) && JSON.stringify(a.outfits) === JSON.stringify(b.outfits) && JSON.stringify(a.board) === JSON.stringify(b.board);

function buttons() { $('undo').disabled = !past.length; $('redo').disabled = !future.length; }

/** Nimmt den aktuellen Bestand als neuen Stand auf, falls er sich geändert hat. */
export function record() {
  if (applying) return;
  const s = snap();
  if (!present) { present = s; return; }
  if (same(present, s)) return;
  const now = Date.now();
  if (now - lastT > GAP) { past.push(present); if (past.length > MAX) past.shift(); }   // sonst: derselbe Schritt, nur weiter fortgeschritten
  present = s; future = []; lastT = now; buttons();
}
/** Trennt den nächsten Schritt vom vorigen, auch wenn er innerhalb der Pause folgt (für bewusste Aktionen wie Löschen). */
export function step() { record(); lastT = 0; }
/** Startet den Verlauf mit dem geladenen Bestand. */
export function startHistory() { present = snap(); past = []; future = []; lastT = 0; buttons(); onFlush(record); }   // erst hier anmelden: die Module importieren sich gegenseitig, storage.js ist beim Laden von history.js noch nicht fertig

function apply() {
  applying = true;
  state.data.items = present.items.map(i => ({ ...i })); state.data.outfits = clone(present.outfits); state.board = clone(present.board);
  state.fitted = !!present.fitted;   // Rückgängig stellt auch zurück, ob das Layout noch „angeordnet“ war
  if (state.sel && !state.board.some(p => p.id === state.sel)) state.sel = null;
  renderAll(); flush(); applying = false; lastT = 0; buttons();
}
export function undo() {
  record();                                   // noch nicht gesicherte Änderungen zuerst aufnehmen
  if (!past.length) return false;
  future.push(present); present = past.pop(); apply(); announce('Rückgängig gemacht'); return true;
}
export function redo() {
  record();
  if (!future.length) return false;
  past.push(present); present = future.pop(); apply(); announce('Wiederholt'); return true;
}

$('undo').onclick = undo;
$('redo').onclick = redo;
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  if (document.querySelector('dialog[open]') || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;   // dort gilt das Rückgängig des Feldes
  const k = e.key.toLowerCase();
  if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); }
});
