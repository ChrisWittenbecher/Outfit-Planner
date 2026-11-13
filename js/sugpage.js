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
import { OCCASIONS, suggest, WEATHER, WEATHER_LABEL } from './stylist.js';
import { MAX_DAYS, capsule, packText } from './packing.js';
import { dayKey } from './wear.js';
import { cardSub, cardTitle, seedFor } from './suggestcard.js';
import { currentView, go } from './nav.js';
import { headline, subline } from './weather.js';
import { CACHE_MS, MESSAGES, getWeather } from './wx.js';

// Seite „Vorschläge“: drei Outfit-Vorschläge aus dem eigenen Schrank und die Packliste. Alles rechnet auf dem Gerät.
const PREF_KEY = 'anprobe-sug';
// Gemerkt werden nur die drei Schalter. Standort und Wetter bleiben im Arbeitsspeicher.
const prefs = (() => {
  try { const v = JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; return { wx: v.wx === true, rare: v.rare !== false, own: v.own !== false }; }
  catch { return { wx: false, rare: true, own: true }; }
})();
const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch { /* Speicher gesperrt */ } };
// wx.state: off (aus) | idle (an, noch nicht geholt) | loading | ok | error
const view = { mode: 'out', weather: 'mild', round: 0, avoid: [], shown: [], occasion: '', tagged: 0, wx: { state: prefs.wx ? 'idle' : 'off', report: null, reason: '', at: 0 } };
const today = () => dayKey(new Date());
const pieces = () => state.data.items.filter(i => i.status !== 'wish');
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const DATE = new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function say(text) { const l = $('sugLive'); l.textContent = ''; setTimeout(() => { l.textContent = text; }, 30); }
const current = () => suggest(state.data.items, state.data.wears, {
  weather: view.weather, today: today(), seed: seedFor(today(), view.round), count: 3, avoid: view.avoid,
  occasion: view.occasion || undefined, preferRare: prefs.rare, wishlist: !prefs.own,
});

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
  const { suggestions, missing, tagged } = current();
  view.shown = [...new Set(suggestions.flatMap(s => s.ids))];
  view.tagged = tagged;
  const msg = [];
  if (!pieces().length) msg.push('Lege zuerst ein paar Teile an, dann kann ich Outfits vorschlagen.');
  else if (missing.length) msg.push('Es fehlen noch: ' + missing.join(', ') + '.' + (suggestions.length ? ' Die Vorschläge kommen ohne aus.' : ''));
  if (suggestions.length) msg.push((prefs.rare ? 'Gewählt nach Wetter, Farben und danach, was länger nicht dran war.' : 'Gewählt nach Wetter und Farben.') + ' Die Tags („Winter“, „Sommer“, „wasserdicht“, „Büro“ …) vergibst du selbst an deinen Teilen.');
  note.textContent = msg.join(' ');
  note.hidden = !msg.length;
  $('sugMore').disabled = suggestions.length === 0;
  const taken = [];
  list.replaceChildren(...suggestions.map((s, k) => {
    const its = s.ids.map(item).filter(Boolean);
    const title = cardTitle({ pieces: its, reasons: s.reasons }, view.weather, taken, view.occasion); taken.push(title);
    const card = $('sugTpl').content.firstElementChild.cloneNode(true);
    card.classList.toggle('sug--first', k === 0);
    const strip = card.querySelector('.sug-strip');
    for (const it of its) { const tile = el('div', 'sug-tile'), im = new Image(); showThumb(im, it); im.alt = ''; im.className = it.cut ? '' : 'mb'; tile.append(im); strip.append(tile); }
    card.querySelector('.sug-title').textContent = title;
    const wishes = its.filter(i => i.status === 'wish').length;
    card.querySelector('.sug-sub').textContent = cardSub(its.length, view.weather) + (wishes ? ' · ' + plural(wishes, 'Wunschteil', 'Wunschteile') : '');
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
  if (out) renderOut(); else renderPack();
  renderCtl(out);
}

/** Schalter, Wetteranzeige und Auswahl neu zeichnen. */
function renderCtl(out) {
  const wx = view.wx;
  for (const b of document.querySelectorAll('.sug-w button')) b.setAttribute('aria-pressed', String(b.dataset.w === view.weather));
  for (const b of document.querySelectorAll('#occChips button')) b.setAttribute('aria-pressed', String(b.dataset.occ === view.occasion));
  $('wxOn').checked = prefs.wx; $('optRare').checked = prefs.rare; $('optOwn').checked = prefs.own;
  $('occSec').hidden = $('optSec').hidden = !out;
  let line = '';
  if (wx.state === 'loading') line = 'Standort und Wetter werden geholt …';
  else if (wx.state === 'ok' && wx.report) {
    line = 'Jetzt ' + headline(wx.report) + (subline(wx.report) ? ' · ' + subline(wx.report) : '') + '. Das ergibt „' + WEATHER_LABEL[wx.report.weather] + '“.';
    if (view.weather !== wx.report.weather) line += ' Du hast „' + WEATHER_LABEL[view.weather] + '“ gewählt.';
  } else if (wx.state === 'error') line = MESSAGES[wx.reason] || MESSAGES.bad;
  $('wxNow').textContent = line; $('wxNow').hidden = !line;
  $('wxCredit').hidden = wx.state !== 'ok';
  $('wxPriv').hidden = prefs.wx;
  $('wxRetry').hidden = !(wx.state === 'error' && prefs.wx);
  const hint = $('occHint');
  const lack = out && view.occasion && view.tagged === 0 && pieces().length > 0;
  hint.textContent = lack ? 'Kein Teil trägt den Tag „' + view.occasion + '“. Trage ihn beim Bearbeiten eines Teils unter „Tags“ ein, dann bevorzuge ich es für diesen Anlass.' : '';
  hint.hidden = !lack;
  $('sugDetNow').textContent = [WEATHER_LABEL[view.weather] + (wx.state === 'ok' && wx.report ? ', ' + wx.report.temp + ' °C' : ''), out ? view.occasion : ''].filter(Boolean).join(' · ');
}

/** Holt Standort und Wetter und übernimmt die Stufe. Ein neuerer Abruf oder das Ausschalten macht einen laufenden hinfällig. */
let run = 0;
async function loadWeather(force = false) {
  const my = ++run;
  view.wx = { state: 'loading', report: null, reason: '', at: 0 };
  render();
  const r = await getWeather({ force });
  if (my !== run || !prefs.wx) return;
  if (r.ok) {
    view.wx = { state: 'ok', report: r.report, reason: '', at: Date.now() };
    view.weather = r.report.weather; view.round++; view.avoid = [];
    say('Wetter: ' + headline(r.report) + '. Stufe ' + WEATHER_LABEL[view.weather]);
  } else {
    view.wx = { state: 'error', report: null, reason: r.reason, at: 0 };
    // Ohne Erlaubnis oder ohne Standortdienst hat Wiederholen keinen Sinn: der Schalter geht wieder aus
    if (r.reason === 'denied' || r.reason === 'unsupported') { prefs.wx = false; savePrefs(); }
    say(MESSAGES[r.reason]);
  }
  render();
}

$('wxOn').onchange = () => {
  prefs.wx = $('wxOn').checked; savePrefs();
  if (prefs.wx) loadWeather();
  else { run++; view.wx = { state: 'off', report: null, reason: '', at: 0 }; render(); say('Wetter von Hand'); }
};
$('wxRetry').onclick = () => loadWeather(true);
$('optRare').onchange = () => { prefs.rare = $('optRare').checked; savePrefs(); view.avoid = []; render(); say(prefs.rare ? 'Selten Getragenes wird bevorzugt' : 'Alle Teile gleich behandelt'); };
$('optOwn').onchange = () => { prefs.own = $('optOwn').checked; savePrefs(); view.avoid = []; render(); say(prefs.own ? 'Nur Teile, die du besitzt' : 'Wunschlisten-Teile sind dabei'); };
for (const b of document.querySelectorAll('#occChips button')) b.onclick = () => {
  const o = b.dataset.occ;
  if ((o !== '' && !OCCASIONS.includes(o)) || o === view.occasion) return;
  view.occasion = o; view.round++; view.avoid = []; render(); say(o ? 'Anlass: ' + o : 'Kein bestimmter Anlass');
};

// Am Handy sitzen die Einstellungen aufklappbar über den Karten, am PC im Seitenfeld. Es ist derselbe Block, er wird nur verschoben.
const narrow = matchMedia('(max-width: 1000px)');
function place() {
  const ctl = $('sugCtl'), to = narrow.matches ? $('sugDetBody') : $('sugSide');
  if (ctl.parentElement !== to) to.append(ctl);
}
place();
narrow.addEventListener('change', place);

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
// Beim Öffnen holt der Bereich das Wetter, wenn der Schalter an ist und noch nichts oder nur etwas Altes da ist.
// Das gilt auch, wenn die Seite gleich auf „Vorschläge“ startet (dann kommt nur das Zeichen „neu zeichnen“).
function show() {
  const stale = view.wx.state === 'ok' && Date.now() - view.wx.at > CACHE_MS;
  if (currentView() === 'vorschlaege' && prefs.wx && (view.wx.state === 'idle' || stale)) { loadWeather(); return; }
  render();
}
document.addEventListener('anprobe:view', show);
document.addEventListener('anprobe:render', show);
