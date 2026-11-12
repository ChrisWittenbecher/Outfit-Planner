// @ts-nocheck
import { $ } from './core.js';
import { closeDialog, showDialog } from './sheet.js';
import { haptic } from './haptics.js';

let timer = 0, leaving = 0;
const wipe = () => { clearTimeout(timer); clearTimeout(leaving); $('toasts').replaceChildren(); };
const leave = () => {
  clearTimeout(timer);
  const t = $('toasts').firstElementChild;
  if (!t || matchMedia('(prefers-reduced-motion: reduce)').matches) { wipe(); return; }
  t.classList.add('toast--out'); leaving = setTimeout(wipe, 180);
};
export function toast(msg, opt = {}) {
  wipe();
  if (opt.kind === 'error') haptic('error'); else if (opt.haptic) haptic(opt.haptic);
  const t = document.createElement('div'); t.className = 'toast' + (opt.kind === 'error' ? ' toast--err' : '');
  const s = document.createElement('span'); s.textContent = msg; t.append(s);
  if (opt.action) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = opt.action.label;
    b.onclick = () => { leave(); opt.action.fn(); }; t.append(b);
  }
  $('toasts').append(t); timer = setTimeout(leave, opt.ms || 6000);
}

let done = null;
const dlg = $('uiDlg');
function show(cfg) {
  return new Promise(res => {
    $('uiTitle').textContent = cfg.title;
    $('uiText').textContent = cfg.text || ''; $('uiText').hidden = !cfg.text;
    $('uiLabel').hidden = $('uiInput').hidden = !cfg.input;
    if (cfg.input) { $('uiLabel').textContent = cfg.label || ''; $('uiInput').value = cfg.value || ''; }
    $('uiOk').textContent = cfg.ok || 'OK'; $('uiOk').classList.toggle('danger', !!cfg.danger);
    done = ok => { const v = ok ? (cfg.input ? $('uiInput').value.trim() : true) : (cfg.input ? null : false); done = null; closeDialog(dlg); res(v); };
    showDialog(dlg);
    if (cfg.input) { $('uiInput').focus(); $('uiInput').select(); } else $('uiOk').focus();
  });
}
/** Rückfrage: true bei OK, false bei Abbrechen oder Esc. */
export const confirmBox = cfg => show(cfg);
export const askText = cfg => show({ ...cfg, input: true });

$('uiOk').onclick = () => done?.(true);
$('uiCancel').onclick = () => done?.(false);
dlg.addEventListener('cancel', e => { e.preventDefault(); done?.(false); });  // Esc
$('uiInput').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); done?.(true); } };

$('more').onclick = () => showDialog($('moreDlg'));
$('mClose').onclick = () => closeDialog($('moreDlg'));
$('mExp').onclick = () => { closeDialog($('moreDlg')); $('exp').click(); };
$('mIdea').onclick = () => { closeDialog($('moreDlg')); $('ideaBtn').click(); };
$('mCal').onclick = () => { closeDialog($('moreDlg')); $('calBtn').click(); };
$('mImp').onclick = () => { closeDialog($('moreDlg')); $('imp').click(); };
