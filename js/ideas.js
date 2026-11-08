// @ts-nocheck
import { $, announce, item, showThumb, state } from './core.js';
import { placeAll } from './board.js';
import { fitBoard } from './fitter.js';
import { flush } from './storage.js';
import { step, undo } from './history.js';
import { renderAll } from './render.js';
import { closeDialog, showDialog } from './sheet.js';
import { toast } from './ui.js';
import { copyText } from './clip.js';
import { suggest, WEATHER, WEATHER_LABEL } from './stylist.js';
import { MAX_DAYS, capsule, packText } from './packing.js';
import { dayKey } from './wear.js';

const dlg = $('ideaDlg');
const view = { tab: 'out', weather: 'mild', seed: 1 };
const today = () => dayKey(new Date());
const pieces = () => state.data.items.filter(i => i.status !== 'wish');
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function say(text) { const l = $('ideaLive'); l.textContent = ''; setTimeout(() => { l.textContent = text; }, 30); }

function toBoard(ids) {
  const list = ids.map(item).filter(Boolean);
  if (!list.length) return;
  step();
  placeAll(list); state.sel = null; state.fitted = true;
  renderAll(); flush();
  closeDialog(dlg);
  fitBoard();
  toast('Vorschlag liegt auf dem Board', { action: { label: 'Rückgängig', fn: undo } });
  announce('Vorschlag aufs Board gelegt');
}

function renderOut() {
  const list = $('ideaList'), note = $('ideaNote');
  const { suggestions, missing } = suggest(state.data.items, state.data.wears, { weather: view.weather, today: today(), seed: view.seed, count: 3 });
  const msg = [];
  if (!pieces().length) msg.push('Lege zuerst ein paar Teile an, dann kann ich Outfits vorschlagen.');
  else if (missing.length) msg.push('Es fehlen noch: ' + missing.join(', ') + '.' + (suggestions.length ? ' Die Vorschläge kommen ohne aus.' : ''));
  if (suggestions.length) msg.push('Gewählt nach Wetter, Farben und danach, was länger nicht dran war. Die Wetter-Tags („Winter“, „Sommer“, „wasserdicht“) hilfst du dir selbst, indem du sie an Teile vergibst.');
  note.textContent = msg.join(' ');
  $('ideaMore').disabled = suggestions.length === 0;
  list.replaceChildren(...suggestions.map((s, k) => {
    const li = el('li'), strip = el('div', 'idea-strip'), t = el('div', 't');
    const its = s.ids.map(item).filter(Boolean);
    for (const it of its) { const im = new Image(); showThumb(im, it); im.alt = ''; im.className = it.cut ? '' : 'mb'; strip.append(im); }
    t.append(el('b', '', its.map(i => i.name).join(' · ')), el('small', '', s.reasons.join(' · ')));
    const b = el('button', 'small', 'Aufs Board'); b.type = 'button';
    b.setAttribute('aria-label', 'Vorschlag ' + (k + 1) + ' aufs Board legen: ' + its.map(i => i.name).join(', '));
    b.onclick = () => toBoard(s.ids);
    li.append(strip, t, b);
    return li;
  }));
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
  const out = view.tab === 'out';
  $('ideaOut').hidden = !out; $('ideaPack').hidden = out;
  $('ideaTabOut').setAttribute('aria-pressed', String(out)); $('ideaTabPack').setAttribute('aria-pressed', String(!out));
  for (const b of $('ideaWeather').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.w === view.weather));
  if (out) renderOut(); else renderPack();
}

for (const b of $('ideaWeather').querySelectorAll('button')) b.onclick = () => {
  if (!WEATHER.includes(b.dataset.w)) return;
  view.weather = b.dataset.w; view.seed++; render(); say('Wetter: ' + WEATHER_LABEL[view.weather]);
};
$('ideaTabOut').onclick = () => { view.tab = 'out'; render(); };
$('ideaTabPack').onclick = () => { view.tab = 'pack'; render(); };
$('ideaMore').onclick = () => { view.seed++; render(); say('Neue Vorschläge'); };
$('packDays').oninput = () => { if ($('packDays').value !== '') renderPack(); };
$('packDays').onchange = () => { $('packDays').value = String(packDays()); renderPack(); };
$('packCopy').onclick = async () => {
  const r = capsule(state.data.items, state.data.wears, { days: packDays(), weather: view.weather, today: today() });
  say(await copyText(packText(r, view.weather)) ? 'Liste kopiert' : 'Kopieren hat nicht geklappt');
};
$('ideaClose').onclick = () => closeDialog(dlg);

$('ideaBtn').onclick = () => {
  view.tab = 'out'; view.seed = 1 + Math.floor(Math.random() * 100000);
  render(); showDialog(dlg);
};
