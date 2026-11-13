// @ts-nocheck
import { $, item, state } from './core.js';
import { renderGrid } from './wardrobe.js';
import { renderOuts } from './outfits.js';
import { flush } from './storage.js';
import { step } from './history.js';
import { closeDialog, showDialog } from './sheet.js';
import { WEAR_ERR, logWear, ownedIds, prepareWear } from './wearlog.js';
import { addDays, dayKey, monthGrid, shiftMonth } from './wear.js';

const dlg = $('calDlg');
$('calDayTitle').tabIndex = -1;
const BOARD = '__board';
const view = { sel: '' };
const today = () => dayKey(new Date());
const dateOf = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d, 12); };
const monthFmt = new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' });
const dayFmt = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const monthOf = key => { const [y, m] = key.split('-').map(Number); return [y, m - 1]; };
const outfitById = id => state.data.outfits.find(o => o.id === id);
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

function say(text) { const l = $('calLive'); l.textContent = ''; setTimeout(() => { l.textContent = text; }, 30); }
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function button(label, fn, cls = 'small') { const b = el('button', cls, label); b.type = 'button'; b.onclick = fn; return b; }
function changed(refocus = false) {
  flush(); renderGrid(); renderOuts(); render();
  if (refocus) $('calDayTitle').focus();   // die gedrückte Schaltfläche ist weg
}
const dropPlan = day => { const p = { ...state.data.plans }; delete p[day]; state.data.plans = p; };

function renderMonth() {
  const [y, m] = monthOf(view.sel), t = today();
  $('calMonth').textContent = monthFmt.format(new Date(y, m, 1));
  const days = new Map();
  for (const w of state.data.wears) days.set(w.d, (days.get(w.d) || 0) + 1);
  const rows = [];
  const cells = monthGrid(y, m);
  for (let r = 0; r < 6; r++) {
    const tr = document.createElement('tr');
    for (const c of cells.slice(r * 7, r * 7 + 7)) {
      const td = document.createElement('td'), b = el('button', 'cal-day' + (c.inMonth ? '' : ' cal-day--out'), String(Number(c.key.slice(8))));
      b.type = 'button'; b.dataset.day = c.key;
      const worn = days.get(c.key) || 0, plan = outfitById(state.data.plans[c.key]);
      b.setAttribute('aria-label', dayFmt.format(dateOf(c.key)) + (worn ? ', ' + plural(worn, 'Outfit', 'Outfits') + ' getragen' : '') + (plan ? ', geplant: ' + plan.name : ''));
      b.setAttribute('aria-pressed', String(c.key === view.sel));
      if (c.key === t) b.setAttribute('aria-current', 'date');
      b.tabIndex = c.key === view.sel ? 0 : -1;
      if (worn) b.append(el('i', 'worn'));
      else if (plan) b.append(el('i', 'plan'));
      b.onclick = () => select(c.key, true);
      td.append(b); tr.append(td);
    }
    rows.push(tr);
  }
  $('calGrid').tBodies[0].replaceChildren(...rows);
}

function renderDay() {
  const day = view.sel, t = today();
  $('calDayTitle').textContent = dayFmt.format(dateOf(day));
  const list = [];
  for (const w of state.data.wears.filter(x => x.d === day)) {
    const li = el('li'), box = el('div', 't');
    const names = w.items.map(id => item(id)?.name).filter(Boolean);
    box.append(el('b', '', 'Getragen: ' + w.n), el('small', '', plural(names.length, 'Teil', 'Teile') + (names.length ? ': ' + names.slice(0, 4).join(', ') + (names.length > 4 ? ' …' : '') : '')));
    li.append(box, button('Entfernen', () => {
      step(); state.data.wears = state.data.wears.filter(x => x.id !== w.id); changed(true); say('Eintrag „' + w.n + '“ entfernt');
    }));
    li.lastChild.setAttribute('aria-label', 'Eintrag „' + w.n + '“ entfernen');
    list.push(li);
  }
  const plan = outfitById(state.data.plans[day]);
  if (plan) {
    const li = el('li'), box = el('div', 't');
    box.append(el('b', '', 'Geplant: ' + plan.name));
    li.append(box);
    if (day <= t) li.append(button('Als getragen', () => {
      const r = prepareWear(day, plan);
      if ('err' in r) return say(WEAR_ERR[r.err]);
      step(); state.data.wears = r.list; dropPlan(day); changed(true); say('„' + plan.name + '“ als getragen eingetragen');
    }));
    li.append(button('Entfernen', () => {
      step(); dropPlan(day); changed(true); say('Plan für „' + plan.name + '“ entfernt');
    }));
    list.push(li);
  }
  if (!list.length) list.push(el('li', 'cal-empty', day > t ? 'Noch nichts geplant.' : 'Für diesen Tag ist nichts eingetragen.'));
  $('calDayList').replaceChildren(...list);
}

function renderPick() {
  const sel = $('calPick'), prev = sel.value;
  const opts = [];
  if (ownedIds(state.board).length) opts.push(new Option('Aktuelles Board', BOARD));
  for (const o of state.data.outfits) opts.push(new Option(o.name, o.id));
  sel.replaceChildren(...opts);
  if (opts.some(o => o.value === prev)) sel.value = prev;
  actions();
}

function actions() {
  const pick = $('calPick').value, day = view.sel, t = today();
  const none = !pick, board = pick === BOARD;
  $('calPick').disabled = none;
  $('calWear').disabled = none || day > t;
  $('calPlan').disabled = none || day < t || board;
  const hints = [];
  if (none) hints.push('Lege Teile aufs Board oder speichere ein Outfit, dann kannst du es hier eintragen.');
  else {
    if (day > t) hints.push('Getragen lässt sich nur bis heute eintragen.');
    if (day < t) hints.push('Planen ist erst ab heute möglich.');
    if (board && day >= t) hints.push('Zum Planen muss das Outfit gespeichert sein.');
  }
  $('calHint').textContent = hints.join(' ');
  $('calHint').hidden = !hints.length;
}

function render() { renderMonth(); renderDay(); renderPick(); }

function select(key, focus) {
  view.sel = key; render();
  if (focus) dlg.querySelector('.cal-day[tabindex="0"]')?.focus();
}

const KEYS = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
$('calGrid').addEventListener('keydown', e => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  const from = e.target.closest?.('.cal-day')?.dataset.day || view.sel;
  const weekday = (dateOf(from).getDay() + 6) % 7;
  let next = null;
  if (e.key in KEYS) next = addDays(from, KEYS[e.key]);
  else if (e.key === 'Home') next = addDays(from, -weekday);
  else if (e.key === 'End') next = addDays(from, 6 - weekday);
  else if (e.key === 'PageUp') next = shiftMonth(from, -1);
  else if (e.key === 'PageDown') next = shiftMonth(from, 1);
  if (!next) return;
  e.preventDefault(); select(next, true);
});

$('calPrev').onclick = () => select(shiftMonth(view.sel, -1), false);
$('calNext').onclick = () => select(shiftMonth(view.sel, 1), false);
$('calToday').onclick = () => select(today(), false);
$('calPick').onchange = actions;
$('calWear').onclick = () => {
  const pick = $('calPick').value, o = pick === BOARD ? null : outfitById(pick);
  const r = logWear(view.sel, o);
  if (r !== 'ok') return say(WEAR_ERR[r]);
  changed(); say('Eingetragen: ' + (o ? o.name : 'aktuelles Board'));
};
$('calPlan').onclick = () => {
  const o = outfitById($('calPick').value);
  if (!o) return;
  step(); state.data.plans = { ...state.data.plans, [view.sel]: o.id }; changed(); say('Geplant: ' + o.name);
};
$('calClose').onclick = () => closeDialog(dlg);

function open() {
  view.sel = today();
  render(); showDialog(dlg);
}
$('calBtn').onclick = open;
