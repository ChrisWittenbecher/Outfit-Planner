// @ts-check
/**
 * Adresse des Anprobe-Hilfsdienstes (Cloudflare Worker), ohne Schrägstrich am Ende, z. B. https://anprobe.name.workers.dev
 * Leer lassen, solange kein Dienst eingerichtet ist: Dann bleibt die Funktion „Daten vom Link laden“ ausgeblendet.
 * Dieselbe Adresse muss in index.html bei connect-src stehen (ein Test prüft das).
 */
export const WORKER_URL = 'https://anprobe.chris-wittenbecher.workers.dev';

/**
 * Client-ID der Google-Anmeldung (öffentlich, kein Geheimnis). Anleitung: worker/GOOGLE.md
 * Leer lassen, solange nichts eingerichtet ist: Dann bleibt „Google-Sicherung“ ausgeblendet.
 */
export const GOOGLE_CLIENT_ID = '565133908347-sr6cst0tv1uscfijbkqebhifgf4j7c8v.apps.googleusercontent.com';
