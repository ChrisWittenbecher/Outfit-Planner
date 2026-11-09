// @ts-check

export const CONDITIONS = Object.freeze({
  neu: { label: 'Neu mit Etikett', factor: 0.7, text: 'Neu, noch mit Etikett.' },
  sehrgut: { label: 'Sehr gut', factor: 0.55, text: 'Sehr guter Zustand, ohne erkennbare Mängel.' },
  gut: { label: 'Gut', factor: 0.45, text: 'Guter Zustand, normale Tragespuren.' },
  gebraucht: { label: 'Gebraucht', factor: 0.3, text: 'Gebraucht, mit Tragespuren.' },
});
/** @typedef {keyof typeof CONDITIONS} Condition */

/** Rundet auf glatte Beträge: unter 10 € auf 50 Cent, darüber auf ganze Euro. @param {number} v */
export const roundPrice = v => (v < 10 ? Math.round(v * 2) / 2 : Math.round(v));

/**
 * Preisvorschlag aus dem Kaufpreis und dem Zustand. Null, wenn der Kaufpreis fehlt.
 * @param {number | null | undefined} paid @param {Condition} cond
 */
export function priceIdea(paid, cond) {
  if (typeof paid !== 'number' || !Number.isFinite(paid) || paid <= 0) return null;
  const f = (CONDITIONS[cond] || CONDITIONS.gut).factor;
  return Math.max(1, roundPrice(paid * f));
}

/** @param {number} v @param {string} cur */
const money = (v, cur) => { try { return new Intl.NumberFormat('de-DE', { style: 'currency', currency: cur || 'EUR' }).format(v); } catch { return v.toFixed(2) + ' ' + cur; } };

/**
 * Entwurf für eine Verkaufsanzeige. Enthält nur, was die App sicher weiß: keine Behauptungen zu Tragehäufigkeit oder Herkunft.
 * @param {{ name: string, cat: string, color?: string, tags?: string[], price?: number | null, cur?: string }} item
 * @param {{ condition: Condition, size?: string, shipping?: boolean }} opts
 * @returns {{ title: string, price: number | null, text: string }}
 */
export function saleDraft(item, opts) {
  const cond = CONDITIONS[opts.condition] ? opts.condition : 'gut';
  const size = (opts.size || '').replace(/\s+/g, ' ').trim().slice(0, 20);
  const price = priceIdea(item.price, cond);
  const cur = item.cur || 'EUR';
  const title = (item.name + (size ? ' – Gr. ' + size : '')).slice(0, 70);
  const lines = [title, ''];
  lines.push('Art: ' + item.cat + (item.color ? ', ' + item.color : ''));
  if (size) lines.push('Größe: ' + size);
  lines.push('Zustand: ' + CONDITIONS[cond].label + '. ' + CONDITIONS[cond].text);
  const tags = (Array.isArray(item.tags) ? item.tags : []).filter(t => typeof t === 'string' && t).slice(0, 5);
  if (tags.length) lines.push('Stichworte: ' + tags.join(', '));
  lines.push('', price != null ? 'Preis: ' + money(price, cur) + ' VB' : 'Preis: VB');
  lines.push(opts.shipping ? 'Versand möglich, die Kosten trägt der Käufer. Abholung ebenfalls möglich.' : 'Nur Abholung.');
  lines.push('Privatverkauf, daher keine Garantie und keine Rücknahme.');
  return { title, price, text: lines.join('\n') };
}
