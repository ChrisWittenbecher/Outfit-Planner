// @ts-nocheck
import { $ } from './core.js';
import { load, setReady } from './storage.js';
import { renderAll } from './render.js';
import './dialog.js';
import './wardrobe.js';
import './board.js';
import './rotation.js';
import './gestures.js';
import './exchange.js';
import './outfits.js';
import './fitter.js';
import './ui.js';
import './theme.js';
import './update.js';
import './calendar.js';
import { startCare } from './pwa.js';
import { startHistory } from './history.js';

load().then(ok => {
  setReady(ok);
  if (!ok) $('saveState').textContent = 'Speicher nicht lesbar – Änderungen werden nicht gesichert. Seite neu laden.';
  renderAll();
  startHistory();
  startCare();
  document.documentElement.dataset.ready = '1'; // Signal für Tests und die Fallback-Meldung
});
