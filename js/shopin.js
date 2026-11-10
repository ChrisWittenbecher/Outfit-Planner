// @ts-nocheck
import { $ } from './core.js';
import { closeDialog, showDialog } from './sheet.js';
import { copyText } from './clip.js';

const dlg = $('shopHelp');
let script = '';
function say(text) { const l = $('shopHelpLive'); l.textContent = ''; setTimeout(() => { l.textContent = text; }, 30); }

$('shopHelpBtn').onclick = async () => {
  showDialog(dlg);
  // Vorab laden: Kopieren muss direkt auf den Tipp folgen, sonst verweigert Safari die Zwischenablage.
  if (!script) { try { const r = await fetch('kurzbefehl/anprobe-seite-auslesen.js'); if (r.ok) script = (await r.text()).slice(0, 20000); } catch (e) {} }
};
$('shopScript').onclick = async () => {
  if (!script) return say('Das Skript konnte nicht geladen werden. Bitte später noch einmal versuchen.');
  say(await copyText(script) ? 'Skript kopiert' : 'Kopieren hat nicht geklappt');
};
$('shopHelpClose').onclick = () => closeDialog(dlg);
