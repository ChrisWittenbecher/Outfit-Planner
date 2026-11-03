// @ts-nocheck
/**
 * Anprobe – Preise und Ebenenliste, gespeicherte Outfits.
 */
import { $, hostOf, imgOf, item, mb, money, state } from './core.js';
import { cleanPieces, fixOrder, moveLayer, renderBoard } from './board.js';
import { flush } from './storage.js';
import { renderAll } from './render.js';

function totals(pieces){
  const by = {}; let miss = 0;
  pieces.forEach(p => { const it = item(p.id); if(!it) return; if(it.price == null) miss++; else { const c = it.cur || 'EUR'; by[c] = (by[c] || 0) + it.price; } });
  return {txt:Object.entries(by).map(([c, v]) => money(v, c)).join(' + '), miss};
}
export function renderSum(){
  const box = $('sum'); box.replaceChildren(); if(!state.board.length) return;
  const h = document.createElement('div'); h.className = 'm m--head'; h.textContent = 'Ebenen (oben liegt vorn) · Preis · Angebot'; box.append(h);
  for(let k = state.board.length - 1; k >= 0; k--){
    const p = state.board[k], it = item(p.id); if(!it) continue;
    const r = document.createElement('div'); r.className = 'r' + (p.id === state.sel ? ' on' : '');
    const lay = document.createElement('span'); lay.className = 'lay';
    [['▲', 'Eine Ebene nach vorn', k + 1, k < state.board.length - 1], ['▼', 'Eine Ebene nach hinten', k - 1, k > 0]].forEach(([t, ti, to, en]) => { const bt = document.createElement('button'); bt.textContent = t; bt.title = ti; bt.setAttribute('aria-label', ti + ': ' + it.name); bt.disabled = !en; bt.onclick = () => moveLayer(p.id, to); lay.append(bt); });
    const n = document.createElement('button'); n.type = 'button'; n.className = 'nm'; n.textContent = it.name; n.title = it.name + ' auswählen'; n.setAttribute('aria-pressed', String(p.id === state.sel)); n.onclick = () => { state.sel = p.id; renderBoard(); };
    const pr = document.createElement('span'); pr.textContent = it.price != null ? money(it.price, it.cur) : '–';
    r.append(lay, n, pr);
    if(/^https?:/.test(it.link || '')){ const a = document.createElement('a'); a.href = it.link; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = (hostOf(it.link) || 'Angebot') + ' ↗'; a.title = 'Zum Angebot: ' + it.link; r.append(a); }
    box.append(r);
  }
  const t = totals(state.board), d = document.createElement('div'); d.className = 't';
  d.innerHTML = '<span>Gesamt</span><span></span>'; d.lastChild.textContent = t.txt || '–'; box.append(d);
  if(t.miss){ const m = document.createElement('div'); m.className = 'm'; m.textContent = 'Bei ' + t.miss + (t.miss === 1 ? ' Teil fehlt' : ' Teilen fehlt') + ' der Preis.'; box.append(m); }
}
$('save').onclick = () => {
  if(!state.board.length) return;
  const name = prompt('Name des Outfits:', 'Outfit ' + (state.data.outfits.length + 1)); if(name === null) return;
  state.data.outfits.unshift({id:'o'+Date.now(), name:name.trim() || 'Outfit', pieces:JSON.parse(JSON.stringify(state.board))});
  renderOuts(); flush(); // bewusste Aktion: sofort sichern, nicht erst nach dem Timer
};

/* ---------- Gespeicherte Outfits ---------- */
export function renderOuts(){
  if(!state.data.outfits.length){ $('outs').innerHTML = '<div class="empty empty--tight">Noch keine Outfits gespeichert.</div>'; return; }
  $('outs').replaceChildren(...state.data.outfits.map(o => {
    const d = document.createElement('div'); d.className = 'out';
    d.innerHTML = '<div class="mini"><div></div></div><div><b></b><small></small><div class="b"><button>Laden</button><button>Löschen</button></div></div>';
    d.querySelector('b').textContent = o.name; d.querySelector('small').textContent = totals(o.pieces).txt;
    o.pieces.forEach((p, idx) => { const s = imgOf(p.id); if(!s) return; const im = new Image(); im.src = s; im.className = mb(item(p.id)).trim(); Object.assign(im.style, {left:p.x+'px', top:p.y+'px', width:p.w+'px', zIndex:idx + 1, transform:`rotate(${p.r || 0}deg)`}); d.querySelector('.mini>div').append(im); });
    const [ld, rm] = d.querySelectorAll('button');
    ld.onclick = () => { state.board = fixOrder(cleanPieces(JSON.parse(JSON.stringify(o.pieces)))); state.sel = null; renderAll(); };
    rm.onclick = () => { if(confirm('Outfit „' + o.name + '“ löschen?')){ state.data.outfits = state.data.outfits.filter(k => k !== o); renderOuts(); flush(); } };
    return d;
  }));
}