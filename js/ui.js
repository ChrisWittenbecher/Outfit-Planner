// @ts-nocheck
import { $ } from './core.js';

let timer = 0;
const clear = () => { clearTimeout(timer); $('toasts').replaceChildren(); };
export function toast(msg, opt = {}) {
  clear();
  const t = document.createElement('div'); t.className = 'toast' + (opt.kind === 'error' ? ' toast--err' : '');
  const s = document.createElement('span'); s.textContent = msg; t.append(s);
  if (opt.action) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = opt.action.label;
    b.onclick = () => { clear(); opt.action.fn(); }; t.append(b);
  }
  $('toasts').append(t); timer = setTimeout(clear, opt.ms || 6000);
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
    done = ok => { const v = ok ? (cfg.input ? $('uiInput').value.trim() : true) : (cfg.input ? null : false); done = null; dlg.close(); res(v); };
    dlg.showModal();
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

$('more').onclick = () => $('moreDlg').showModal();
$('mClose').onclick = () => $('moreDlg').close();
$('mExp').onclick = () => { $('moreDlg').close(); $('exp').click(); };
$('mImp').onclick = () => { $('moreDlg').close(); $('imp').click(); };
