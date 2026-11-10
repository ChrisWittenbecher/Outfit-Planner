// @ts-check
/**
 * Adresse des Anprobe-Hilfsdienstes (Cloudflare Worker), ohne Schrägstrich am Ende, z. B. https://anprobe.name.workers.dev
 * Leer lassen, solange kein Dienst eingerichtet ist: Dann bleibt die Funktion „Daten vom Link laden“ ausgeblendet.
 * Dieselbe Adresse muss in index.html bei connect-src stehen (ein Test prüft das).
 */
export const WORKER_URL = '';
