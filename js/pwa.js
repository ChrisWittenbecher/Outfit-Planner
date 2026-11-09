// @ts-nocheck
import { $, state } from './core.js';
import { getMeta, setMeta } from './storage.js';
import { toast } from './ui.js';
import { backupState, wantsInstallHint } from './care.js';

if ('serviceWorker' in navigator) addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });

const count = () => state.data.items.length;

async function showStatus(){
  const meta = await getMeta(), now = Date.now();
  if (count() && !meta.since && !meta.lastBackup){ meta.since = now; setMeta({since:now}); }
  const s = backupState(meta, count(), now);
  $('bk').textContent = s.text;
  $('bkSep').hidden = !s.text;
  return {meta, s};
}

export async function markBackup(){
  await setMeta({lastBackup:Date.now(), nagged:0});
  showStatus();
}

export async function startCare(){
  const {meta, s} = await showStatus();
  if (s.due){
    setMeta({nagged:Date.now()});
    toast(s.text + '. Sichere deine Daten jetzt in einer Datei.', {ms:15000, action:{label:'Backup speichern', fn:() => $('exp').click()}});
    return;
  }
  const env = {ua:navigator.userAgent, platform:navigator.platform, touchPoints:navigator.maxTouchPoints || 0, standalone:navigator.standalone === true || matchMedia('(display-mode: standalone)').matches};
  if (wantsInstallHint(env, meta, count())){
    setMeta({hintDone:true});
    toast('Tipp: Tippe auf Teilen und „Zum Home-Bildschirm“. Dann öffnet sich Anprobe wie eine App, und Safari räumt deine Daten nicht mehr nach Tagen ab.', {ms:20000});
  }
}
