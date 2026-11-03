// @ts-nocheck
/**
 * Anprobe – Design: Hell, Dunkel oder Automatisch (Systemeinstellung) und Bühne des Boards.
 * Das gespeicherte Design setzt js/theme-init.js schon vor dem ersten Zeichnen; hier liegen Umschalter und Meldungen.
 */
import { $, announce } from './core.js';

const KEY = 'anprobe-theme', STAGE_KEY = 'anprobe-stage';
const MODES = [['auto', 'Automatisch'], ['light', 'Hell'], ['dark', 'Dunkel']];
const STAGES = [['auto', 'Auto'], ['light', 'Hell'], ['mid', 'Mittel'], ['dark', 'Dunkel']];
const COLORS = { light: '#e8eaee', dark: '#0f0f12' };   // Farbe der Browserleiste, gleich --bg
const root = document.documentElement;

const read = (key, list) => { try { const v = localStorage.getItem(key); return list.some(([k]) => k === v) ? v : 'auto'; } catch (e) { return 'auto'; } };
const write = (key, v) => { try { if (v === 'auto') localStorage.removeItem(key); else localStorage.setItem(key, v); } catch (e) { /* Speicher gesperrt */ } };
const label = (list, v) => list.find(([k]) => k === v)[1];
const next = (list, v) => list[(list.findIndex(([k]) => k === v) + 1) % list.length][0];

let mode = read(KEY, MODES), stage = read(STAGE_KEY, STAGES);

/** Setzt Attribut, Schaltfläche und Farbe der Browserleiste. Bei „Automatisch“ gelten wieder die Medienabfragen im HTML. */
function paint() {
  if (mode === 'auto') delete root.dataset.theme; else root.dataset.theme = mode;
  document.querySelectorAll('#theme svg').forEach(s => { s.hidden = s.dataset.mode !== mode; });
  const b = $('theme'); b.title = 'Design: ' + label(MODES, mode) + ' (tippen zum Wechseln)'; b.setAttribute('aria-label', 'Design wechseln, aktuell ' + label(MODES, mode));
  const light = $('metaLight'), dark = $('metaDark');
  if (mode === 'auto') { light.content = COLORS.light; dark.content = COLORS.dark; light.media = '(prefers-color-scheme: light)'; dark.media = '(prefers-color-scheme: dark)'; }
  else { light.content = dark.content = COLORS[mode]; light.media = dark.media = 'all'; }
}
function paintStage() {
  if (stage === 'auto') delete root.dataset.stage; else root.dataset.stage = stage;
  $('stageBtn').textContent = 'Bühne: ' + label(STAGES, stage);
}
/** Wechselt weich (View Transition), wo der Browser es kann und die Person Bewegung nicht reduziert hat. */
const swap = fn => {
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (document.startViewTransition && !calm) document.startViewTransition(fn); else fn();
};

$('theme').onclick = () => {
  mode = next(MODES, mode); write(KEY, mode);
  swap(paint); announce('Design: ' + label(MODES, mode));
};
$('stageBtn').onclick = () => {
  stage = next(STAGES, stage); write(STAGE_KEY, stage);
  paintStage(); announce('Bühne des Boards: ' + label(STAGES, stage));
};
paint(); paintStage();
