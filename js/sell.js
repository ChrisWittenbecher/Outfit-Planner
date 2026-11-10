// @ts-nocheck
import { $ } from './core.js';
import { closeDialog, showDialog } from './sheet.js';
import { copyText } from './clip.js';
import { CONDITIONS, saleDraft } from './sale.js';
import { sanitizeText } from './scraper.js';

const dlg = $('saleDlg');
let current = null, opener = null;

$('saleCond').replaceChildren(...Object.entries(CONDITIONS).map(([k, v]) => new Option(v.label, k)));
$('saleCond').value = 'gut';

function say(text) { const l = $('saleLive'); l.textContent = ''; setTimeout(() => { l.textContent = text; }, 30); }

function draft() {
  if (!current) return;
  const d = saleDraft(current, { condition: $('saleCond').value, size: sanitizeText($('saleSize').value), shipping: $('saleShip').checked });
  $('saleText').value = d.text;
  $('salePrice').textContent = d.price != null
    ? 'Preisvorschlag aus dem Kaufpreis und dem Zustand. Prüfe vergleichbare Anzeigen, bevor du ihn übernimmst.'
    : 'Zu diesem Teil ist kein Kaufpreis gespeichert, deshalb steht im Text nur „VB“. Trage den Preis selbst ein.';
}

/** Öffnet den Entwurf für ein Teil. */
export function openSale(it) {
  current = it; opener = document.activeElement;
  $('saleFor').textContent = it.name;
  $('saleCond').value = 'gut'; $('saleSize').value = ''; $('saleShip').checked = false;
  draft(); showDialog(dlg);
}

for (const id of ['saleCond', 'saleSize', 'saleShip']) $(id).oninput = draft;
$('saleCopy').onclick = async () => say(await copyText($('saleText').value) ? 'Text kopiert' : 'Kopieren hat nicht geklappt');
dlg.addEventListener('close', () => { if (opener && opener.isConnected) opener.focus(); opener = null; });   // nicht jeder Browser stellt den Fokus selbst wieder her
$('saleClose').onclick = () => closeDialog(dlg);
