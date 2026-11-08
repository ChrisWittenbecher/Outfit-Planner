// @ts-nocheck
import { $, CATS, announce, hostOf, money, state } from './core.js';
import { priceChange } from './prices.js';
import { renderAll } from './render.js';
import { openDlg } from './dialog.js';
import { toggle } from './board.js';
import { flush } from './storage.js';
import { toast } from './ui.js';
import { closeDialog, showDialog } from './sheet.js';
import { step, undo } from './history.js';
import { costPerWear, dayKey, wearStats, withoutItem } from './wear.js';
import { allTags, hasTag, matchItem } from './search.js';

const STATUS = [['Alle', 'Alle'], ['own', 'Besitze ich'], ['wish', 'Wunschliste']];
export function renderChips(){
  const chip = (label, on, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.setAttribute('aria-pressed', String(on)); b.onclick = fn; return b; };
  $('statusChips').replaceChildren(...STATUS.map(([key, label]) => chip(label, key === state.statusFilter, () => { state.statusFilter = key; renderAll(); })));
  $('chips').replaceChildren(...['Alle',...CATS].map(c => chip(c, c === state.filter, () => { state.filter = c; renderAll(); })));
  const tags = allTags(state.data.items);
  if(state.tag && !tags.some(t => t.tag.toLowerCase() === state.tag.toLowerCase())) state.tag = '';
  $('tagChips').hidden = !tags.length;
  $('tagChips').replaceChildren(...tags.slice(0, 20).map(t => chip('#' + t.tag, state.tag !== '' && t.tag.toLowerCase() === state.tag.toLowerCase(), () => { state.tag = state.tag !== '' && t.tag.toLowerCase() === state.tag.toLowerCase() ? '' : t.tag; renderAll(); })));
}
let qt = 0;
$('q').oninput = () => {
  state.query = $('q').value.trim(); renderGrid();
  clearTimeout(qt); qt = setTimeout(() => announce(searching() ? shown + ' Treffer' : 'Alle Teile'), 600);
};
$('q').onkeydown = e => { if(e.key === 'Escape' && $('q').value){ e.preventDefault(); e.stopPropagation(); $('q').value = ''; $('q').oninput(); } };
const searching = () => state.query !== '' || state.tag !== '';
let shown = 0;
const isWish = i => i.status === 'wish';
export function renderGrid(){
  const list = state.data.items.filter(i => (state.filter === 'Alle' || i.cat === state.filter) && (state.statusFilter === 'Alle' || (state.statusFilter === 'wish') === isWish(i)) && matchItem(i, state.query, hostOf(i.link)) && (!state.tag || hasTag(i, state.tag)));
  shown = list.length;
  const wishes = state.data.items.filter(isWish).length;
  const worn = wearStats(state.data.wears, dayKey(new Date()));
  $('count').textContent = searching() ? list.length + ' von ' + state.data.items.length + ' Teilen' : state.data.items.length + ' Teile' + (wishes ? ' · ' + wishes + ' auf der Wunschliste' : '');
  if(!list.length){ const e = document.createElement('div'); e.className = 'empty'; e.textContent = state.data.items.length ? (state.query ? 'Nichts gefunden für „' + state.query + '“.' : 'Nichts in dieser Auswahl.') : 'Noch leer. Füge deinen ersten Screenshot hinzu.'; $('grid').replaceChildren(e); return; }
  $('grid').replaceChildren(...list.map(i => {
    const d = document.createElement('div'); d.className = 'card' + (state.board.some(p => p.id === i.id) ? ' used' : '') + (i.id === state.fresh ? ' enter' : '');
    d.innerHTML = '<img alt=""><div class="n"><span></span><small></small></div><div class="x"></div>';
    const im = d.querySelector('img'); im.src = i.img; im.loading = 'lazy'; im.decoding = 'async'; if(!i.cut) im.classList.add('mb');
    d.querySelector('span').textContent = i.name;
    const sm = d.querySelector('small'); sm.textContent = i.cat + (i.color ? ' · ' + i.color : '') + (i.price != null ? ' · ' + money(i.price, i.cur) : '');
    const w = !isWish(i) && worn.get(i.id);
    if(w){ const cw = costPerWear(i.price, w.count), ws = document.createElement('small'); ws.textContent = w.count + '× getragen'; d.querySelector('.n small').after(ws); if(cw != null){ const wc = document.createElement('small'); wc.textContent = money(cw, i.cur) + ' pro Tragen'; ws.after(wc); } }
    if(Array.isArray(i.tags) && i.tags.length){ const tg = document.createElement('small'); tg.className = 'tg'; tg.textContent = i.tags.map(t => '#' + t).join(' '); d.querySelector('.n').append(tg); }
    const ch = priceChange(i.priceHistory || []);
    if(ch){ const pc = document.createElement('span'); pc.className = 'pc pc--' + ch.dir; pc.textContent = (ch.dir === 'down' ? '↓ ' : '↑ ') + ch.pct + ' %'; pc.title = 'Preis zuletzt von ' + money(ch.prev, i.cur) + ' auf ' + money(ch.now, i.cur) + (ch.dir === 'down' ? ' gesunken' : ' gestiegen'); sm.append(' ', pc); }
    if(isWish(i)){ d.classList.add('wish'); const bd = document.createElement('span'); bd.className = 'badge'; bd.textContent = 'Wunsch'; d.append(bd); }
    if(/^https?:/.test(i.link || '')){ const a = document.createElement('a'); a.className = 'h'; a.href = i.link; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = (hostOf(i.link) || 'Angebot') + ' ↗'; a.title = i.link; a.onclick = e => e.stopPropagation(); a.onkeydown = e => e.stopPropagation(); d.querySelector('.n').append(a); }
    const x = d.querySelector('.x'), acts = document.createElement('span'); acts.className = 'acts';
    const act = (txt, label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = txt; b.title = label; b.setAttribute('aria-label', label); b.onclick = e => { e.stopPropagation(); fn(); }; return b; };
    if(isWish(i)) acts.append(act('✓', 'Als gekauft markieren', () => markBought(i)));
    if(/^https?:/.test(i.link || '')) acts.append(act('↗', 'Zum Angebot', () => openOffer(i)));
    acts.append(act('✎', 'Bearbeiten', () => openDlg(i)), act('✕', 'Löschen', () => deleteItem(i)));
    const more = act('⋯', 'Mehr Aktionen für ' + i.name, () => openMenu(i)); more.className = 'more'; more.setAttribute('aria-haspopup', 'dialog');
    x.append(acts, more);
    d.tabIndex = 0; d.setAttribute('role', 'button'); d.setAttribute('aria-pressed', state.board.some(p => p.id === i.id));
    d.onclick = () => toggle(i);
    d.onkeydown = e => { if(e.target === d && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); toggle(i); } };
    return d;
  }));
}
function markBought(i){ i.status = 'own'; renderAll(); flush(); announce('„' + i.name + '“ ist jetzt in deinem Besitz.'); }
function openOffer(i){ if(/^https?:/.test(i.link || '')) open(i.link, '_blank', 'noopener'); }
function deleteItem(i){
  step();
  state.data.items = state.data.items.filter(k => k.id !== i.id);
  state.board = state.board.filter(p => p.id !== i.id);
  if(state.sel === i.id) state.sel = null;
  state.data.outfits.forEach(o => { o.pieces = o.pieces.filter(p => p.id !== i.id); });
  state.data.wears = withoutItem(state.data.wears, i.id);
  renderAll(); flush();
  toast('„' + i.name + '“ gelöscht', {action:{label:'Rückgängig', fn:undo}});
}
let menuItem = null;
function openMenu(i){
  menuItem = i; $('menuTitle').textContent = i.name;
  $('menuBought').hidden = !isWish(i);
  $('menuOffer').hidden = !/^https?:/.test(i.link || '');
  showDialog($('menuDlg'));
}
$('menuEdit').onclick = () => { const i = menuItem; closeDialog($('menuDlg')); if(i) openDlg(i); };
$('menuBought').onclick = () => { const i = menuItem; closeDialog($('menuDlg')); if(i) markBought(i); };
$('menuOffer').onclick = () => { const i = menuItem; closeDialog($('menuDlg')); if(i) openOffer(i); };
$('menuDelete').onclick = () => { const i = menuItem; closeDialog($('menuDlg')); if(i) deleteItem(i); };
$('menuClose').onclick = () => closeDialog($('menuDlg'));
