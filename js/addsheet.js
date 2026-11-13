// @ts-nocheck
import { $, TOUCH, state } from './core.js';
import { openDlg, takeFile } from './dialog.js';
import { startQueue } from './batch.js';
import { planFiles } from './intake.js';
import { linkFetchEnabled } from './linkfetch.js';
import { closeDialog, showDialog } from './sheet.js';
import { toast } from './ui.js';

// Hinzufügen: ein Blatt mit drei Wegen (Fotos wählen, Kamera, Link). Ein einzelnes Foto führt in den Dialog „Neues Teil“,
// mehrere in die Warteschlange (batch.js). Das Teil selbst entsteht erst nach dem Prüfen.

/**
 * Ein Dialog macht die Seite beim Schließen noch ~260 ms lang unbedienbar und gibt den Fokus an den Auslöser zurück.
 * Der nächste Schritt (neuer Dialog, Fokus) läuft deshalb erst nach „close“, sonst geht der Fokus gleich wieder verloren.
 */
function afterClose(d, fn) {
  if (!d.open) { fn(); return; }
  d.addEventListener('close', () => fn(), { once: true });
  closeDialog(d);
}

function openAdd() {
  state.editing = null;                          // ein früheres „Bearbeiten“ ist vorbei
  $('wayCamera').hidden = !TOUCH;                 // am PC gibt es keine „Kamera“: die Auswahl öffnet dort nur einen Dateidialog
  $('wayLink').hidden = !linkFetchEnabled();      // nur, wenn der Hilfsdienst eingerichtet ist
  showDialog($('addDlg'));
}
$('addBtn').onclick = openAdd;
$('fab').onclick = openAdd;
$('addClose').onclick = () => closeDialog($('addDlg'));
$('wayPhotos').onclick = () => $('file').click();
$('wayCamera').onclick = () => $('cam').click();
$('wayLink').onclick = () => afterClose($('addDlg'), () => { openDlg(); $('url').focus(); });

/** Verteilt die gewählten Dateien: ein Bild in den Dialog, mehrere in die Warteschlange. */
function intake(files) {
  const plan = planFiles(files);
  if (!plan.list.length) { toast('Das sind keine Bilder.', { kind: 'error' }); return; }
  const open = $('dlg').open;
  if (open && (state.editing || plan.list.length === 1)) { takeFile(plan.list[0]); return; }   // Teil bearbeiten oder „Anderes Bild“ im Dialog: ein Bild
  const host = open ? $('dlg') : $('addDlg');
  if (plan.list.length === 1) afterClose(host, () => takeFile(plan.list[0]));
  else afterClose(host, () => startQueue(files));
}
for (const id of ['file', 'cam']) $(id).onchange = e => { const files = [...e.target.files]; e.target.value = ''; if (files.length) intake(files); };
$('drop').addEventListener('drop', e => { const files = [...e.dataTransfer.files]; if (files.length) intake(files); });
