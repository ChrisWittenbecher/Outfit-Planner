// @ts-nocheck
import { BOARD } from './geometry.js';
import { $, imgOf, item, loadImg, state } from './core.js';
import { toast } from './ui.js';
import { canShareImage, classifyShareError, shareFileName } from './sharefile.js';

// Outfit als Bild: wird auf dem Gerät gezeichnet, nichts geht an einen Server. Dieselbe Zeichnung dient dem Speichern („Als Bild laden“)
// und dem Teilen über das Menü des Systems (Dateien per navigator.share). Wo das nicht geht, wird die Datei gespeichert.
const SCALE = 2;   // Board 400 × 600 → Bild 800 × 1200
const FAIL = 'Das Bild konnte nicht erstellt werden.';
const missing = n => n + (n === 1 ? ' Teil fehlt' : ' Teile fehlen') + ' im Schrank und ' + (n === 1 ? 'ist' : 'sind') + ' nicht auf dem Bild.';
const stage = () => getComputedStyle($('board')).backgroundColor;   // Bühne des Boards (Hell, Mittel oder Dunkel)
const usable = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.w) && p.w > 0;

/**
 * Zeichnet die Teile in Boardreihenfolge (das letzte liegt vorn). Teile, die es nicht mehr gibt oder deren Bild nicht lädt, werden übersprungen.
 * @returns {Promise<{ canvas: HTMLCanvasElement, drawn: number, skipped: number }>}
 */
export async function drawOutfit(pieces, bg) {
  const c = document.createElement('canvas'); c.width = BOARD.w * SCALE; c.height = BOARD.h * SCALE;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height);
  const imgs = await Promise.all(pieces.map(async p => { try { const src = usable(p) && imgOf(p.id); return src ? await loadImg(src) : null; } catch { return null; } }));
  let drawn = 0;
  pieces.forEach((p, k) => {
    const im = imgs[k]; if (!im || !im.width) return;
    const w = p.w * SCALE, h = w * im.height / im.width;
    x.save(); x.globalCompositeOperation = item(p.id)?.cut ? 'source-over' : 'multiply';
    x.translate(p.x * SCALE + w / 2, p.y * SCALE + h / 2); x.rotate((p.r || 0) * Math.PI / 180);   // Drehung um die Mitte
    x.drawImage(im, -w / 2, -h / 2, w, h); x.restore();
    drawn++;
  });
  return { canvas: c, drawn, skipped: pieces.length - drawn };
}

async function makeFile(pieces, name) {
  const { canvas, drawn, skipped } = await drawOutfit(pieces, stage());
  try {
    if (!drawn) return null;
    const blob = await new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob')), 'image/png'));
    return { file: new File([blob], shareFileName(name), { type: 'image/png' }), skipped };
  } finally { canvas.width = canvas.height = 0; }   // Speicher sofort freigeben
}

function save(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a'); a.href = url; a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/** Über das Teilen-Menü senden. Bricht die Person ab, bleibt es still. Ohne Unterstützung oder bei einem Fehler wird die Datei gespeichert. */
async function send(file, title, skipped, again = false) {
  const extra = skipped ? ' ' + missing(skipped) : '';
  if (canShareImage(navigator, file)) {
    try {
      await navigator.share({ files: [file], title });
      if (skipped) toast(missing(skipped));
      return;
    } catch (e) {
      const k = classifyShareError(e);
      if (k === 'abort') return;
      if (k === 'denied' && !again) {   // Der Browser will eine frische Berührung (das Zeichnen hat zu lange gedauert): das fertige Bild liegt bereit
        toast('Das Bild ist fertig. Tippe auf „Teilen“, um es zu senden.' + extra, { ms: 15000, action: { label: 'Teilen', fn: () => send(file, title, skipped, true) } });
        return;
      }
    }
    save(file); toast('Teilen hat nicht geklappt. Das Bild wurde als Datei gespeichert.' + extra, { kind: 'error', ms: 9000 });
    return;
  }
  save(file); toast('Dieses Gerät kann Bilder nicht direkt teilen. Das Bild wurde als Datei gespeichert.' + extra, { ms: 9000 });
}

let busy = false;
/** @param {HTMLElement} btn Knopf, der gedrückt wurde @param {'share' | 'save'} how */
async function run(btn, pieces, how, name, title) {
  if (busy || !pieces.length) return;
  busy = true; btn.setAttribute('aria-busy', 'true');
  try {
    const made = await makeFile(pieces.map(p => ({ ...p })), name);
    if (!made) { toast(FAIL, { kind: 'error' }); return; }
    if (how === 'save') { save(made.file); if (made.skipped) toast(missing(made.skipped)); return; }
    await send(made.file, title, made.skipped);
  } catch { toast(FAIL, { kind: 'error' }); }
  finally { busy = false; btn.removeAttribute('aria-busy'); }
}

/** Gespeichertes Outfit teilen (Knopf in der Liste „Gespeichert“). */
export const shareSaved = (btn, outfit) => run(btn, outfit.pieces, 'share', outfit.name, outfit.name);

$('png').onclick = () => run($('png'), state.board, 'save', '', 'Outfit');
$('shareBtn').onclick = () => run($('shareBtn'), state.board, 'share', '', 'Outfit');
