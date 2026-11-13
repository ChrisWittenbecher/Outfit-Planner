// @ts-nocheck
import * as Geo from './geometry.js';
import * as Scraper from './scraper.js';
import { $, CATS, state } from './core.js';
import { cleanPieces, fixOrder } from './board.js';
import { renderAll } from './render.js';
import { confirmBox, toast } from './ui.js';
import { step, undo } from './history.js';
import { markBackup } from './pwa.js';

$('exp').onclick = () => {
  state.data.board = state.board;
  const url = URL.createObjectURL(new Blob([JSON.stringify(state.data)], {type:'application/json'}));
  const a = document.createElement('a'); a.href = url; a.download = 'outfit-planner-backup-' + new Date().toISOString().slice(0, 10) + '.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);   // Speicher wieder freigeben
  markBackup();
};
$('imp').onclick = () => $('impf').click();
$('impf').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if(!f) return;
  const bad = msg => toast(msg, {kind:'error'});
  if(f.size > Scraper.BACKUP_LIMITS.bytes) return bad('Die Datei ist zu groß für ein Backup.');   // vor dem Lesen prüfen, nichts wird in den Speicher geladen
  let r;
  try{ r = Scraper.parseBackup(await f.text(), CATS); }catch(err){ return bad('Diese Datei ist kein gültiges Outfit-Planner-Backup.'); }
  if(!r.ok) return bad(r.error);
  if(!await confirmBox({title:'Backup einlesen', text:'Die aktuellen Daten werden durch das Backup ersetzt. Mit „Rückgängig“ holst du sie zurück.', ok:'Ersetzen', danger:true})) return;
  step(); state.data = {items:r.items, outfits:r.outfits, wears:r.wears, plans:r.plans}; state.board = fixOrder(cleanPieces(r.board)); state.sel = null; state.fitted = false; renderAll();
  toast(r.skipped ? 'Backup eingelesen. ' + r.skipped + ' Teil(e) wurden übersprungen (ungültig, doppelt oder mit externem Bild).' : 'Backup eingelesen', {ms:r.skipped ? 10000 : 6000, action:{label:'Rückgängig', fn:undo}});
};
