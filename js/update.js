// @ts-nocheck
import { $ } from './core.js';
import { VERSION, isVersion, refreshTargets } from './version.js';
import { toast } from './ui.js';

const CHECK_GAP = 60000;   // höchstens einmal pro Minute prüfen
let last = 0, offered = '';

export async function newerVersion(){
  try{
    const r = await fetch('version.json?t=' + Date.now(), {cache:'no-store'});
    if(!r.ok) return null;
    const text = await r.text();
    if(text.length > 1000) return null;   // eine echte version.json ist winzig
    const j = JSON.parse(text);
    return j && isVersion(j.version) && j.version !== VERSION ? j.version : null;   // nur das Format „1.2.0“ wird akzeptiert
  }catch(e){ return null; }
}

export async function refresh(){
  toast('Aktualisiere …', {ms:10000});
  try{
    const res = await fetch(location.pathname, {cache:'reload'});
    const text = (await res.text()).slice(0, 200000);
    const hrefs = [...text.matchAll(/<(?:link|script)\b[^>]*?\s(?:href|src)="([^"]+)"/gi)].map(m => m[1]);
    const urls = refreshTargets(hrefs, location.href);   // nur eigene Dateien der App
    await Promise.all(urls.map(u => fetch(u, {cache:'reload', credentials:'omit'}).catch(() => {})));
  }catch(e){ /* dann eben nur neu laden */ }
  location.reload();
}

export async function checkForUpdate(manual = false){
  if(!manual && Date.now() - last < CHECK_GAP) return;
  last = Date.now();
  const v = await newerVersion();
  if(v){ if(manual || v !== offered){ offered = v; toast('Neue Version ' + v + ' verfügbar', {ms:20000, action:{label:'Aktualisieren', fn:refresh}}); } }
  else if(manual) toast('Du nutzt die neueste Version (' + VERSION + ').');
}

$('ver').textContent = VERSION;
$('updBtn').onclick = () => checkForUpdate(true);
setTimeout(checkForUpdate, 3000);
document.addEventListener('visibilitychange', () => { if(!document.hidden) checkForUpdate(); });
addEventListener('pageshow', e => { if(e.persisted) checkForUpdate(); });
