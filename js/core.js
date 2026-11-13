// @ts-nocheck
import * as Scraper from './scraper.js';
import { thumbKey } from './model.js';

/**
 * @typedef {Object} Item      Ein Kleidungsstück im Kleiderschrank
 * @property {string} id
 * @property {string} name
 * @property {'Oberteil'|'Jacke'|'Hose/Rock'|'Schuhe'|'Accessoire'} cat
 * @property {string} img       freigestelltes Bild als data:-URL
 * @property {string} [orig]    Originalbild (zum erneuten Freistellen)
 * @property {boolean} [cut]    true = Hintergrund entfernt (echte Transparenz)
 * @property {boolean} [alpha]  Original hatte schon Transparenz
 * @property {boolean} [mirror] zweiter Schuh wurde ergänzt
 * @property {string} link      Link zum Angebot (leer oder http/https)
 * @property {number|null} price
 * @property {string} cur       Währungscode, z. B. EUR
 * @property {'own'|'wish'} [status]  „own“ = besitze ich, „wish“ = Wunschliste (fehlt bei älteren Daten = own)
 * @property {{t:number, v:number}[]} [priceHistory]  Preisverlauf, jede Änderung wird festgehalten
 * @property {string} [ean]     Barcode aus älteren Backups (wird nur noch mitgeführt)
 * @property {string} [keep]    Tag (JJJJ-MM-TT), an dem in der Auswertung „Behalten“ gewählt wurde; 90 Tage lang kein „Aussortieren?“
 */
/**
 * @typedef {Object} Piece     Ein Teil auf dem Board. Die Reihenfolge im Array = Ebenen (hinten → vorn)
 * @property {string} id       Verweis auf Item.id
 * @property {number} x @property {number} y @property {number} w
 * @property {number} r       Drehung in Grad (0 ≤ r < 360), Drehpunkt = Bildmitte
 */
/** @typedef {{id:string, name:string, pieces:Piece[]}} Outfit */

export const CATS = ['Oberteil','Jacke','Hose/Rock','Schuhe','Accessoire'];
// Standardposition: x, y, Breite, Ebene
export const DEF = {'Oberteil':[100,30,200,2],'Jacke':[8,50,150,4],'Hose/Rock':[110,230,180,1],'Schuhe':[110,470,180,2],'Accessoire':[280,260,100,5]};
export const $ = id => document.getElementById(id);
const enc = encodeURIComponent;
export const state = {data:{items:[], outfits:[], wears:[], plans:{}}, board:[], filter:'Alle', statusFilter:'Alle', query:'', tag:'', fresh:null, fitted:false, draft:null, sel:null, editing:null, K:1};
/** Handy und Tablet: Touch ohne Maus. Dort passen Hinweise zu Maus und Tastatur nicht. */
export const TOUCH = typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches;
export const DROP = TOUCH ? 'Tippen, um einen Screenshot oder ein Foto auszuwählen' : 'Screenshot hierher ziehen, einfügen (Strg/Cmd + V) oder klicken zum Auswählen';
export const item = id => state.data.items.find(i => i.id === id);
export const imgOf = id => item(id)?.img;
/** Vorschaubilder (id → {k, d}); k sagt, zu welchem Bild d gehört. Fehlt eins oder passt es nicht mehr, gilt das volle Bild. */
export const thumbMap = new Map();
export const thumbOf = it => { const t = thumbMap.get(it.id); return t && t.k === thumbKey(it.img) ? t.d : it.img; };
/** Setzt das Vorschaubild; ist es später fertig, tauscht thumbs.js es an Ort und Stelle aus. */
export function showThumb(im, it){ im.src = thumbOf(it); im.dataset.th = it.id; im.dataset.tk = thumbKey(it.img); }
export const mb = it => it && it.cut ? '' : ' mb';
export const loadImg = (src, cors) => new Promise((res, rej) => { const i = new Image(); if(cors) i.crossOrigin = 'anonymous'; i.onload = () => res(i); i.onerror = rej; i.src = src; });
export const readFile = f => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
export const money = (v, c) => { try{ return new Intl.NumberFormat('de-DE', {style:'currency', currency:c || 'EUR'}).format(v); }catch(e){ return v.toFixed(2) + ' ' + c; } };
export const parsePrice = Scraper.parsePrice; // Preis aus Text lesen (siehe js/scraper.js)
export const newId = () => 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
/** Kündigt eine Änderung für Bildschirmleser an (aria-live). */
export function announce(t){ const a = $('announcer'); a.textContent = ''; setTimeout(() => { a.textContent = t; }, 30); }
export const hostOf = u => { try{ return new URL(u).hostname.replace(/^www\./, ''); }catch(e){ return ''; } };