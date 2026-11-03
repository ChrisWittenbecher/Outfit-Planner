// @ts-nocheck
/**
 * Anprobe – Kleiderschrank: Kategorie-Filter und Karten.
 */
import { $, CATS, hostOf, money, state } from './core.js';
import { renderAll } from './render.js';
import { openDlg } from './dialog.js';
import { toggle } from './board.js';

/* ---------- Kleiderschrank ---------- */
export function renderChips(){
  $('chips').replaceChildren(...['Alle',...CATS].map(c => { const b = document.createElement('button'); b.type = 'button'; b.textContent = c; b.setAttribute('aria-pressed', String(c === state.filter)); b.onclick = () => { state.filter = c; renderAll(); }; return b; }));
}
export function renderGrid(){
  const list = state.data.items.filter(i => state.filter === 'Alle' || i.cat === state.filter);
  $('count').textContent = state.data.items.length + ' Teile';
  if(!list.length){ $('grid').innerHTML = '<div class="empty">' + (state.data.items.length ? 'Nichts in dieser Kategorie.' : 'Noch leer. Füge deinen ersten Screenshot oder Link hinzu.') + '</div>'; return; }
  $('grid').replaceChildren(...list.map(i => {
    const d = document.createElement('div'); d.className = 'card' + (state.board.some(p => p.id === i.id) ? ' used' : '');
    d.innerHTML = '<img alt=""><div class="n"><span></span><small></small></div><div class="x"></div>';
    const im = d.querySelector('img'); im.src = i.img; if(!i.cut) im.classList.add('mb');
    d.querySelector('span').textContent = i.name;
    d.querySelector('small').textContent = i.cat + (i.price != null ? ' · ' + money(i.price, i.cur) : '');
    if(/^https?:/.test(i.link || '')){ const a = document.createElement('a'); a.className = 'h'; a.href = i.link; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = (hostOf(i.link) || 'Angebot') + ' ↗'; a.title = i.link; a.onclick = e => e.stopPropagation(); a.onkeydown = e => e.stopPropagation(); d.querySelector('.n').append(a); }
    const x = d.querySelector('.x');
    if(i.link){ const a = document.createElement('button'); a.textContent = '↗'; a.title = 'Zum Angebot'; a.setAttribute('aria-label', 'Zum Angebot'); a.onclick = e => { e.stopPropagation(); open(i.link, '_blank', 'noopener'); }; x.append(a); }
    const ed = document.createElement('button'); ed.textContent = '✎'; ed.title = 'Bearbeiten'; ed.setAttribute('aria-label', 'Bearbeiten'); ed.onclick = e => { e.stopPropagation(); openDlg(i); }; x.append(ed);
    const del = document.createElement('button'); del.textContent = '✕'; del.title = 'Löschen'; del.setAttribute('aria-label', 'Löschen');
    del.onclick = e => { e.stopPropagation(); if(confirm('„' + i.name + '“ löschen?')){ state.data.items = state.data.items.filter(k => k.id !== i.id); state.board = state.board.filter(p => p.id !== i.id); if(state.sel === i.id) state.sel = null; state.data.outfits.forEach(o => o.pieces = o.pieces.filter(p => p.id !== i.id)); renderAll(); } };
    x.append(del);
    d.tabIndex = 0; d.setAttribute('role', 'button'); d.setAttribute('aria-pressed', state.board.some(p => p.id === i.id));
    d.onclick = () => toggle(i);
    d.onkeydown = e => { if(e.target === d && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); toggle(i); } };
    return d;
  }));
}