// @ts-nocheck
import { $, hostOf, item, mb, money, showThumb, state } from './core.js';
import { cleanPieces, fixOrder, moveLayer, renderBoard } from './board.js';
import { sumPrices } from './prices.js';
import { haptic } from './haptics.js';
import { flush } from './storage.js';
import { renderAll } from './render.js';
import { askText, toast } from './ui.js';
import { step, undo } from './history.js';
import { dayKey, withoutOutfit } from './wear.js';
import { WEAR_ERR, logWear } from './wearlog.js';
import { shareSaved } from './share.js';

const moneyBy = by => Object.entries(by).map(([c, v]) => money(v, c)).join(' + ');
function totals(pieces){
  const its = pieces.map(p => item(p.id)).filter(Boolean), wish = its.filter(i => i.status === 'wish');
  const all = sumPrices(its), buy = sumPrices(wish);
  return {txt:moneyBy(all.by), miss:all.missing, buyCount:wish.length, buy:moneyBy(buy.by), buyMiss:buy.missing};
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
    r.append(lay, n);
    if(it.status === 'wish'){ const tg = document.createElement('span'); tg.className = 'tag'; tg.textContent = 'Wunsch'; r.append(tg); }
    r.append(pr);
    if(/^https?:/.test(it.link || '')){ const a = document.createElement('a'); a.href = it.link; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = (hostOf(it.link) || 'Angebot') + ' ↗'; a.title = 'Zum Angebot: ' + it.link; r.append(a); }
    box.append(r);
  }
  const t = totals(state.board), d = document.createElement('div'); d.className = 't';
  d.innerHTML = '<span>Gesamt</span><span></span>'; d.lastChild.textContent = t.txt || '–'; box.append(d);
  if(t.buyCount){
    const b = document.createElement('div'); b.className = 't t--buy'; b.innerHTML = '<span>Noch zu kaufen</span><span></span>'; b.lastChild.textContent = t.buy || '–'; box.append(b);
    const m = document.createElement('div'); m.className = 'm'; m.textContent = t.buyCount + (t.buyCount === 1 ? ' Teil' : ' Teile') + ' von der Wunschliste' + (t.buyMiss ? ', bei ' + t.buyMiss + ' ohne Preis.' : '.'); box.append(m);
  }
  if(t.miss){ const m = document.createElement('div'); m.className = 'm'; m.textContent = 'Bei ' + t.miss + (t.miss === 1 ? ' Teil fehlt' : ' Teilen fehlt') + ' der Preis.'; box.append(m); }
}
$('save').onclick = async () => {
  if(!state.board.length) return;
  const name = await askText({title:'Outfit speichern', label:'Name des Outfits', value:'Outfit ' + (state.data.outfits.length + 1), ok:'Speichern'}); if(name === null) return;
  state.data.outfits.unshift({id:'o'+Date.now(), name:name || 'Outfit', pieces:JSON.parse(JSON.stringify(state.board))});
  renderOuts(); flush(); haptic('success');
};

export function renderOuts(){
  if(!state.data.outfits.length){ $('outs').innerHTML = '<div class="empty empty--tight">Noch keine Outfits gespeichert.</div>'; return; }
  $('outs').replaceChildren(...state.data.outfits.map(o => {
    const d = document.createElement('div'); d.className = 'out';
    d.innerHTML = '<div class="mini"><div></div></div><div><b></b><small></small><div class="b"><button>Laden</button><button>Heute getragen</button><button>Teilen</button><button>Löschen</button></div></div>';
    d.querySelector('b').textContent = o.name; { const t = totals(o.pieces); d.querySelector('small').textContent = t.txt + (t.buyCount ? ' · noch zu kaufen: ' + (t.buy || '–') : ''); }
    o.pieces.forEach((p, idx) => { const it = item(p.id); if(!it) return; const im = new Image(); showThumb(im, it); im.className = mb(item(p.id)).trim(); Object.assign(im.style, {left:p.x+'px', top:p.y+'px', width:p.w+'px', zIndex:idx + 1, transform:`rotate(${p.r || 0}deg)`}); d.querySelector('.mini>div').append(im); });
    const [ld, wr, sh, rm] = d.querySelectorAll('button');
    sh.setAttribute('aria-label', 'Teilen: ' + o.name); sh.title = 'Als Bild teilen oder speichern';
    sh.onclick = () => shareSaved(sh, o);
    ld.onclick = () => { step(); state.board = fixOrder(cleanPieces(JSON.parse(JSON.stringify(o.pieces)))); state.sel = null; state.fitted = false; renderAll(); };
    wr.onclick = () => {
      const r = logWear(dayKey(new Date()), o);
      if(r !== 'ok') return toast(WEAR_ERR[r], {kind:'error'});
      renderAll(); toast('„' + o.name + '“ für heute eingetragen', {haptic:'success', action:{label:'Rückgängig', fn:undo}});
    };
    rm.onclick = () => { step(); state.data.outfits = state.data.outfits.filter(k => k !== o); state.data.plans = withoutOutfit(state.data.plans, o.id); renderOuts(); flush(); toast('Outfit „' + o.name + '“ gelöscht', {haptic:'warn', action:{label:'Rückgängig', fn:undo}}); };
    return d;
  }));
}