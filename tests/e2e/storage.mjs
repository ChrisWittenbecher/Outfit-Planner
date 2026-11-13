import { PNG, addItem, checker, closed, launch, persisted, startServer, stored, storedItems, reload } from './helpers.mjs';
import { readFile } from 'node:fs/promises';

const PORT = 8741, ORIGIN = `http://localhost:${PORT}`, BASE = `${ORIGIN}/index.html`;
const { ok, state: result } = checker();
const server = await startServer(PORT);
const browser = await launch();
const ready = p => p.waitForSelector('html[data-ready]', { state: 'attached' });
const wait = async (cond, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await cond()) return true; await new Promise(r => setTimeout(r, 50)); } return false; };
const PX = 'data:image/png;base64,' + PNG.toString('base64');

/** Fängt Schreibzugriffe ab und kann sie auf Wunsch scheitern lassen (window.__fail: 'items' | 's_v1'). */
const spy = () => {
  window.__w = [];
  try { window.__fail = localStorage.getItem('__fail') || ''; } catch { window.__fail = ''; }
  const put = IDBObjectStore.prototype.put, del = IDBObjectStore.prototype.delete;
  IDBObjectStore.prototype.put = function (v, k) {
    if (window.__fail === 'items' && this.name === 'items') throw new DOMException('Simulation', 'QuotaExceededError');
    if (window.__fail === 's_v1' && this.name === 'kv' && k === 's_v1') throw new DOMException('Simulation', 'QuotaExceededError');
    window.__w.push(['put', this.name, k ?? v?.id]);
    return put.apply(this, arguments);
  };
  IDBObjectStore.prototype.delete = function (k) { window.__w.push(['delete', this.name, typeof k === 'string' ? k : '']); return del.apply(this, arguments); };
};
const writes = (p, op, store) => p.evaluate(([o, s]) => window.__w.filter(w => w[0] === o && w[1] === s).map(w => w[2]), [op, store]);
const clearLog = p => p.evaluate(() => { window.__w = []; });

/** Stand der Datenbank, wie er gerade auf der Platte liegt. */
const raw = p => p.evaluate(() => new Promise((res, rej) => {
  const q = indexedDB.open('anprobe');
  q.onerror = () => rej(q.error);
  q.onsuccess = () => {
    const db = q.result, names = [...db.objectStoreNames], out = { version: db.version, stores: names };
    const tx = db.transaction(names);
    const get = (s, k) => new Promise(r => { const g = tx.objectStore(s).get(k); g.onsuccess = () => r(g.result); });
    Promise.all([get('kv', 's'), get('kv', 's_v1'), get('kv', 'meta'), names.includes('items') ? new Promise(r => { const g = tx.objectStore('items').count(); g.onsuccess = () => r(g.result); }) : 0,
      names.includes('thumbs') ? new Promise(r => { const out = [], c = tx.objectStore('thumbs').openCursor(); c.onsuccess = () => { const cur = c.result; if (!cur) return r(out); out.push({ id: cur.key, k: cur.value.k, d: cur.value.d }); cur.continue(); }; }) : []])
      .then(([s, s1, meta, n, th]) => { db.close(); res({ ...out, s, s1, meta, items: n, thumbs: th }); });
  };
}));

/** Schreibt Daten im Format 1 in eine leere Datenbank. Läuft auf einer Seite ohne App-Code (version.json). */
const seedLegacy = (p, legacy, meta) => p.evaluate(({ legacy, meta }) => new Promise((res, rej) => {
  const del = indexedDB.deleteDatabase('anprobe');
  del.onerror = () => rej(del.error);
  del.onsuccess = () => {
    const q = indexedDB.open('anprobe', 1);
    q.onupgradeneeded = () => q.result.createObjectStore('kv');
    q.onerror = () => rej(q.error);
    q.onsuccess = () => {
      const db = q.result, tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(legacy, 's'); if (meta) tx.objectStore('kv').put(meta, 'meta');
      tx.oncomplete = () => { db.close(); res(true); }; tx.onerror = () => rej(tx.error);
    };
  };
}), { legacy, meta });

/** Zufällige Rechtecke: lässt sich schlecht komprimieren, also gibt es wirklich etwas zu verkleinern. */
const bigJpeg = p => p.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 750; c.height = 1000; const x = c.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, 750, 1000);
  for (let i = 0; i < 400; i++) { x.fillStyle = `hsl(${Math.random() * 360} 60% 50%)`; x.fillRect(80 + Math.random() * 500, 80 + Math.random() * 800, 20 + Math.random() * 90, 20 + Math.random() * 90); }
  return c.toDataURL('image/jpeg', .92);
});
const bigPng = p => bigJpeg(p).then(d => p.evaluate(async d => { const im = new Image(); im.src = d; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; c.getContext('2d').drawImage(im, 0, 0); return c.toDataURL('image/png').split(',')[1]; }, d)).then(b => Buffer.from(b, 'base64'));
const dims = (p, src) => p.evaluate(async s => { const im = new Image(); im.src = s; await im.decode(); return [im.naturalWidth, im.naturalHeight]; }, src);
const keyOf = img => img.length + ':' + img.slice(-48);

const newPage = async (opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, ...opts });
  const p = await ctx.newPage();
  const errors = [], native = [];
  p.on('pageerror', e => errors.push(e.message));
  p.on('dialog', d => { native.push(d.type()); d.dismiss(); });
  await p.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  await p.addInitScript(spy);
  return { ctx, p, errors, native };
};
const clean = async ({ p, errors, native }, what) => {
  ok(!errors.length, what + ': keine Seitenfehler ' + errors.join('|'));
  ok(!(await p.evaluate(() => window.__csp)).length, what + ': keine CSP-Verstöße');
  ok(!native.length, what + ': keine nativen Dialoge');
};

try {
  const legacyFor = big => ({
    items: [
      { id: 'a', name: 'Alt A', cat: 'Oberteil', img: PX, cut: true, link: '', price: 20, cur: 'EUR', tags: ['basic'] },
      { id: 'b', name: 'Alt B', cat: 'Jacke', img: big, link: '', price: 80, cur: 'EUR' },
      { id: 'c', name: 'Alt C', cat: 'Schuhe', img: PX, link: '', price: null, cur: 'EUR', status: 'wish' },
      { id: 'b', name: 'Alt B doppelt', cat: 'Hose/Rock', img: PX, link: '', price: 5, cur: 'EUR' },
      null,
    ],
    outfits: [{ id: 'o1', name: 'Alt-Outfit', pieces: [{ id: 'a', x: 10, y: 10, w: 100, r: 0 }, { id: 'c', x: 120, y: 10, w: 100, r: 0 }] }],
    board: [{ id: 'a', x: 50, y: 50, w: 120, r: 0 }],
    wears: [{ id: 'w1', d: '2026-11-01', n: 'Alt-Outfit', o: 'o1', items: ['a', 'c'] }],
    plans: { '2026-11-20': 'o1' },
    fitted: false,
  });

  console.log('--- Umstellung vom alten Format');
  {
    const s = await newPage();
    const { p } = s;
    await p.goto(ORIGIN + '/version.json');
    const big = await bigJpeg(p);
    const legacy = legacyFor(big);
    await seedLegacy(p, legacy, { lastBackup: 123, since: 99, hintDone: true });
    await p.goto(BASE); await ready(p);
    ok(await p.locator('#grid .card').count() === 4, 'alle Teile sind da (4 Karten, defekter Eintrag verworfen, doppelte Kennung behoben)');
    const names = await p.locator('#grid .card .n span').allTextContents();
    ok(['Alt A', 'Alt B', 'Alt C', 'Alt B doppelt'].every(n => names.includes(n)), 'Namen unverändert: ' + names.join(', '));
    ok(await p.locator('#outs .out').count() === 1 && /Alt-Outfit/.test(await p.textContent('#outs')), 'Outfit ist da');
    ok(await p.locator('#board img.p').count() === 1, 'Board ist da');
    const db = await raw(p);
    ok(db.version === 2 && db.stores.includes('items') && db.stores.includes('thumbs'), 'Datenbank hat Version 2 mit den neuen Stores (' + db.version + ')');
    ok(db.s.v === 2 && db.s.order.length === 4 && db.items === 4, 'neuer Datensatz verweist auf 4 Teile, Store enthält 4');
    ok(!JSON.stringify(db.s).includes('data:image'), 'der kleine Datensatz enthält keine Bilder');
    ok(db.s.outfits.length === 1 && db.s.board.length === 1 && db.s.wears.length === 1 && db.s.plans['2026-11-20'] === 'o1' && db.s.fitted === false, 'Outfits, Board, Protokoll, Pläne und „Passform“ unverändert übernommen');
    ok(db.s1 && Array.isArray(db.s1.items) && db.s1.items.length === 5, 'Kopie des alten Formats liegt als Sicherheitsnetz bereit');
    ok(db.meta.lastBackup === 123 && db.meta.since === 99 && db.meta.hintDone === true && db.meta.migratedAt > 0, 'Hinweise bleiben erhalten, Umstellung ist vermerkt');
    const ids = (await storedItems(p)).map(i => i.id);
    ok(new Set(ids).size === 4 && ids.includes('a') && ids.includes('b') && ids.includes('c'), 'Kennungen sind eindeutig, die alten bleiben bestehen');

    console.log('--- Zweiter Start: keine erneute Umstellung');
    await reload(p); await ready(p);
    const db2 = await raw(p);
    ok(db2.meta.migratedAt === db.meta.migratedAt && db2.items === 4 && await p.locator('#grid .card').count() === 4, 'zweiter Start ändert nichts an Umstellung und Bestand');
    ok(db2.s1 !== undefined, 'Kopie bleibt innerhalb der 14 Tage erhalten');

    console.log('--- Backup bleibt im bekannten Format');
    const dl = p.waitForEvent('download');
    await p.evaluate(() => document.getElementById('exp').click());
    const bak = JSON.parse(await readFile(await (await dl).path(), 'utf8'));
    ok(Array.isArray(bak.items) && bak.items.length === 4 && bak.items.every(i => i.img.startsWith('data:image/')), 'Backup enthält die Teile mit vollen Bildern');
    ok(Array.isArray(bak.outfits) && Array.isArray(bak.board) && Array.isArray(bak.wears) && typeof bak.plans === 'object', 'Backup enthält Outfits, Board, Protokoll und Pläne');
    ok(!('thumbs' in bak) && !JSON.stringify(bak).includes('"order"'), 'Vorschaubilder und interne Felder gehören nicht ins Backup');

    console.log('--- Backup einspielen: kein Rückfall ins alte Format');
    await p.setInputFiles('#impf', { name: 'bak.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ items: [{ id: 'z', name: 'Aus Backup', cat: 'Oberteil', img: PX, link: '', price: 9, cur: 'EUR' }], outfits: [] })) });
    await p.click('#uiOk');
    await p.waitForFunction(() => document.querySelectorAll('#grid .card').length === 1);
    ok(await p.locator('#grid .card .n span', { hasText: 'Aus Backup' }).count() === 1, 'Backup ersetzt den Bestand');
    ok(await wait(async () => { const d = await stored(p); return d && d.v === 2 && d.items === d.order; }), 'nach dem Import stimmen Store und Datensatz überein');
    await clean(s, 'Umstellung');
    await s.ctx.close();
  }

  console.log('--- Atomar: scheitert das Schreiben der Teile, bleibt alles beim Alten');
  {
    const s = await newPage();
    const { p } = s;
    await p.goto(ORIGIN + '/version.json');
    const legacy = legacyFor(PX);
    await seedLegacy(p, legacy, { lastBackup: 5 });
    await p.evaluate(() => localStorage.setItem('__fail', 'items'));
    await p.goto(BASE); await ready(p);
    ok(/Speicher nicht lesbar/.test(await p.textContent('#saveState')), 'App meldet, dass nicht gesichert wird');
    const db = await raw(p);
    ok(db.version === 2 && db.s && db.s.v === undefined && db.s.items.length === 5 && db.items === 0, 'altes Format ist unangetastet, kein halb Umgestelltes (' + JSON.stringify({ v: db.s?.v, items: db.items }) + ')');
    ok(await p.locator('#grid .card').count() === 0, 'es wird nichts angezeigt, das später überschrieben werden könnte');
    await p.evaluate(() => localStorage.removeItem('__fail'));
    await reload(p); await ready(p);
    ok(await p.locator('#grid .card').count() === 4 && (await raw(p)).s.v === 2, 'beim nächsten Start klappt die Umstellung mit denselben Daten');
    await s.ctx.close();
  }

  console.log('--- Zu wenig Platz für die Sicherheitskopie: Umstellung klappt trotzdem');
  {
    const s = await newPage();
    const { p } = s;
    await p.goto(ORIGIN + '/version.json');
    await seedLegacy(p, legacyFor(PX));
    await p.evaluate(() => localStorage.setItem('__fail', 's_v1'));
    await p.goto(BASE); await ready(p);
    const db = await raw(p);
    ok(await p.locator('#grid .card').count() === 4 && db.s.v === 2 && db.items === 4, 'Teile sind umgestellt');
    ok(db.s1 === undefined, 'ohne Kopie, aber nichts verloren');
    await s.ctx.close();
  }

  console.log('--- Nach 14 Tagen wird die Kopie freigegeben');
  {
    const s = await newPage();
    const { p } = s;
    await p.goto(ORIGIN + '/version.json');
    await seedLegacy(p, legacyFor(PX));
    await p.goto(BASE); await ready(p);
    ok((await raw(p)).s1 !== undefined, 'Kopie ist zunächst da');
    await p.evaluate(() => new Promise(res => { const q = indexedDB.open('anprobe', 2); q.onsuccess = () => { const db = q.result, tx = db.transaction('kv', 'readwrite'), o = tx.objectStore('kv'), g = o.get('meta'); g.onsuccess = () => o.put({ ...g.result, migratedAt: Date.now() - 20 * 86400000 }, 'meta'); tx.oncomplete = () => { db.close(); res(); }; }; }));
    await reload(p); await ready(p);
    ok(await wait(async () => { const d = await raw(p); return d.s1 === undefined && d.meta.migratedAt === 0; }), 'nach 20 Tagen ist die Kopie weg');
    ok(await p.locator('#grid .card').count() === 4, 'Bestand unverändert');
    await s.ctx.close();
  }

  console.log('--- Anderer Tab hält die alte Version offen');
  {
    const s = await newPage();
    const a = await s.ctx.newPage();
    await a.goto(ORIGIN + '/version.json');
    await seedLegacy(a, legacyFor(PX));
    await a.evaluate(() => new Promise(res => { const q = indexedDB.open('anprobe', 1); q.onsuccess = () => { window.__held = q.result; res(); }; }));
    const b = s.p;
    await b.goto(BASE);
    ok(await wait(async () => /anderen Tab/.test(await b.textContent('#saveState'))), 'App sagt, dass ein anderer Tab im Weg ist');
    ok(await b.evaluate(() => !document.documentElement.dataset.ready), 'und wartet, statt mit leeren Daten zu starten');
    await a.evaluate(() => window.__held.close());
    await ready(b);
    ok(await b.locator('#grid .card').count() === 4 && (await b.textContent('#saveState')).trim() === '', 'nach dem Schließen geht es weiter, die Meldung verschwindet');
    await s.ctx.close();
  }

  console.log('--- Änderungen werden einzeln geschrieben');
  {
    const s = await newPage();
    const { p } = s;
    await p.goto(BASE); await ready(p);
    for (const name of ['Erstes', 'Zweites', 'Drittes']) await addItem(p, { trigger: '#addBtn', name });
    ok(await persisted(p, 3), 'drei Teile gespeichert');
    const db = await raw(p);
    ok(db.items === 3 && db.s.order.length === 3 && !db.s1 && db.s.v === 2, 'frischer Start schreibt gleich das neue Format, ohne Kopie');

    await clearLog(p);
    await p.locator('#grid .card').first().click();
    ok(await wait(async () => (await writes(p, 'put', 'kv')).includes('s')), 'Teil aufs Board legen speichert den kleinen Datensatz');
    ok((await writes(p, 'put', 'items')).length === 0 && (await writes(p, 'delete', 'items')).length === 0, 'ohne ein Teil anzufassen (' + JSON.stringify(await writes(p, 'put', 'items')) + ')');

    await clearLog(p);
    const card = p.locator('#grid .card', { hasText: 'Zweites' });
    await card.hover(); await card.locator('.acts button[aria-label="Bearbeiten"]').click();
    await p.waitForFunction(() => document.getElementById('dlg').open);
    await p.fill('#name', 'Zweites umbenannt'); await p.click('#ok'); await closed(p, 'dlg');
    ok(await wait(async () => (await writes(p, 'put', 'items')).length >= 1), 'Umbenennen schreibt das Teil');
    const put = await writes(p, 'put', 'items');
    ok(put.length === 1, 'und nur dieses eine (' + put.length + ')');
    ok((await writes(p, 'delete', 'thumbs')).length === 0, 'das Bild blieb gleich, die Vorschau bleibt');

    await clearLog(p);
    const del = p.locator('#grid .card', { hasText: 'Drittes' });
    await del.hover(); await del.locator('.acts button[aria-label="Löschen"]').click();
    ok(await wait(async () => (await writes(p, 'delete', 'items')).length === 1), 'Löschen entfernt genau ein Teil');
    ok((await writes(p, 'delete', 'thumbs')).length === 1, 'samt Vorschau');
    ok(await persisted(p, 2), 'Store und Datensatz zählen 2');

    await clearLog(p);
    await p.click('#toasts button');   // Rückgängig
    ok(await persisted(p, 3), 'Rückgängig bringt das Teil zurück');
    ok((await writes(p, 'put', 'items')).length === 1, 'als einzelnes Schreiben (' + (await writes(p, 'put', 'items')).length + ')');
    await clean(s, 'Einzelschreiben');
    await s.ctx.close();
  }

  console.log('--- Schreibfehler werden gemeldet und später nachgeholt');
  {
    const s = await newPage();
    const { p } = s;
    await p.goto(BASE); await ready(p);
    await addItem(p, { trigger: '#addBtn', name: 'Eins' });
    ok(await persisted(p, 1), 'erstes Teil gespeichert');
    await p.evaluate(() => { window.__fail = 'items'; });
    await addItem(p, { trigger: '#addBtn', name: 'Zwei' });
    ok(await wait(async () => /Speicher voll/.test(await p.textContent('#saveState'))), 'Platzmangel wird in der Oberfläche gemeldet: „' + (await p.textContent('#saveState')).trim() + '“');
    ok((await stored(p)).items === 1, 'gespeichert ist weiter der letzte gute Stand');
    await p.evaluate(() => { window.__fail = ''; });
    await p.locator('#grid .card').first().click();   // irgendeine Änderung löst das nächste Speichern aus
    ok(await persisted(p, 2), 'sobald es wieder geht, wird das fehlende Teil nachgeschrieben');
    ok(await wait(async () => (await p.textContent('#saveState')).trim() === ''), 'Meldung verschwindet wieder');
    await s.ctx.close();
  }

  console.log('--- Vorschaubilder');
  {
    const s = await newPage();
    const { p } = s;
    await p.goto(BASE); await ready(p);
    await addItem(p, { trigger: '#addBtn', name: 'Groß', png: await bigPng(p) });
    ok(await persisted(p, 1), 'Teil gespeichert');
    const item = (await storedItems(p))[0];
    ok(await wait(async () => (await raw(p)).thumbs.length === 1), 'Vorschau wird im Hintergrund erzeugt und gespeichert');
    const th = (await raw(p)).thumbs[0];
    ok(th.id === item.id && th.k === keyOf(item.img), 'sie gehört zu diesem Bild');
    ok(/^data:image\/(webp|png);base64,/.test(th.d) && th.d.length < item.img.length / 2, `und ist deutlich kleiner (${Math.round(th.d.length / 1024)} KB statt ${Math.round(item.img.length / 1024)} KB)`);
    const [w, h] = await dims(p, th.d);
    ok(Math.max(w, h) === 480, 'längste Seite 480 Pixel (' + w + '×' + h + ')');
    ok(await wait(async () => await p.locator('#grid .card img').first().evaluate((i, d) => i.src === d, th.d)), 'die Karte zeigt die Vorschau, ohne neu zu zeichnen');
    const full = await p.evaluate(() => { const d = document.querySelector('#grid .card'); return d && d.querySelectorAll('img').length; });
    ok(full === 1, 'eine Karte, ein Bild');
    ok((await storedItems(p))[0].img === item.img, 'das gespeicherte Teil behält das volle Bild');
    ok(await p.evaluate(() => { const b = document.getElementById('exp'); return !!b; }), 'Export bleibt erreichbar');

    console.log('--- Neustart: Vorschau ist sofort da');
    await reload(p); await ready(p); await p.waitForSelector('#grid .card img');
    ok(await p.locator('#grid .card img').first().evaluate((i, d) => i.src === d, th.d), 'beim ersten Zeichnen ist die gespeicherte Vorschau schon im Bild');

    console.log('--- Bild ersetzt: alte Vorschau wird nicht mehr gezeigt');
    const other = await bigJpeg(p);
    await p.evaluate(async other => new Promise(res => { const q = indexedDB.open('anprobe', 2); q.onsuccess = () => { const db = q.result, tx = db.transaction('items', 'readwrite'), o = tx.objectStore('items'), g = o.getAll(); g.onsuccess = () => { for (const i of g.result) o.put({ ...i, img: other }); }; tx.oncomplete = () => { db.close(); res(); }; }; }), other);
    await reload(p); await ready(p);
    ok(await wait(async () => { const t = (await raw(p)).thumbs; return t.length === 1 && t[0].k === keyOf(other) && t[0].d !== th.d; }), 'für das neue Bild entsteht eine neue Vorschau');
    ok(await wait(async () => await p.locator('#grid .card img').first().evaluate((i, d) => i.src !== d && i.src.startsWith('data:image/'), th.d)), 'und die alte erscheint nicht mehr');

    console.log('--- Reste gelöschter Teile werden aufgeräumt');
    await p.evaluate(() => new Promise(res => { const q = indexedDB.open('anprobe', 2); q.onsuccess = () => { const db = q.result, tx = db.transaction('thumbs', 'readwrite'); tx.objectStore('thumbs').put({ k: 'x', d: 'data:image/png;base64,AAAA' }, 'weg'); tx.oncomplete = () => { db.close(); res(); }; }; }));
    ok((await raw(p)).thumbs.length === 2, 'Waise liegt im Store');
    await reload(p); await ready(p);
    ok(await wait(async () => { const t = (await raw(p)).thumbs; return t.length === 1 && t[0].id !== 'weg'; }), 'Waise ist nach dem Start weg');

    console.log('--- Löschen räumt auch die Vorschau ab');
    const card = p.locator('#grid .card').first();
    await card.hover(); await card.locator('.acts button[aria-label="Löschen"]').click();
    ok(await wait(async () => { const d = await raw(p); return d.items === 0 && d.thumbs.length === 0; }), 'Teil und Vorschau sind weg');
    await clean(s, 'Vorschaubilder');
    await s.ctx.close();
  }
} finally {
  await browser.close(); server.close();
}
process.exit(result.fails ? 1 : 0);
