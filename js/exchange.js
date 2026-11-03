// @ts-nocheck
/**
 * Anprobe – Austausch: PNG-Export, Backup und Wiederherstellen.
 */
import * as Geo from './geometry.js';
import * as Scraper from './scraper.js';
import { $, CATS, imgOf, item, loadImg, state } from './core.js';
import { cleanPieces, fixOrder } from './board.js';
import { renderAll } from './render.js';

$('png').onclick = async () => {
  if(!state.board.length) return;
  const c = document.createElement('canvas'); c.width = 800; c.height = 1200; const x = c.getContext('2d');
  x.fillStyle = '#f3f4f7'; x.fillRect(0, 0, 800, 1200);
  for(const p of state.board){
    const im = await loadImg(imgOf(p.id)), w = p.w * 2, h = w * im.height / im.width;
    x.save(); x.globalCompositeOperation = item(p.id)?.cut ? 'source-over' : 'multiply';
    x.translate(p.x * 2 + w / 2, p.y * 2 + h / 2); x.rotate((p.r || 0) * Math.PI / 180); // Drehung um die Mitte
    x.drawImage(im, -w / 2, -h / 2, w, h); x.restore();
  }
  const a = document.createElement('a'); a.download = 'outfit.png'; a.href = c.toDataURL('image/png'); a.click();
};
$('exp').onclick = () => { state.data.board = state.board; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(state.data)], {type:'application/json'})); a.download = 'anprobe-backup-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); };
$('imp').onclick = () => $('impf').click();
$('impf').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if(!f) return;
  try{ const j = JSON.parse(await f.text()); if(!Array.isArray(j.items)) throw 0; if(!confirm('Aktuelle Daten durch das Backup ersetzen?')) return;
    state.data = {items:j.items.map(i => Scraper.sanitizeItem(i, CATS)).filter(Boolean), outfits:(Array.isArray(j.outfits) ? j.outfits : []).filter(o => o && typeof o.name === 'string')}; state.board = fixOrder(cleanPieces(j.board)); state.data.outfits.forEach(o => { o.pieces = fixOrder(Geo.sanitizePieces(o.pieces)); }); state.sel = null; renderAll();
  }catch(err){ alert('Diese Datei ist kein gültiges Anprobe-Backup.'); }
};