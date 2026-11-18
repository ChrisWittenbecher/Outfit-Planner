// @ts-nocheck
import { $ } from './core.js';
import { closeDialog, showDialog } from './sheet.js';
import { copyText } from './clip.js';
import { KINDS, buildIssue, infoBlock, plainText, problem } from './feedback.js';
import { VERSION } from './version.js';

// Dialog „Fehler oder Anregung“. Die App sendet nichts selbst: „Auf GitHub öffnen“ öffnet die vorausgefüllte „Neues Issue“-Seite in einem neuen Tab,
// abgeschickt wird dort, mit dem Konto der Person (siehe js/feedback.js). Bis zum Klick verlässt nichts die App.
const dlg = $('fbDlg'), buttons = { bug: $('fbBug'), idea: $('fbIdea') };
let kind = 'bug', opener = null, sent = false;

/** Rückmeldung an die Person (kein Fehler): sichtbar und für Vorleseprogramme angesagt. */
function say(text) { const l = $('fbStatus'); l.hidden = false; l.textContent = ''; setTimeout(() => { l.textContent = text; }, 30); }

function setKind(k) {
  kind = k;
  for (const [key, b] of Object.entries(buttons)) b.setAttribute('aria-pressed', String(key === k));
  $('fbTextLabel').textContent = KINDS[k].ask;
}

/** Version, Anzeigeart, Fenstergröße und Gerät: nur, wenn die Person das Häkchen gelassen hat. */
function info() {
  if (!$('fbInfo').checked) return '';
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  return infoBlock({
    version: VERSION,
    mode: standalone ? 'Als App auf dem Startbildschirm' : 'Im Browser',
    screen: `${innerWidth}×${innerHeight} (${Math.round((devicePixelRatio || 1) * 10) / 10}x)`,
    device: navigator.userAgent,
  });
}

function fail(p) {
  const err = $('fbErr'); $('fbStatus').hidden = true; err.textContent = p.message; err.hidden = false;
  const field = p.field === 'title' ? $('fbTitleIn') : $('fbText');
  field.setAttribute('aria-invalid', 'true'); field.focus();
}
function clearErr() {
  $('fbErr').hidden = true;
  for (const id of ['fbTitleIn', 'fbText']) $(id).removeAttribute('aria-invalid');
}

/** Prüft die Eingaben und baut die Meldung. Null, wenn etwas fehlt (die Meldung steht dann im Dialog). */
function compose() {
  const form = { kind, title: $('fbTitleIn').value, text: $('fbText').value, info: info() };
  const p = problem(form);
  if (p) { fail(p); return null; }
  clearErr(); $('fbStatus').hidden = true;
  return buildIssue(form);
}

function openGithub(url) {
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
  document.body.append(a); a.click(); a.remove();
}

function open() {
  if (sent) { $('fbTitleIn').value = ''; $('fbText').value = ''; sent = false; }   // die letzte Meldung ist abgeschickt: neu beginnen
  clearErr(); $('fbStatus').hidden = true;
  opener = document.activeElement;
  showDialog(dlg);
}

$('fbBtn').onclick = open;
buttons.bug.onclick = () => setKind('bug');
buttons.idea.onclick = () => setKind('idea');
for (const id of ['fbTitleIn', 'fbText']) $(id).addEventListener('input', () => { clearErr(); sent = false; });   // wer weiterschreibt, hat einen neuen Entwurf
$('fbTitleIn').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('fbText').focus(); } });   // Enter im Titel schickt nichts ab

$('fbSend').onclick = () => {
  const r = compose(); if (!r) return;
  openGithub(r.url); sent = true;
  say('GitHub ist in einem neuen Tab geöffnet. Dort musst du noch auf „Submit new issue“ tippen, erst dann ist die Rückmeldung gesendet.'
    + (r.trimmed ? ' Der Text war zu lang für GitHub und wurde gekürzt. Mit „Text kopieren“ bekommst du ihn vollständig.' : ''));
};
$('fbCopy').onclick = async () => {
  if (!compose()) return;
  say(await copyText(plainText({ kind, title: $('fbTitleIn').value, text: $('fbText').value, info: info() })) ? 'Text kopiert.' : 'Kopieren hat nicht geklappt.');
};
$('fbClose').onclick = () => closeDialog(dlg);
dlg.addEventListener('close', () => { if (opener && opener.isConnected) opener.focus(); opener = null; });
