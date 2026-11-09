import test from 'node:test';
import assert from 'node:assert/strict';
import { DAY, ago, backupState, wantsInstallHint } from '../../js/care.js';

const NOW = Date.UTC(2026, 10, 8, 12);

test('ago: heute, gestern, vor n Tagen', () => {
  assert.equal(ago(0), 'heute'); assert.equal(ago(-3), 'heute'); assert.equal(ago(1), 'gestern'); assert.equal(ago(12), 'vor 12 Tagen');
});

test('backupState: leerer Schrank braucht kein Backup', () => {
  assert.deepEqual(backupState({}, 0, NOW), { text: '', due: false, days: 0 });
});

test('backupState: ohne Backup zählt ab dem ersten Teil, Erinnerung erst nach 30 Tagen', () => {
  assert.deepEqual(backupState({ since: NOW - 5 * DAY }, 3, NOW), { text: 'Noch kein Backup', due: false, days: 5 });
  assert.equal(backupState({ since: NOW - 29 * DAY }, 3, NOW).due, false);
  assert.equal(backupState({ since: NOW - 30 * DAY }, 3, NOW).due, true);
  assert.equal(backupState({}, 3, NOW).days, 0, 'ohne jede Angabe beginnt die Zählung jetzt');
});

test('backupState: letztes Backup bestimmt Text und Fälligkeit', () => {
  assert.equal(backupState({ lastBackup: NOW, since: NOW - 90 * DAY }, 3, NOW).text, 'Letztes Backup: heute');
  assert.equal(backupState({ lastBackup: NOW - DAY }, 3, NOW).text, 'Letztes Backup: gestern');
  const old = backupState({ lastBackup: NOW - 45 * DAY }, 3, NOW);
  assert.deepEqual([old.text, old.due, old.days], ['Letztes Backup: vor 45 Tagen', true, 45]);
});

test('backupState: Erinnerung höchstens einmal pro Woche', () => {
  const m = { lastBackup: NOW - 60 * DAY };
  assert.equal(backupState({ ...m, nagged: NOW - 2 * DAY }, 3, NOW).due, false);
  assert.equal(backupState({ ...m, nagged: NOW - 7 * DAY }, 3, NOW).due, true);
});

test('backupState: kaputte Werte aus dem Speicher stören nicht', () => {
  const bad = /** @type {any} */ ({ lastBackup: 'gestern', since: NaN, nagged: {} });
  const s = backupState(bad, 2, NOW);
  assert.equal(s.due, false); assert.equal(s.text, 'Noch kein Backup'); assert.equal(s.days, 0);
  assert.equal(backupState({ lastBackup: NOW + 5 * DAY }, 2, NOW).days, 0, 'Zeitpunkt in der Zukunft ergibt nie negative Tage');
});

test('wantsInstallHint: nur iPhone/iPad im Browser, nur einmal, nur mit Daten', () => {
  const phone = { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', platform: 'iPhone', touchPoints: 5, standalone: false };
  const ipadDesktopMode = { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', touchPoints: 5, standalone: false };
  const mac = { ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', touchPoints: 0, standalone: false };
  const android = { ua: 'Mozilla/5.0 (Linux; Android 15)', platform: 'Linux armv8l', touchPoints: 5, standalone: false };
  assert.equal(wantsInstallHint(phone, {}, 1), true);
  assert.equal(wantsInstallHint(ipadDesktopMode, {}, 1), true);
  assert.equal(wantsInstallHint(mac, {}, 1), false);
  assert.equal(wantsInstallHint(android, {}, 1), false);
  assert.equal(wantsInstallHint({ ...phone, standalone: true }, {}, 1), false, 'schon installiert');
  assert.equal(wantsInstallHint(phone, { hintDone: true }, 1), false, 'nur einmal');
  assert.equal(wantsInstallHint(phone, {}, 0), false, 'erst wenn Teile da sind');
});
