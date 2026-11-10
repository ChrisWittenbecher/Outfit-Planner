// @ts-nocheck
import { item, state } from './core.js';
import { flush } from './storage.js';
import { step } from './history.js';
import { addWear } from './wear.js';

export const WEAR_ERR = {
  empty: 'Dieses Outfit enthält kein Teil aus deinem Besitz.',
  dup: 'Dieses Outfit ist für den Tag schon eingetragen.',
  full: 'Das Protokoll ist voll. Bitte sichere ein Backup und lösche alte Einträge.',
};

/** Teile eines Outfits, die dir gehören (Wunschlisten-Teile kann man nicht getragen haben). */
export const ownedIds = pieces => [...new Set(pieces.map(p => p.id))].filter(id => { const it = item(id); return it && it.status !== 'wish'; });

/**
 * Rechnet aus, wie das Protokoll nach dem Eintrag aussähe, ohne etwas zu ändern.
 * @returns {{ list: object[] } | { err: 'empty'|'dup'|'full' }}
 */
export function prepareWear(day, outfit = null) {
  const items = ownedIds(outfit ? outfit.pieces : state.board);
  if (!items.length) return { err: 'empty' };
  if (outfit && state.data.wears.some(w => w.d === day && w.o === outfit.id)) return { err: 'dup' };
  const entry = { id: 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), d: day, n: outfit ? outfit.name : 'Eigene Kombination', items };
  if (outfit) entry.o = outfit.id;
  const list = addWear(state.data.wears, entry);
  return list ? { list } : { err: 'full' };
}

/**
 * Trägt ein Outfit (oder das Board, wenn `outfit` fehlt) für einen Tag ein.
 * @returns {'ok'|'empty'|'dup'|'full'}
 */
export function logWear(day, outfit = null) {
  const r = prepareWear(day, outfit);
  if ('err' in r) return r.err;
  step(); state.data.wears = r.list; flush();
  return 'ok';
}
