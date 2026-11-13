// @ts-nocheck
import * as Scraper from './scraper.js';
import { $, CATS, newId, readFile, state } from './core.js';
import { detectColor, makeImage, norm } from './image.js';
import { MAX_BATCH, nameFromFile, planFiles } from './intake.js';
import { addLabel, counts, headText, inBudget, needsRedo, nextRow, percent, resultText } from './queue.js';
import { recordPrice } from './prices.js';
import { renderAll } from './render.js';
import { flush } from './storage.js';
import { step, undo } from './history.js';
import { haptic } from './haptics.js';
import { toast } from './ui.js';
import { closeDialog, showDialog } from './sheet.js';

// Mehrere Fotos auf einmal: Warteschlange mit Zustand je Foto. Verarbeitet wird nacheinander (mit Pausen für die Oberfläche).
// Erst „Hinzufügen“ schreibt in den Bestand, in einem einzigen Rückgängig-Schritt. Bis dahin ist nichts verändert.
const dlg = $('queueDlg'), list = $('queueList');
const MB = Math.round(Scraper.IMAGE_LIMITS.bytes / 1e6);
const yieldUi = () => new Promise(r => setTimeout(r, 0));
const TEXT = { wait: 'Wartet …', work: 'Wird verarbeitet …' };

class Reason extends Error {}
let rows = [], run = 0, active = 0, seq = 0, skipped = { notImage: 0, tooMany: 0 };

CATS.forEach(c => $('queueCat').add(new Option(c, c)));

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
const used = () => rows.reduce((n, r) => n + (r.state === 'done' ? r.size : 0), 0);
const say = text => { const l = $('queueLive'); l.textContent = ''; setTimeout(() => { l.textContent = text; }, 30); };

/** Ein Foto verarbeiten: verkleinern, Hintergrund entfernen, Farbe erkennen. Wirft Reason mit einem Text für die Anzeige. */
async function processFile(f, cat) {
  if (f.size > Scraper.IMAGE_LIMITS.bytes) throw new Reason('Die Datei ist zu groß (höchstens ' + MB + ' MB).');
  let n;
  try { n = await norm(await readFile(f)); } catch { throw new Reason('Das ist kein lesbares Bild.'); }
  let r;
  try { r = await makeImage({ orig: n.url, crop: null, alpha: n.alpha, rm: true, tol: 28, mirror: false, mirrorTouched: false }, cat); }
  catch { throw new Reason('Das Bild konnte nicht verarbeitet werden.'); }
  const color = await detectColor(r.img, r.cut).catch(() => null);
  return { orig: n.url, alpha: n.alpha, img: r.img, cut: r.cut, mirror: r.mirror, color };
}

function build(row) {
  const li = el('li', 'q q--' + row.state), thumb = el('div', 'q-thumb'), body = el('div', 'q-body');
  const rm = el('button', 'small', 'Entfernen'); rm.type = 'button'; rm.dataset.role = 'remove'; rm.setAttribute('aria-label', 'Entfernen: ' + row.file.name);
  rm.onclick = () => remove(row);
  if (row.state === 'done') {
    const im = new Image(); im.alt = ''; im.src = row.result.img; thumb.append(im);
    const name = el('input'); name.value = row.name; name.maxLength = 120; name.autocomplete = 'off'; name.dataset.role = 'name'; name.setAttribute('aria-label', 'Name, ' + row.file.name);
    name.oninput = () => { row.name = name.value; };
    const cat = el('select'); CATS.forEach(c => cat.add(new Option(c, c))); cat.value = row.cat; cat.dataset.role = 'cat'; cat.setAttribute('aria-label', 'Kategorie, ' + row.file.name);
    cat.onchange = () => { row.cat = cat.value; if (needsRedo(row)) requeue(row); };
    body.append(name, cat);
  } else {
    thumb.append(el('span', row.state === 'fail' ? 'q-mark' : 'q-spin', row.state === 'fail' ? '!' : ''));
    body.append(el('b', 'q-file', row.file.name), el('small', 'q-state' + (row.state === 'fail' ? ' q-state--err' : ''), row.state === 'fail' ? row.reason : TEXT[row.state]));
  }
  li.append(thumb, body, rm);
  return li;
}
/** Zeile neu zeichnen. Der Fokus bleibt auf demselben Bedienelement, falls es das noch gibt. */
function paint(row) {
  const old = row.li, was = old && old.contains(document.activeElement) ? document.activeElement.dataset.role : null;
  row.li = build(row);
  if (old && old.isConnected) old.replaceWith(row.li); else list.append(row.li);
  if (was) row.li.querySelector('[data-role="' + was + '"]')?.focus({ preventScroll: true });
}

function head() {
  const c = counts(rows), p = percent(c);
  $('queueHead').textContent = headText(c);
  const bar = $('queueBar'); bar.setAttribute('aria-valuenow', String(p)); bar.firstElementChild.style.width = p + '%';
  $('queueAdd').textContent = addLabel(c); $('queueAdd').disabled = !c.done;
  $('queueCancel').textContent = !c.wait && !c.work && !c.done ? 'Schließen' : 'Abbrechen';
  return c;
}

function requeue(row) { row.state = 'wait'; row.result = null; row.size = 0; paint(row); head(); ensurePump(); }

async function pump(token) {
  while (token === run) {
    const row = nextRow(rows); if (!row) break;
    row.state = 'work'; row.procCat = row.cat; row.reason = ''; paint(row); head();
    await yieldUi();
    if (token !== run) return;
    if (!rows.includes(row)) continue;   // während der Pause entfernt
    let res = null, reason = '';
    if (!inBudget(used(), 1)) reason = 'Zu viel auf einmal. Füge dieses Foto danach in einem zweiten Durchgang hinzu.';
    else {
      try { res = await processFile(row.file, row.procCat); }
      catch (e) { reason = e instanceof Reason ? e.message : 'Das Bild konnte nicht verarbeitet werden.'; }
    }
    if (token !== run) return;
    if (!rows.includes(row)) continue;   // währenddessen entfernt
    if (res) {
      const size = res.img.length + res.orig.length;
      if (!inBudget(used(), size)) { res = null; reason = 'Zu viel auf einmal. Füge dieses Foto danach in einem zweiten Durchgang hinzu.'; }
      else { row.result = res; row.size = size; }
    }
    row.state = res ? (needsRedo(row) ? 'wait' : 'done') : 'fail';
    if (row.state === 'wait') { row.result = null; row.size = 0; }
    row.reason = reason; paint(row); head();
  }
  if (token === run) { const c = head(); if (c.total) say(headText(c) + (c.done ? '. Prüfe Namen und Kategorie, dann tippe auf Hinzufügen.' : '')); }
}
function ensurePump() {
  if (active === run) return;
  const token = active = run;
  pump(token).finally(() => { if (active === token) active = 0; });
}

function remove(row) {
  const k = rows.indexOf(row); if (k < 0) return;
  rows.splice(k, 1);
  const next = rows[k] || rows[k - 1];
  row.li.remove(); head(); say('Foto entfernt');
  if (!rows.length) { closeDialog(dlg); return; }
  (next.li.querySelector('[data-role="remove"]') || $('queueTitle')).focus({ preventScroll: true });
}

function toItem(row, wish) {
  const r = row.result;
  const it = { id: newId(), img: r.img, orig: r.orig, alpha: r.alpha, cut: r.cut, mirror: r.mirror, name: Scraper.sanitizeText(row.name) || 'Neues Teil', cat: row.cat, link: '', price: null, cur: 'EUR', status: wish ? 'wish' : 'own', priceHistory: recordPrice([], null), tags: [] };
  if (r.color) it.color = r.color;
  return it;
}

$('queueAdd').onclick = () => {
  const c = counts(rows);
  if (!c.done || !dlg.open || 'closing' in dlg.dataset) return;   // schon beim Schließen: nicht doppelt hinzufügen
  const wish = $('queueState').value === 'wish', items = rows.filter(r => r.state === 'done').map(r => toItem(r, wish));
  run++;   // anhalten: noch wartende Fotos werden nicht mehr verarbeitet
  step(); state.data.items.unshift(...items); renderAll(); flush();
  const text = resultText({ added: items.length, cats: [...new Set(items.map(i => i.cat))], wish, failed: c.fail, stopped: c.wait + c.work, notImage: skipped.notImage, tooMany: skipped.tooMany, max: MAX_BATCH });
  closeDialog(dlg);
  haptic('success');
  toast(text, { ms: c.fail || c.wait || c.work || skipped.notImage || skipped.tooMany ? 14000 : 10000, action: { label: 'Rückgängig', fn: undo } });
};
$('queueCancel').onclick = () => closeDialog(dlg);

$('queueCat').onchange = () => {
  const cat = $('queueCat').value;
  for (const r of rows) {
    if (r.cat === cat) continue;
    r.cat = cat;
    if (r.state === 'done') { if (needsRedo(r)) requeue(r); else { const s = r.li.querySelector('select'); if (s) s.value = cat; } }
  }
};

dlg.addEventListener('close', () => { run++; rows = []; list.replaceChildren(); });

/** Öffnet die Warteschlange für mehrere Fotos und beginnt mit der Verarbeitung. */
export function startQueue(files) {
  if (dlg.open) return;
  const plan = planFiles(files);
  if (!plan.list.length) { toast('Das sind keine Bilder.', { kind: 'error' }); return; }
  const cat = state.filter !== 'Alle' ? state.filter : CATS[0];
  run++; seq = 0;
  rows = plan.list.map(f => ({ id: ++seq, file: f, name: nameFromFile(f.name, Scraper.sanitizeText), cat, state: 'wait', procCat: null, result: null, size: 0, reason: '', li: null }));
  skipped = { notImage: plan.notImage, tooMany: plan.tooMany };
  $('queueCat').value = cat; $('queueState').value = state.statusFilter === 'wish' ? 'wish' : 'own';
  const note = [plan.notImage ? (plan.notImage === 1 ? '1 Datei ist kein Bild' : plan.notImage + ' Dateien sind keine Bilder') + ' und fehlt.' : '', plan.tooMany ? plan.tooMany + (plan.tooMany === 1 ? ' Bild liegt' : ' Bilder liegen') + ' über dem Limit von ' + MAX_BATCH + ' Fotos und fehlt.' : ''].filter(Boolean).join(' ');
  $('queueNote').textContent = note; $('queueNote').hidden = !note;
  list.replaceChildren(); $('queueLive').textContent = '';
  for (const r of rows) paint(r);
  head();
  showDialog(dlg);
  ensurePump();
}
