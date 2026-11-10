// @ts-nocheck
/** Kopiert Text in die Zwischenablage. Ohne Berechtigung greift der alte Weg über ein markiertes Feld. */
export async function copyText(text){
  try{ await navigator.clipboard.writeText(text); return true; }catch(e){ /* fällt unten zurück */ }
  const t = document.createElement('textarea');
  t.value = text; t.readOnly = true; t.setAttribute('aria-hidden', 'true');
  t.className = 'sr-only';
  document.body.append(t); t.select();
  let ok = false; try{ ok = document.execCommand('copy'); }catch(e){}
  t.remove();
  return ok;
}
