// @ts-check
/** Die Bereiche der App. „schrank“ ist der Standard und hat keine Adresse. */
export const VIEWS = Object.freeze(['schrank', 'vorschlaege']);
/** @typedef {'schrank' | 'vorschlaege'} View */

export const TITLE = Object.freeze({ schrank: 'Outfit-Planner', vorschlaege: 'Vorschläge – Outfit-Planner' });

/** Bereich aus dem Adressteil nach dem #. Alles Unbekannte führt zum Schrank. @param {unknown} hash @returns {View} */
export function viewOf(hash) {
  const h = typeof hash === 'string' ? hash.replace(/^#/, '') : '';
  return /** @type {View | undefined} */ (VIEWS.find(v => v === h)) ?? 'schrank';
}

/** Adressteil für einen Bereich ('' beim Schrank). @param {View} view */
export const hashOf = view => (view === 'schrank' ? '' : '#' + view);

/**
 * Welcher Reiter bekommt den Fokus, wenn man mit Pfeiltasten wechselt?
 * @param {readonly string[]} order @param {string} current @param {string} key
 * @returns {string | null} null, wenn die Taste nichts bewegt
 */
export function nextTab(order, current, key) {
  const i = order.indexOf(current);
  if (i < 0 || !order.length) return null;
  if (key === 'ArrowRight' || key === 'ArrowDown') return order[(i + 1) % order.length];
  if (key === 'ArrowLeft' || key === 'ArrowUp') return order[(i - 1 + order.length) % order.length];
  if (key === 'Home') return order[0];
  if (key === 'End') return order[order.length - 1];
  return null;
}
