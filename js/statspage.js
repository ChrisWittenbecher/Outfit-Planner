// @ts-nocheck
import { $, mb, money, showThumb, state } from './core.js';
import { step, undo } from './history.js';
import { flush } from './storage.js';
import { toast } from './ui.js';
import { closeDialog, showDialog } from './sheet.js';
import { openSale } from './sell.js';
import { deleteItem } from './wardrobe.js';
import { currentView } from './nav.js';
import { haptic } from './haptics.js';
import { dayKey, daysBetween, idleText } from './wear.js';
import { IDLE_DAYS, PERIODS, SWATCH, idleList, periodKey, summarize, wearsIn } from './stats.js';

// Seite „Auswertung“: was du wirklich trägst und was nur im Schrank hängt. Rechnet nur mit den eigenen Daten auf dem Gerät.
const view = { period: '90' };
const SHOW_IDLE = 6;
const today = () => dayKey(new Date());
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const SUB = { '90': 'Die letzten 90 Tage', year: 'Das letzte Jahr', all: 'Alles, was eingetragen ist' };

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function say(text) { const l = $('statLive'); l.textContent = ''; setTimeout(() => { l.textContent = text; }, 30); }
function thumb(it) {
  const box = el('div', 'stat-thumb'), im = new Image();
  showThumb(im, it); im.alt = ''; im.className = mb(it).trim(); im.loading = 'lazy'; box.append(im);
  return box;
}

function renderTiles(r) {
  const worn = $('kWorn'); worn.replaceChildren(document.createTextNode(String(r.worn)), el('span', 'stat-of', ' von ' + r.owned));
  const c = r.costs[0];
  $('kCost').textContent = c ? money(c.perWear, c.cur) : '–';
  $('kCostNote').textContent = c
    ? 'Preis geteilt durch alle Tragetage, aus ' + c.items + (c.items === 1 ? ' Teil' : ' Teilen') + ' mit Preis' + (r.costs.length > 1 ? '. Weitere Währung: ' + r.costs.slice(1).map(x => money(x.perWear, x.cur)).join(', ') : '')
    : r.worn ? 'Keines der getragenen Teile hat einen Preis.' : 'Sobald getragene Teile einen Preis haben.';
  const col = r.color;
  $('kColor').textContent = col ? col.name : '–';
  const dot = $('kDot'); dot.hidden = !col;
  if (col) dot.style.background = SWATCH[col.name] || 'transparent';
}

function renderTop(r) {
  const list = $('statTop'); list.replaceChildren();
  const max = r.top.length ? r.top[0].count : 1;
  for (const row of r.top) {
    const li = el('li', 'stat-row'), name = el('div', 'stat-name'), bar = el('span', 'stat-bar'), fill = el('i');
    name.append(el('b', '', row.item.name), el('small', '', row.item.cat + (row.cost != null ? ' · ' + money(row.cost, row.item.cur) + ' pro Tragen' : ' · ohne Preis')));
    fill.style.width = Math.max(4, Math.round(row.count / max * 100)) + '%'; bar.append(fill); bar.setAttribute('aria-hidden', 'true');
    const n = el('span', 'stat-n', row.count + '×'); n.setAttribute('aria-label', plural(row.count, 'Tag', 'Tage') + ' getragen');
    li.append(thumb(row.item), name, bar, n); list.append(li);
  }
  $('topTitle').hidden = list.hidden = !r.top.length;
}

function renderIdle(t) {
  const rows = idleList(state.data.items, state.data.wears, t), box = $('idleList');
  box.replaceChildren();
  $('idleSub').textContent = rows.length
    ? 'Diese Teile hast du seit ' + IDLE_DAYS + ' Tagen nicht getragen.'
    : (state.data.items.some(i => i.status !== 'wish') ? 'Alles in Bewegung: Jedes Teil war in den letzten ' + IDLE_DAYS + ' Tagen dran oder ist noch neu.' : 'Sobald du Teile angelegt hast, siehst du hier, welche nur hängen.');
  for (const r of rows.slice(0, SHOW_IDLE)) {
    const li = el('li', 'idle'), top = el('div', 'idle-top'), txt = el('div', 't');
    const note = r.last ? 'Zuletzt ' + idleText(r.idle) + ' getragen' : 'Noch nie getragen' + (r.added ? ', angelegt ' + idleText(daysBetween(r.added, t)) : '');
    txt.append(el('b', '', r.item.name), el('small', '', note));
    top.append(thumb(r.item), txt);
    const act = el('div', 'idle-act'), keep = el('button', 'small', 'Behalten'), out = el('button', 'small', 'Aussortieren');
    keep.type = out.type = 'button';
    keep.setAttribute('aria-label', 'Behalten: ' + r.item.name); out.setAttribute('aria-label', 'Aussortieren: ' + r.item.name);
    keep.onclick = () => keepItem(r.item);
    out.onclick = () => askSort(r.item, note, out);
    act.append(keep, out); li.append(top, act); box.append(li);
  }
  const more = rows.length - SHOW_IDLE;
  $('idleMore').textContent = more > 0 ? 'Und ' + plural(more, 'weiteres Teil', 'weitere Teile') + '. Sie kommen an die Reihe, sobald du diese entschieden hast.' : '';
  $('idleMore').hidden = more <= 0;
}

function render() {
  if (currentView() !== 'auswertung') return;
  const t = today(), r = summarize(state.data.items, state.data.wears, t, view.period), n = wearsIn(state.data.wears, t, view.period).length;
  for (const b of document.querySelectorAll('#statPeriod button')) b.setAttribute('aria-pressed', String(b.dataset.p === view.period));
  $('statSub').textContent = SUB[view.period] + ' · ' + (n ? plural(n, 'eingetragenes Outfit', 'eingetragene Outfits') : 'nichts eingetragen');
  const any = state.data.wears.some(w => w.d <= t);
  const empty = $('statEmpty');
  empty.textContent = !any
    ? 'Noch nichts eingetragen. Trage im Kalender oder mit „Heute getragen“ ein, was du anhattest. Dann siehst du hier, was sich lohnt und was nur im Schrank hängt.'
    : !n ? 'In diesem Zeitraum ist nichts eingetragen. Wähle „Jahr“ oder „Gesamt“.' : '';
  empty.hidden = !empty.textContent;
  renderTiles(r); renderTop(r); renderIdle(t);
}

function keepItem(it) {
  step(); it.keep = today(); flush(); haptic('select');
  toast('„' + it.name + '“ bleibt. In ' + IDLE_DAYS + ' Tagen frage ich wieder.', { action: { label: 'Rückgängig', fn: undo } });
  say('„' + it.name + '“ bleibt im Schrank');
  render(); $('idleTitle').focus();
}

// Der Dialog macht die Seite beim Schließen noch ~260 ms lang unbedienbar. Folgeschritte (Verkaufstext, Löschen, Fokus) laufen deshalb erst nach „close“.
let pending = null, opener = null, next = null;
function askSort(it, note, btn) {
  pending = it; opener = btn; next = null;
  $('sortTitle').textContent = it.name; $('sortInfo').textContent = note + '. Was soll damit passieren?';
  showDialog($('sortDlg'));
}
$('sortSell').onclick = () => { const it = pending; if (!it) return; next = () => openSale(it); closeDialog($('sortDlg')); };
$('sortDelete').onclick = () => {
  const it = pending; if (!it) return;
  next = () => { deleteItem(it); render(); $('idleTitle').focus(); };   // deleteItem meldet das Löschen selbst (Hinweis mit „Rückgängig“)
  closeDialog($('sortDlg'));
};
$('sortClose').onclick = () => closeDialog($('sortDlg'));
$('sortDlg').addEventListener('close', () => {
  const go = next, back = opener;
  pending = opener = next = null;
  if (back && back.isConnected) back.focus();   // nicht jeder Browser stellt den Fokus selbst wieder her
  if (go) go();
});

for (const b of document.querySelectorAll('#statPeriod button')) b.onclick = () => {
  const k = periodKey(b.dataset.p);
  if (k === view.period) return;
  view.period = k; render(); say(PERIODS.find(p => p.key === k).label);
};
let fromHere = false;
$('statCal').onclick = () => { fromHere = true; $('calBtn').click(); };
$('idleTitle').tabIndex = -1;

document.addEventListener('anprobe:view', render);
document.addEventListener('anprobe:render', render);
$('calDlg').addEventListener('close', () => {
  render();   // Eintragen im Kalender ändert die Zahlen
  if (fromHere) { fromHere = false; if (currentView() === 'auswertung') $('statCal').focus(); }   // nicht jeder Browser stellt den Fokus selbst wieder her
});
