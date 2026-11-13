// @ts-check
// Bausteine für die Google-Anmeldung (Autorisierungscode mit PKCE). Rein rechnerisch, ohne Netzwerk, damit sie sich testen lassen.

export const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';

/** @param {Uint8Array} bytes */
export const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Zufallswert aus dem sicheren Zufallsgenerator des Browsers */
export const randomToken = (bytes = 48) => b64url(crypto.getRandomValues(new Uint8Array(bytes)));

/** PKCE-Prüfwert: Base64url von SHA-256 des Verifiers @param {string} verifier */
export async function challengeOf(verifier) {
  return b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

/** Rücksprungadresse: Ordner der App mit Schrägstrich am Ende, ohne Suche und Anker @param {{origin: string, pathname: string}} loc */
export const redirectUri = loc => loc.origin + loc.pathname.replace(/[^/]*$/, '');

/** @param {{clientId: string, redirect: string, state: string, challenge: string}} o */
export function authUrl({ clientId, redirect, state, challenge }) {
  const q = new URLSearchParams({
    client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: SCOPE, state,
    code_challenge: challenge, code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false',
  });
  return AUTH + '?' + q.toString();
}

/** Liest die Rückkehr von Google aus der Adresse. @param {string} search @returns {{code: string, state: string, error: string} | null} */
export function readReturn(search) {
  const q = new URLSearchParams(search);
  const state = q.get('state') || '';
  if (!state || (!q.has('code') && !q.has('error'))) return null;
  return { code: q.get('code') || '', state, error: q.get('error') || '' };
}

/** Profilbild nur von Google selbst (https, googleusercontent.com); sonst leer. Größe wird auf 96 px beschnitten gesetzt. @param {unknown} u */
export function safePhoto(u) {
  if (typeof u !== 'string' || u.length > 500) return '';
  let url; try { url = new URL(u); } catch { return ''; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !/(^|\.)googleusercontent\.com$/.test(url.hostname)) return '';
  url.hash = '';
  return url.href.replace(/=s\d+(-c)?$/, '=s96-c');
}

/** Anzeigetext aus Google-Daten: ohne Steuerzeichen, gekürzt. @param {unknown} v @param {number} max */
export const cleanText = (v, max) => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max) : '';
