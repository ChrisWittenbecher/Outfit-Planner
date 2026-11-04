// @ts-nocheck
import { fit, renderBoard } from './board.js';
import { renderChips, renderGrid } from './wardrobe.js';
import { renderOuts } from './outfits.js';

export function renderAll(){ fit(); renderChips(); renderGrid(); renderBoard(); renderOuts(); }
