// @ts-nocheck
import { $, announce, item, showThumb, state } from './core.js';
import { cleanPieces, placeAll } from './board.js';
import { fitBoard, layoutItems } from './fitter.js';
import { flush } from './storage.js';
import { step, undo } from './history.js';
import { renderAll } from './render.js';
import { renderOuts } from './outfits.js';
import { askText, toast } from './ui.js';
import { haptic } from './haptics.js';
import { copyText } from './clip.js';
import { suggest, WEATHER, WEATHER_LABEL } from './stylist.js';
import { MAX_DAYS, capsule, packText } from './packing.js';
import { dayKey } from './wear.js';
import { cardSub, cardTitle, seedFor } from './suggestcard.js';
import { currentView, go } from './nav.js';

// Seite „Vorschläge“: drei Outfit-Vorschläge aus dem eigenen Schrank und die Packliste. Alles rechnet auf dem Gerät.
const view = { mode: 'out', weather: 'mild', round: 0, avoid: [], shown: [] };
const today = () => dayKey(new Date());
const pieces = () => state.data.items.filter(i => i.status !== 'wish');
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const DATE = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function say(text) { const l = $('sugLive'); l.textContent = ''; setTimeout(() => { l.textContent = text; }, 30); }
const current = () => suggest(state.data.items, state.data.wears, { weather: view.weather, today: today(), seed: seedFor(today(), view.round), count: 3, avoid: view.avoid });

function toBoard(s, title) {
  const list = s.ids.map(item).filter(Boolean);
  if (!list.length) return;
  step();
  placeAll(list); state.sel = null; state.fitted = true;
  renderAll(); flush();
  go('schrank', { focus: true });
  fitBoard();
  toast('„' + title + '“ liegt auf dem Board', { haptic: 'success', action: { label: 'Rückgängig', fn: undo } });
  announce('Vorschlag aufs Board gelegt');
}

async function saveCard(s, title) {
  const list = s.ids.map(item).filter(Boolean);
  if (!list.length) return;
  const name = await askText({ title: 'Outfit speichern', label: 'Name des Outfits', value: title, ok: 'Speichern' });
  if (name === null) return;
  const placed = cleanPieces(await layoutItems(list));
  if (!placed.length) return;
  step();
  state.data.outfits.unshift({ id: 'o' + Date.now(), name: name || title, pieces: placed });
  renderOuts(); flush(); haptic('success');
  toast('Outfit „' + (name || title) + '“ gespeichert', { action: { label: 'Rückgängig', fn: undo } });
  say('Outfit gespeichert');
}

function renderOut() {
  const list = $('sugCards'), note = $('sugNote');
  const { suggestions, missing } = current();
  view.shown = [...new Set(suggestions.flatMap(s => s.ids))];
  const msg = [];
  if (!pieces().length) msg.push('Lege zuerst ein paar Teile an, dann kann ich Outfits vorschlagen.');
  else if (missing.length) msg.push('Es fehlen noch: ' + missing.join(', ') + '.' + (suggestions.length ? ' Die Vorschläge kommen ohne aus.' : ''));
  if (suggestions.length) msg.push('Gewählt nach Wetter, Farben und danach, was länger nicht dran war. Die Wetter-Tags („Winter“, „Sommer“, „wasserdicht“) hilfst du dir selbst, indem du sie an Teile vergibst.');
  note.textContent = msg.join(' ');
  note.hidden = !msg.length;
  $('sugMore').disabled = suggestions.length === 0;
  const taken = [];
  list.replaceChildren(...suggestions.map((s, k) => {
    const its = s.ids.map(item).filter(Boolean);
    const title = cardTitle({ pieces: its, reasons: s.reasons }, view.weather, taken); taken.push(title);
    const card = $('sugTpl').content.firstElementChild.cloneNode(true);
    card.classList.toggle('sug--first', k === 0);
    const strip = card.querySelector('.sug-strip');
    for (const it of its) { const tile = el('div', 'sug-tile'), im = new Image(); showThumb(im, it); im.alt = ''; im.className = it.cut ? '' : 'mb'; tile.append(im); strip.append(tile); }
    card.querySelector('.sug-title').textContent = title;
    card.querySelector('.sug-sub').textContent = cardSub(its.length, view.weather);
    card.querySelector('.sug-why').replaceChildren(...s.reasons.map(r => el('li', '', r)));
    const names = its.map(i => i.name).join(', ');
    const tryBtn = card.querySelector('.sug-try'), saveBtn = card.querySelector('.sug-save');
    tryBtn.setAttribute('aria-label', 'Anprobieren: ' + title + ' (' + names + ')');
    tryBtn.onclick = () => toBoard(s, title);
    saveBtn.title = 'Als Outfit speichern';
    saveBtn.setAttribute('aria-label', 'Als Outfit speichern: ' + title + ' (' + names + ')');
    saveBtn.onclick = () => saveCard(s, title);
    return card;
  }));
  return suggestions;
}

function packDays() {
  const n = Math.floor(Number($('packDays').value));
  return Number.isFinite(n) ? Math.min(MAX_DAYS, Math.max(1, n)) : 1;
}

function renderPack() {
  const r = capsule(state.data.items, state.data.wears, { days: packDays(), weather: view.weather, today: today() });
  const box = $('packList');
  box.replaceChildren();
  const have = r.groups.reduce((n, g) => n + g.items.length, 0);
  const msg = [];
  if (!pieces().length) msg.push('Lege zuerst ein paar Teile an, dann kann ich eine Packliste zusammenstellen.');
  else {
    if (have) msg.push(plural(have, 'Teil', 'Teile') + ' für ' + plural(r.days, 'Tag', 'Tage') + ', ' + plural(r.combos, 'mögliches Outfit', 'mögliche Outfits') + ' ohne Accessoires.');
    if (r.short.length) msg.push('Zu wenig im Schrank: ' + r.short.map(s => s.cat + ' (' + s.have + ' von ' + s.want + ')').join(', ') + '.');
  }
  $('packNote').textContent = msg.join(' ');
  $('packCopy').disabled = have === 0;
  for (const g of r.groups) {
    if (!g.items.length) continue;
    const h = el('h3', '', g.cat + ' '); h.append(el('small', '', g.items.length + ' von ' + g.want));
    const ul = el('ul');
    for (const it of g.items) {
      const li = el('li'), lab = el('label', 'ck'), cb = document.createElement('input');
      cb.type = 'checkbox';
      lab.append(cb, document.createTextNode(' ' + it.name + (it.color ? ' (' + it.color + ')' : '')));
      li.append(lab); ul.append(li);
    }
    box.append(h, ul);
  }
  return r;
}

function render() {
  if (currentView() !== 'vorschlaege') return;
  const out = view.mode === 'out';
  $('sugDate').textContent = DATE.format(new Date()) + ' · Vorschläge nur aus deinem Schrank';
  $('sugOut').hidden = !out; $('sugPack').hidden = out;
  $('sugModeOut').setAttribute('aria-pressed', String(out)); $('sugModePack').setAttribute('aria-pressed', String(!out));
  for (const b of document.querySelectorAll('.sug-w button')) b.setAttribute('aria-pressed', String(b.dataset.w === view.weather));
  if (out) renderOut(); else renderPack();
}

for (const b of document.querySelectorAll('.sug-w button')) b.onclick = () => {
  if (!WEATHER.includes(b.dataset.w) || b.dataset.w === view.weather) return;
  view.weather = b.dataset.w; view.round++; view.avoid = []; render(); say('Wetter: ' + WEATHER_LABEL[view.weather]);
};
$('sugModeOut').onclick = () => { view.mode = 'out'; render(); };
$('sugModePack').onclick = () => { view.mode = 'pack'; render(); };
$('sugMore').onclick = () => { view.avoid = view.shown; view.round++; render(); say('Neue Vorschläge'); };
$('packDays').oninput = () => { if ($('packDays').value !== '') renderPack(); };
$('packDays').onchange = () => { $('packDays').value = String(packDays()); renderPack(); };
$('packCopy').onclick = async () => {
  const r = capsule(state.data.items, state.data.wears, { days: packDays(), weather: view.weather, today: today() });
  say(await copyText(packText(r, view.weather)) ? 'Liste kopiert' : 'Kopieren hat nicht geklappt');
};

// Neu zeichnen, wenn der Bereich geöffnet wird oder sich der Bestand ändert (z. B. nach dem Abgleich mit Google).
document.addEventListener('anprobe:view', render);
document.addEventListener('anprobe:render', render);
