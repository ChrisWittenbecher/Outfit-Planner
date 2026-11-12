// @ts-check
// Führt zwei Stände (dieses Gerät und Google) zusammen, wenn beide Seiten Änderungen haben.
// Regel: nichts geht verloren. Teile und Outfits aus beiden Ständen bleiben, bei gleicher Kennung gewinnt dieses Gerät.

/** @typedef {{ items: {id: string}[], outfits: {id: string}[], wears: unknown[], plans: Record<string, string>, board?: unknown[], fitted?: boolean }} Data */

/** @template {{id: string}} T @param {T[]} mine @param {T[]} theirs */
const union = (mine, theirs) => { const seen = new Set(mine.map(x => x.id)); return [...mine, ...theirs.filter(x => !seen.has(x.id))]; };

/** @param {Data} local @param {Data} remote @returns {Data} */
export function mergeData(local, remote) {
  const wears = new Map();
  for (const w of [...(local.wears || []), ...(remote.wears || [])]) wears.set(JSON.stringify(w), w);
  return {
    ...local,
    items: union(local.items || [], remote.items || []),
    outfits: union(local.outfits || [], remote.outfits || []),
    wears: [...wears.values()],
    plans: { ...(remote.plans || {}), ...(local.plans || {}) },
  };
}
