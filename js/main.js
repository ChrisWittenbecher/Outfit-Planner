// @ts-nocheck
import { $ } from './core.js';
import { load, setReady } from './storage.js';
import { loadThumbs } from './thumbs.js';
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
import './haptics.js';
import './theme.js';
import './update.js';
import './calendar.js';
import './ideas.js';
import { startCare } from './pwa.js';
import { startHistory } from './history.js';
import { startCloud } from './cloud.js';

load().then(async ok => {
  setReady(ok);
  if (ok) await loadThumbs();   // erst dann zeichnen, damit die Karten gleich die kleinen Bilder bekommen
  if (!ok) $('saveState').textContent = 'Speicher nicht lesbar – Änderungen werden nicht gesichert. Seite neu laden.';
  renderAll();
  startHistory();
  startCare();
  startCloud();
  document.documentElement.dataset.ready = '1'; // Signal für Tests und die Fallback-Meldung
});
