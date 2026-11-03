// @ts-nocheck
/**
 * Anprobe – Gesamtdarstellung: alles neu zeichnen, Teil löschen.
 */
import { fit, renderBoard } from './board.js';
import { syncFigure } from './figure.js';
import { renderChips, renderGrid } from './wardrobe.js';
import { renderOuts } from './outfits.js';

export function renderAll(){ fit(); syncFigure(); renderChips(); renderGrid(); renderBoard(); renderOuts(); }
