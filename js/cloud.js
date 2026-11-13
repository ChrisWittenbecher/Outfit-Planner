// @ts-nocheck
// Google-Sicherung: hält den Stand in einer versteckten Datei im App-Ordner von Google Drive.
// Anmeldung per Weiterleitung (Code mit PKCE), den Austausch gegen Tokens übernimmt der Hilfsdienst (dort liegt das Client-Geheimnis).
// Zugriff nur auf den App-Ordner (Recht drive.appdata): Anprobe sieht keine anderen Dateien, andere Apps sehen diese Datei nicht.
import * as Scraper from './scraper.js';
import { $, CATS, state } from './core.js';
import { WORKER_URL, GOOGLE_CLIENT_ID } from './config.js';
import { cleanPieces, fixOrder } from './board.js';
import { renderAll } from './render.js';
import { closeDialog, showDialog } from './sheet.js';
import { confirmBox, toast } from './ui.js';
import { step, undo } from './history.js';
import { flush } from './storage.js';
import { authUrl, challengeOf, cleanText, randomToken, readReturn, redirectUri, safePhoto } from './cloudauth.js';
import { mergeData } from './syncmerge.js';

export const cloudEnabled = !!(WORKER_URL && GOOGLE_CLIENT_ID);

const KEY = 'anprobe-cloud', OAUTH = 'anprobe-oauth';
const DRIVE = 'https://www.googleapis.com', FILE = 'anprobe-data.json';
// Änderungen gehen fast sofort nach Google (kurz gebündelt); fremde Änderungen holt die App alle paar Sekunden, solange sie offen ist.
const DELAY = 1500, POLL = 15000, OAUTH_MAX_AGE = 15 * 60000;

// ---- gespeicherter Zustand (kein Zugriffstoken, nur der Auffrisch-Schlüssel und der Abgleichstand) ----
/** @returns {{rt?: string, base?: string, dirty?: boolean, last?: number, name?: string, mail?: string, photo?: string, pt?: number}} */
const meta = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
const save = patch => { try { localStorage.setItem(KEY, JSON.stringify({ ...meta(), ...patch })); } catch { /* Speicher gesperrt */ } };
const forget = () => { try { localStorage.removeItem(KEY); } catch { /* egal */ } };
export const signedIn = () => cloudEnabled && !!meta().rt;

// ---- Zugriffstoken: nur im Arbeitsspeicher ----
let at = '', exp = 0;
const fail = (code, status) => Object.assign(new Error(code), { code, status });

async function worker(path, body) {
  const r = await fetch(WORKER_URL + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(fail(typeof d.error === 'string' ? d.error : 'failed', r.status), { detail: typeof d.detail === 'string' && /^[a-z_]{1,40}$/.test(d.detail) ? d.detail : '' });
  return d;
}

async function token() {
  if (at && Date.now() < exp - 60000) return at;
  const { rt } = meta();
  if (!rt) throw fail('signed_out');
  try {
    const d = await worker('/auth/refresh', { refresh_token: rt });
    at = d.access_token; exp = Date.now() + d.expires_in * 1000;
    return at;
  } catch (e) {
    if (e.code === 'invalid_grant') { forget(); at = ''; throw fail('signed_out'); }
    throw e;
  }
}

async function drive(url, init = {}, retry = true) {
  const r = await fetch(url, { ...init, headers: { ...(init.headers || {}), authorization: 'Bearer ' + await token() }, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
  if (r.status === 401 && retry) { at = ''; return drive(url, init, false); }
  if (!r.ok) {
    let reason = ''; try { reason = (await r.json()).error?.errors?.[0]?.reason || ''; } catch { /* ohne Inhalt */ }
    throw fail('drive_' + r.status + (reason ? '_' + reason : ''), r.status);
  }
  return r;
}

// ---- Datei in Google Drive ----
async function findRemote() {
  const q = new URLSearchParams({ spaces: 'appDataFolder', q: `name='${FILE}' and trashed=false`, fields: 'files(id,md5Checksum,modifiedTime,size)', orderBy: 'modifiedTime desc', pageSize: '5' });
  const files = (await (await drive(`${DRIVE}/drive/v3/files?${q}`)).json()).files || [];
  const f = files[0];
  return f ? { id: f.id, md5: f.md5Checksum || f.modifiedTime || '', size: Number(f.size) || 0 } : null;
}

async function download(remote) {
  if (remote.size > Scraper.BACKUP_LIMITS.bytes) throw fail('too_large');
  return (await drive(`${DRIVE}/drive/v3/files/${encodeURIComponent(remote.id)}?alt=media`)).text();
}

/** Lädt in einem Stück hoch (wiederaufnehmbarer Ablauf, damit auch viele Bilder gehen). */
async function upload(remote, text) {
  const create = !remote;
  const init = await drive(
    create ? `${DRIVE}/upload/drive/v3/files?uploadType=resumable&fields=id,md5Checksum,modifiedTime` : `${DRIVE}/upload/drive/v3/files/${encodeURIComponent(remote.id)}?uploadType=resumable&fields=id,md5Checksum,modifiedTime`,
    { method: create ? 'POST' : 'PATCH', headers: { 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': 'application/json' }, body: JSON.stringify(create ? { name: FILE, parents: ['appDataFolder'], mimeType: 'application/json' } : {}) });
  const session = init.headers.get('location');
  if (!session || !session.startsWith(DRIVE + '/')) throw fail('upload_session');
  const done = await (await drive(session, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: text })).json();
  const md5 = done.md5Checksum || done.modifiedTime || (await findRemote())?.md5 || '';
  return { id: done.id, md5 };
}

// ---- Abgleich ----
const exportText = () => { state.data.board = state.board; return JSON.stringify(state.data); };
let applying = false, chain = Promise.resolve(), timer = 0, lastCheck = 0, parked = false, info = { kind: 'idle', text: '' };

function setInfo(kind, text) { info = { kind, text }; paint(); }

async function apply(r, why) {
  applying = true;
  try {
    step();
    state.data = { items: r.items, outfits: r.outfits, wears: r.wears, plans: r.plans };
    state.board = fixOrder(cleanPieces(r.board)); state.sel = null; state.fitted = false;
    renderAll(); await flush();
  } finally { applying = false; }
  if (why) toast(why, { action: { label: 'Rückgängig', fn: undo } });
}

const parse = text => { const r = Scraper.parseBackup(text, CATS); if (!r.ok) throw fail('bad_remote'); return r; };
/** Gleicher Inhalt hier und in Google Drive? Beide Seiten laufen durch dieselbe Bereinigung, dann wird verglichen. */
function sameState(remote) {
  try {
    const mine = Scraper.parseBackup(exportText(), CATS);
    if (!mine.ok) return false;
    const pick = x => JSON.stringify({ items: x.items, outfits: x.outfits, wears: x.wears, plans: x.plans });
    return pick(mine) === pick(remote);
  } catch { return false; }
}
const empty = () => !state.data.items.length && !state.data.outfits.length;

function askConflict() {
  return new Promise(res => {
    const dlg = $('cloudConflict');
    const pick = v => () => { dlg.dataset.pick = v; closeDialog(dlg); };
    for (const [id, v] of [['ccMerge', 'merge'], ['ccRemote', 'remote'], ['ccLocal', 'local']]) $(id).onclick = pick(v);
    dlg.addEventListener('close', () => res(dlg.dataset.pick || ''), { once: true });
    delete dlg.dataset.pick;
    showDialog(dlg);
  });
}

/** Name, Adresse und Bild des Google-Kontos für die Anzeige (Recht drive.appdata reicht dafür); höchstens einmal am Tag. */
async function profile() {
  const m = meta(); if (m.name && Date.now() - (m.pt || 0) < 864e5) return;
  save({ pt: Date.now() });   // auch bei Fehlschlag, damit nicht bei jedem Abgleich neu gefragt wird
  try {
    const u = (await (await drive(`${DRIVE}/drive/v3/about?fields=user(displayName,emailAddress,photoLink)`)).json()).user || {};
    save({ name: cleanText(u.displayName, 80), mail: cleanText(u.emailAddress, 120), photo: safePhoto(u.photoLink) });
    paint();
  } catch { /* nur Anzeige: der Abgleich läuft trotzdem */ }
}

async function run() {
  const m = meta(); if (!m.rt) return;
  setInfo('busy', 'Gleiche mit Google ab …');
  await profile();
  const remote = await findRemote();
  const dirty = m.dirty || (!m.base && !empty());
  const stamp = () => { save({ last: Date.now() }); lastCheck = Date.now(); setInfo('ok', ''); };
  if (!remote) { if (!empty()) { const up = await upload(null, exportText()); save({ base: up.md5, dirty: false }); } stamp(); return; }
  if (m.base && remote.md5 === m.base) { if (m.dirty) { const up = await upload(remote, exportText()); save({ base: up.md5, dirty: false }); } stamp(); return; }
  // Google hat einen anderen Stand als beim letzten Abgleich (oder dieses Gerät ist neu verbunden)
  const text = await download(remote), r = parse(text);
  if (!dirty) { await apply(r, 'Stand von Google geholt'); save({ base: remote.md5, dirty: false }); stamp(); return; }
  if (sameState(r)) { save({ base: remote.md5, dirty: false }); stamp(); return; }   // gleicher Inhalt: kein Rückfragen nötig
  const choice = await askConflict();
  if (choice === 'remote') { await apply(r, 'Stand von Google übernommen'); save({ base: remote.md5, dirty: false }); }
  else if (choice === 'local') { const up = await upload(remote, exportText()); save({ base: up.md5, dirty: false }); toast('Dieser Stand liegt jetzt in Google Drive'); }
  else if (choice === 'merge') {
    await apply({ ...r, ...mergeData({ ...state.data, board: state.board }, r) }, 'Beide Stände zusammengeführt');
    const up = await upload(remote, exportText()); save({ base: up.md5, dirty: false });
  } else { parked = true; setInfo('warn', 'Abgleich offen: Dieser Stand und Google unterscheiden sich. Er wird bei der nächsten Änderung erneut angeboten.'); return; }
  stamp();
}

function explain(e) {
  const c = e.code || '';
  if (c === 'signed_out') return ['warn', 'Die Anmeldung ist abgelaufen. Bitte neu anmelden.'];
  if (e instanceof TypeError || c === 'unreachable') return ['warn', 'Keine Verbindung. Der Abgleich läuft später von selbst.'];
  if (c.includes('accessNotConfigured') || c.includes('SERVICE_DISABLED')) return ['error', 'Die Google Drive API ist im Google-Cloud-Projekt nicht aktiviert.'];
  if (c.includes('storageQuotaExceeded')) return ['error', 'Dein Google Drive ist voll.'];
  if (c === 'too_large') return ['error', 'Der Stand ist zu groß für den Abgleich.'];
  if (c === 'bad_remote') return ['error', 'Der Stand in Google Drive ist nicht lesbar. Dein Stand hier bleibt unverändert.'];
  if (c === 'upstream' && e.detail === 'invalid_client') return ['error', 'Google lehnt den Hilfsdienst ab (invalid_client): Client-ID oder Client-Geheimnis im Hilfsdienst stimmen nicht mit dem Google-Client überein.'];
  if (c === 'upstream' && e.detail) return ['error', 'Google hat die Anmeldung abgelehnt (' + e.detail + ').'];
  if (c === 'not_configured') return ['error', 'Der Hilfsdienst ist noch nicht für Google eingerichtet.'];
  return ['error', 'Der Abgleich ist fehlgeschlagen (' + (c || 'unbekannt') + '). Dein Stand hier ist sicher.'];
}

/** Ein Abgleich nach dem anderen; Fehler werden angezeigt, nie geworfen. */
export function syncNow() {
  return (chain = chain.then(run).catch(e => {
    const [kind, text] = explain(e); setInfo(kind, text);
    if (e.code === 'signed_out') toast(text, { ms: 12000, action: { label: 'Anmelden', fn: connect } });
  }));
}

function later() { clearTimeout(timer); timer = setTimeout(syncNow, DELAY); }

// ---- Anmeldung und Abmeldung ----
export async function connect() {
  const verifier = randomToken(64), st = randomToken(24);
  try { sessionStorage.setItem(OAUTH, JSON.stringify({ st, verifier, t: Date.now() })); } catch { toast('Der Browser erlaubt die Anmeldung hier nicht.', { kind: 'error' }); return; }
  location.assign(authUrl({ clientId: GOOGLE_CLIENT_ID, redirect: redirectUri(location), state: st, challenge: await challengeOf(verifier) }));
}

async function comeBack() {
  const ret = readReturn(location.search); if (!ret) return;
  history.replaceState(null, '', location.pathname + location.hash);   // Code sofort aus der Adresszeile nehmen
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(OAUTH) || 'null'); sessionStorage.removeItem(OAUTH); } catch { /* kein Eintrag */ }
  if (!saved || saved.st !== ret.state || Date.now() - saved.t > OAUTH_MAX_AGE) return;   // nicht von uns gestartet: ignorieren
  if (ret.error || !ret.code) { toast('Die Anmeldung bei Google wurde abgebrochen.'); return; }
  try {
    const d = await worker('/auth/token', { code: ret.code, verifier: saved.verifier, redirect: redirectUri(location) });
    if (!d.refresh_token) throw fail('no_refresh');
    save({ rt: d.refresh_token, base: '', dirty: false, last: 0, name: '', mail: '', photo: '', pt: 0 }); at = d.access_token; exp = Date.now() + d.expires_in * 1000;
    toast('Mit Google verbunden');
    await syncNow();
  } catch (e) {
    const [, text] = explain(e); toast(e.code === 'invalid_grant' ? 'Die Anmeldung ist abgelaufen. Bitte noch einmal versuchen.' : text, { kind: 'error' });
  }
}

async function disconnect() {
  if (!await confirmBox({ title: 'Von Google abmelden?', text: 'Dein Stand in Google Drive bleibt erhalten, hier wird er nicht mehr abgeglichen. Die Daten auf diesem Gerät bleiben unverändert.', ok: 'Abmelden', danger: true })) return;
  const { rt } = meta();
  forget(); at = ''; exp = 0; clearTimeout(timer);
  if (rt) worker('/auth/revoke', { token: rt }).catch(() => {});   // Zugriff bei Google widerrufen, falls erreichbar
  setInfo('idle', ''); toast('Abgemeldet');
}

// ---- Dialog und Anmelde-Knopf oben rechts ----
/** Zeigt Profilbild (oder Anfangsbuchstaben) statt des Anmelde-Symbols. */
function setAvatar(img, init, ico, name, photo) {
  const letter = (name || '?').trim().charAt(0).toUpperCase();
  ico?.toggleAttribute('hidden', true);
  init.textContent = letter; init.hidden = false; img.hidden = true;
  if (!photo) return;
  img.onload = () => { img.hidden = false; init.hidden = true; };
  img.onerror = () => { img.hidden = true; init.hidden = false; };
  if (img.getAttribute('src') !== photo) img.src = photo; else if (img.complete && img.naturalWidth) img.onload();
}

function paintAccount(on, m) {
  const acct = $('cloudBtn'); if (!acct) return;
  const ico = acct.querySelector('.acct-ico'), img = $('cloudAvatar'), init = $('cloudInit');
  const label = on ? 'Google-Konto' + (m.name ? ': ' + m.name : '') : 'Mit Google anmelden';
  acct.toggleAttribute('data-on', on); acct.title = on ? label : 'Mit Google anmelden: dein Stand wird automatisch in deinem Google Drive gesichert'; acct.setAttribute('aria-label', label);
  if (on) { acct.setAttribute('aria-haspopup', 'true'); acct.setAttribute('aria-expanded', String($('acctMenu').matches(':popover-open'))); } else { acct.removeAttribute('aria-haspopup'); acct.removeAttribute('aria-expanded'); }
  if (on) setAvatar(img, init, ico, m.name, m.photo);
  else { ico.toggleAttribute('hidden', false); img.hidden = true; init.hidden = true; img.removeAttribute('src'); }
  if (on) {
    $('cloudName').textContent = m.name || 'Google-Konto'; $('cloudMail').textContent = m.mail || '';
    setAvatar($('cloudWhoImg'), $('cloudWhoInit'), null, m.name, m.photo);
  } else closeMenu();
}

function paint() {
  const on = signedIn();
  const m = meta();
  paintAccount(on, m);
  const when = m.last ? new Date(m.last).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const st = $('cloudState');
  st.textContent = !on ? '' : info.text || (m.dirty ? 'Änderungen werden gesichert …' : when ? 'Gesichert: ' + when + ' Uhr' : 'Noch nicht abgeglichen.');
  st.dataset.kind = !on ? '' : info.kind !== 'idle' && info.kind !== 'ok' ? info.kind : m.dirty ? 'busy' : 'ok';
}

// ---- Dropdown am Anmelde-Knopf (Popover-Element: Esc und Klick daneben schließen von selbst) ----
let menuClosedAt = 0;
const menu = () => $('acctMenu');
function closeMenu() { try { if (menu().matches(':popover-open')) menu().hidePopover(); } catch { /* schon zu */ } }
function placeMenu() {
  const r = $('cloudBtn').getBoundingClientRect(), m = menu();
  m.style.top = Math.round(r.bottom + 8) + 'px';
  m.style.right = Math.max(8, Math.round(document.documentElement.clientWidth - r.right)) + 'px';
}
function toggleMenu() {
  if (menu().matches(':popover-open')) { closeMenu(); return; }
  paint(); placeMenu(); menu().showPopover();
  // Rechte Kante genau an den Knopf: Scrollleisten verschieben die Bezugsbreite, daher nach dem Öffnen nachmessen
  const dx = menu().getBoundingClientRect().right - $('cloudBtn').getBoundingClientRect().right;
  if (Math.abs(dx) > 0.5) menu().style.right = Math.max(8, (parseFloat(menu().style.right) || 0) + Math.round(dx)) + 'px';
}

export function startCloud() {
  if (!cloudEnabled) return;
  $('cloudBtn').hidden = false;
  $('cloudBtn').onclick = () => { if (!signedIn()) connect(); else if (Date.now() - menuClosedAt > 200) toggleMenu(); };   // Klick auf den Knopf bei offenem Menü: nur schließen
  menu().addEventListener('beforetoggle', e => { if (e.newState === 'closed') menuClosedAt = Date.now(); });   // Klick-daneben schließt schon beim Drücken, vor dem Klick-Ereignis
  menu().addEventListener('toggle', e => { $('cloudBtn').setAttribute('aria-expanded', String(e.newState === 'open')); });
  addEventListener('resize', closeMenu);
  $('cloudOut').onclick = async () => { closeMenu(); await disconnect(); paint(); };
  paint();
  document.addEventListener('anprobe:saved', () => { if (applying || !meta().rt) return; parked = false; save({ dirty: true }); paint(); later(); });
  document.addEventListener('visibilitychange', () => {
    if (!signedIn()) return;
    if (document.visibilityState === 'hidden') { if (meta().dirty) { clearTimeout(timer); syncNow(); } }
    else { parked = false; syncNow(); }
  });
  addEventListener('online', () => { if (signedIn()) syncNow(); });
  // Fremde Änderungen (anderes Gerät) holen: eine kleine Abfrage, nur bei sichtbarer Seite und mit Netz
  setInterval(() => { if (signedIn() && !parked && document.visibilityState === 'visible' && navigator.onLine !== false) syncNow(); }, POLL);
  comeBack().then(() => { if (signedIn() && !lastCheck) syncNow(); });
}
