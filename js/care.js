// @ts-check
export const DAY = 86400000;
export const BACKUP_AFTER_DAYS = 30;
export const NAG_EVERY_DAYS = 7;

/** @typedef {{ lastBackup?: number, since?: number, nagged?: number, hintDone?: boolean }} Meta */

/** @param {number} days */
export const ago = days => (days <= 0 ? 'heute' : days === 1 ? 'gestern' : 'vor ' + days + ' Tagen');

/**
 * Wie lange das letzte Backup her ist und ob eine Erinnerung fällig ist.
 * @param {Meta} meta
 * @param {number} count Anzahl Teile im Schrank
 * @param {number} now
 * @returns {{ text: string, due: boolean, days: number }}
 */
export function backupState(meta, count, now) {
  if (!count) return { text: '', due: false, days: 0 };
  const hasBackup = Number.isFinite(meta.lastBackup);
  const ref = hasBackup ? /** @type {number} */ (meta.lastBackup) : Number.isFinite(meta.since) ? /** @type {number} */ (meta.since) : now;
  const days = Math.max(0, Math.floor((now - ref) / DAY));
  const nagged = Number.isFinite(meta.nagged) ? /** @type {number} */ (meta.nagged) : 0;
  return {
    text: hasBackup ? 'Letztes Backup: ' + ago(days) : 'Noch kein Backup',
    due: days >= BACKUP_AFTER_DAYS && now - nagged >= NAG_EVERY_DAYS * DAY,
    days,
  };
}

/**
 * iPhone oder iPad im Browser (nicht als installierte App) und noch kein Hinweis gezeigt.
 * @param {{ ua: string, platform: string, touchPoints: number, standalone: boolean }} env
 * @param {Meta} meta
 * @param {number} count
 */
export function wantsInstallHint(env, meta, count) {
  const ios = /iPhone|iPad|iPod/.test(env.ua) || (env.platform === 'MacIntel' && env.touchPoints > 1);
  return ios && !env.standalone && !meta.hintDone && count > 0;
}
