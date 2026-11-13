import { PNG } from './helpers.mjs';

// Beispieldaten im Format von 1.15.x (Backup-Datei): Auswertung, Update-Test und Backup-Test benutzen denselben Bestand.
export const pad = n => String(n).padStart(2, '0');
export const keyOf = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const offset = n => { const d = new Date(); return keyOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12)); };
export const IMG = 'data:image/png;base64,' + PNG.toString('base64');
export const it = (id, name, cat, color, extra = {}) => ({ id, name, cat, color, img: IMG, link: '', price: null, cur: 'EUR', tags: [], ...extra });

// Kennung eines Teils, das gerade erst angelegt wurde (wie newId in der App): zählt 30 Tage lang noch nicht als Schrankhüter
export const FRESH = 'i' + Date.now().toString(36) + 'zzzzz';
export const wear = (n, d, ...items) => ({ id: 'w' + n, d: offset(d), n: 'Tag ' + n, items });
export const DATA = {
  items: [
    it('a1', 'Blaues Hemd', 'Oberteil', 'Blau', { price: 60 }),
    it('a2', 'Graue Hose', 'Hose/Rock', 'Grau', { price: 100 }),
    it('a3', 'Rote Jacke', 'Jacke', 'Rot'),
    it('a4', 'Weißer Schuh', 'Schuhe', 'Weiß', { price: 50 }),
    it('a5', 'Alter Schal', 'Accessoire', 'Grau'),
    it(FRESH, 'Neue Mütze', 'Accessoire', 'Schwarz'),
    it('a7', 'Lila Kleid', 'Oberteil', 'Lila', { status: 'wish' }),
    it('a8', 'Alte Hose', 'Hose/Rock', 'Braun', { price: 80 }),
  ],
  outfits: [{ id: 'o1', name: 'Büro', pieces: [{ id: 'a3', x: 10, y: 10, w: 100, r: 0 }] }],
  wears: [
    wear(1, -2, 'a1', 'a2'), wear(2, -5, 'a1'), wear(3, -9, 'a1'), wear(4, -10, 'a2'), wear(5, -20, 'a1'), wear(6, -30, 'a3'),
    wear(7, -120, 'a8'), wear(8, -150, 'a4'), wear(9, -200, 'a1'), wear(10, -400, 'a1'),
  ],
};
// 90 Tage: Hemd 4×, Hose 2×, Jacke 1× (6 Einträge). Jahr: 9 Einträge, Hemd 5×. Gesamt: 10 Einträge, Hemd 6×.
// Kosten pro Tragen (90 Tage): Hemd 60 € / 6 = 10 €, Hose 100 € / 2 = 50 €, zusammen 160 € / 8 = 20 €.
// Schrankhüter: Schuh (150 Tage), Alte Hose (120 Tage), Schal (nie getragen). Die neue Mütze und der Wunsch zählen nicht.
