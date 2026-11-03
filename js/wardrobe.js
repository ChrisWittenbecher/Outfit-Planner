// @ts-nocheck
/**
 * Anprobe – Kleiderschrank: Kategorie-Filter und Karten.
 */
import { $, CATS, announce, hostOf, money, state } from './core.js';
import { priceChange } from './prices.js';
import { renderAll } from './render.js';
import { openDlg } from './dialog.js';
import { toggle } from './board.js';
import { flush } from './storage.js';

/* ---------- Kleiderschrank ---------- */
const STATUS = [['Alle', 'Alle'], ['own', 'Besitze ich'], ['wish', 'Wunschliste']];
export function renderChips(){
  const chip = (label, on, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.setAttribute('aria-pressed', String(on)); b.onclick = fn; return b; };
  $('statusChips').replaceChildren(...STATUS.map(([key, label]) => chip(label, key === state.statusFilter, () => { state.statusFilter = key; renderAll(); })));
  $('chips').replaceChildren(...['Alle',...CATS].map(c => chip(c, c === state.filter, () => { state.filter = c; renderAll(); })));
}
const isWish = i => i.status === 'wish';
export function renderGrid(){
  const list = state.data.items.filter(i => (state.filter === 'Alle' || i.cat === state.filter) && (state.statusFilter === 'Alle' || (state.statusFilter === 'wish') === isWish(i)));
  const wishes = state.data.items.filter(isWish).length;
  $('count').textContent = state.data.items.length + ' Teile' + (wishes ? ' · ' + wishes + ' auf der Wunschliste' : '');
  if(!list.length){ $('grid').innerHTML = '<div class="empty">' + (state.data.items.length ? 'Nichts in dieser Auswahl.' : 'Noch leer. Füge deinen ersten Screenshot hinzu.') + '</div>'; return; }
  $('grid').replaceChildren(...list.map(i => {
    const d = document.createElement('div'); d.className = 'card' + (state.board.some(p => p.id === i.id) ? ' used' : '');
    d.innerHTML = '<img alt=""><div class="n"><span></span><small></small></div><div class="x"></div>';
    const im = d.querySelector('img'); im.src = i.img; if(!i.cut) im.classList.add('mb');
    d.querySelector('span').textContent = i.name;
    const sm = d.querySelector('small'); sm.textContent = i.cat + (i.price != null ? ' · ' + money(i.price, i.cur) : '');
    const ch = priceChange(i.priceHistory || []);
    if(ch){ const pc = document.createElement('span'); pc.className = 'pc pc--' + ch.dir; pc.textContent = (ch.dir === 'down' ? '↓ ' : '↑ ') + ch.pct + ' %'; pc.title = 'Preis zuletzt von ' + money(ch.prev, i.cur) + ' auf ' + money(ch.now, i.cur) + (ch.dir === 'down' ? ' gesunken' : ' gestiegen'); sm.append(' ', pc); }
    if(isWish(i)){ d.classList.add('wish'); const bd = document.createElement('span'); bd.className = 'badge'; bd.textContent = 'Wunsch'; d.append(bd); }
    if(/^https?:/.test(i.link || '')){ const a = document.createElement('a'); a.className = 'h'; a.href = i.link; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = (hostOf(i.link) || 'Angebot') + ' ↗'; a.title = i.link; a.onclick = e => e.stopPropagation(); a.onkeydown = e => e.stopPropagation(); d.querySelector('.n').append(a); }
    // Desktop: runde Schnellaktionen beim Darüberfahren. Touch/Smartphone: ein Drei-Punkte-Menü (siehe CSS).
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
/* ---------- Aktionen pro Teil ---------- */
function markBought(i){ i.status = 'own'; renderAll(); flush(); announce('„' + i.name + '“ ist jetzt in deinem Besitz.'); }
function openOffer(i){ if(/^https?:/.test(i.link || '')) open(i.link, '_blank', 'noopener'); }
function deleteItem(i){
  if(!confirm('„' + i.name + '“ löschen?')) return;
  state.data.items = state.data.items.filter(k => k.id !== i.id);
  state.board = state.board.filter(p => p.id !== i.id);
  if(state.sel === i.id) state.sel = null;
  state.data.outfits.forEach(o => { o.pieces = o.pieces.filter(p => p.id !== i.id); });
  renderAll(); flush();
}
/** Aktionsmenü (Bottom-Sheet am Smartphone): Bearbeiten, Angebot öffnen, Löschen. */
let menuItem = null;
function openMenu(i){
  menuItem = i; $('menuTitle').textContent = i.name;
  $('menuBought').hidden = !isWish(i);
  $('menuOffer').hidden = !/^https?:/.test(i.link || '');
  $('menuDlg').showModal();
}
$('menuEdit').onclick = () => { const i = menuItem; $('menuDlg').close(); if(i) openDlg(i); };
$('menuBought').onclick = () => { const i = menuItem; $('menuDlg').close(); if(i) markBought(i); };
$('menuOffer').onclick = () => { const i = menuItem; $('menuDlg').close(); if(i) openOffer(i); };
$('menuDelete').onclick = () => { const i = menuItem; $('menuDlg').close(); if(i) deleteItem(i); };
$('menuClose').onclick = () => $('menuDlg').close();
