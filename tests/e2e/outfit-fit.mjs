import { devices } from 'playwright';
import { addItem, checker, startServer, launch } from './helpers.mjs';

const PORT = 8734, BASE = `http://localhost:${PORT}/index.html`;
const { ok, state: result } = checker();
const server = await startServer(PORT);
const browser = await launch();

const shapes = p => p.evaluate(() => {
  const make = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); draw(x); return c.toDataURL('image/png').split(',')[1]; };
  return {
    top: make(200, 220, x => { x.fillStyle = '#243b82'; x.fillRect(0, 0, 200, 70); x.fillRect(45, 0, 110, 220); }),
    // Hose: Bund 120 von 160 breit (0,75), Saum 160 -> weitet sich nach unten
    pants: make(160, 300, x => { x.fillStyle = '#1f2a44'; x.beginPath(); x.moveTo(20, 0); x.lineTo(140, 0); x.lineTo(160, 300); x.lineTo(0, 300); x.closePath(); x.fill(); }),
    shoes: make(200, 80, x => { x.fillStyle = '#2b2b2b'; x.fillRect(10, 10, 80, 60); x.fillRect(110, 10, 80, 60); }),
    jacket: make(220, 240, x => { x.fillStyle = '#5a3d2b'; x.fillRect(0, 0, 220, 90); x.fillRect(30, 0, 160, 240); }),
  };
});
const geo = p => p.evaluate(() => [...document.querySelectorAll('#board img.p')].map(im => ({ z: +im.style.zIndex, x: parseFloat(im.style.left), y: parseFloat(im.style.top), w: parseFloat(im.style.width), asp: im.naturalHeight / im.naturalWidth, rot: im.style.transform })).sort((a, b) => a.z - b.z));
const settle = p => p.waitForTimeout(700);   // Fitter läuft asynchron, das Gleiten dauert 0,3 s

try {
  for (const [name, opts] of [['iPhone 13', devices['iPhone 13']], ['Desktop', { viewport: { width: 1280, height: 900 } }]]) {
    const mobile = name !== 'Desktop';
    console.log('--- ' + name);
    const ctx = await browser.newContext(opts);
    const p = await ctx.newPage();
    const errors = [], native = [];
    p.on('pageerror', e => errors.push(e.message));
    p.on('dialog', d => { native.push(d.type()); d.dismiss(); });
    await p.goto(BASE); await p.waitForSelector('html[data-ready]', { state: 'attached' });
    const trigger = mobile ? '#fab' : '#addBtn';
    const png = await shapes(p), buf = k => Buffer.from(png[k], 'base64');
    await addItem(p, { trigger, name: 'Testschuhe', cat: 'Schuhe', png: buf('shoes') });
    await addItem(p, { trigger, name: 'Testhose', cat: 'Hose/Rock', png: buf('pants') });
    await addItem(p, { trigger, name: 'Testshirt', cat: 'Oberteil', png: buf('top') });
    await addItem(p, { trigger, name: 'Testjacke', cat: 'Jacke', png: buf('jacket') });
    const tap = label => p.locator('#grid .card', { hasText: label }).locator('img').first().click();

    ok(await p.locator('#fit').isDisabled(), '„Passend anordnen“ ist bei leerem Board gesperrt');

    await tap('Testhose'); await tap('Testshirt'); await tap('Testschuhe'); await settle(p);
    let g = await geo(p);
    ok(g.length === 3, 'drei Teile auf dem Board');
    const [shoes, pants, top] = g;
    ok(g.every(k => k.x >= 0 && k.y >= 0 && k.x + k.w <= 400.5 && k.y + k.w * k.asp <= 600.5), 'alle Teile liegen ganz im Board');
    const ratio = pants.w / top.w;
    ok(ratio > 0.66 && ratio < 0.80, `Hose ist so groß, dass ihr Bund zum Saum des Oberteils passt (Verhältnis ${ratio.toFixed(2)}, Standardplatz wäre 0,90)`);
    const overlap = (top.y + top.w * top.asp - pants.y) / (top.w * top.asp);
    ok(overlap > 0.05 && overlap < 0.16, `Oberteil deckt den Hosenbund leicht ab (${(overlap * 100).toFixed(0)} % der Oberteilhöhe)`);
    ok(Math.abs((top.x + top.w / 2) - (pants.x + pants.w / 2)) < 1, 'Oberteil und Hose haben dieselbe Mitte');
    const pantsEnd = pants.y + pants.w * pants.asp;
    ok(shoes.y > pantsEnd - 0.2 * shoes.w * shoes.asp && shoes.y < pantsEnd, 'Schuhe stehen am Hosensaum');
    ok(g.every(k => k.rot === 'rotate(0deg)'), 'alle Teile ungedreht');
    const used = Math.max(...g.map(k => k.y + k.w * k.asp)) - Math.min(...g.map(k => k.y));
    ok(used > 480, `Outfit füllt das Board in der Höhe (${Math.round(used)} von 600 px)`);

    // Eigene Änderung bleibt: danach ordnet sich nichts mehr von selbst neu
    await p.locator('#board img.p').last().click({ force: true });
    await p.click('#bigger'); await p.waitForTimeout(100);
    const afterBigger = (await geo(p))[2].w;
    await tap('Testjacke'); await settle(p);
    g = await geo(p);
    const topNow = g.find(k => Math.abs(k.w - afterBigger) < 0.6);
    ok(g.length === 4 && topNow, 'nach eigener Änderung bleibt das Oberteil, wie es ist');
    ok(g.some(k => Math.abs(k.w - 150) < 0.6), 'neues Teil kommt auf den Standardplatz, nichts wird ungefragt umgeordnet');

    // „Passend anordnen“ stellt die Passform wieder her, jetzt mit Jacke
    await p.click('#fit'); await settle(p);
    g = await geo(p);
    const [s2, p2, t2, j2] = g;
    ok(g.length === 4 && g.every(k => k.rot === 'rotate(0deg)'), 'Passend anordnen: vier Teile, alle ungedreht');
    ok(Math.abs(j2.w / t2.w - 1.12) < 0.03, `Jacke ist etwas weiter als das Oberteil (${(j2.w / t2.w).toFixed(2)})`);
    ok(p2.w / t2.w > 0.66 && p2.w / t2.w < 0.80, 'Hose passt wieder zum Oberteil');
    ok(g.every(k => k.x >= 0 && k.y >= 0 && k.x + k.w <= 400.5 && k.y + k.w * k.asp <= 600.5), 'alles im Board');

    // Neuladen: Layout bleibt; Abbildung ist gespeichert
    const before = JSON.stringify(g.map(k => [k.x, k.y, k.w]));
    await p.waitForTimeout(500); await p.reload(); await p.waitForSelector('html[data-ready]', { state: 'attached' });
    await p.waitForSelector('#board img.p'); await p.waitForTimeout(300);
    ok(JSON.stringify((await geo(p)).map(k => [k.x, k.y, k.w])) === before, 'Layout bleibt nach dem Neuladen erhalten');
    const cuts = await p.evaluate(() => new Promise(res => { const q = indexedDB.open('anprobe'); q.onsuccess = () => { const g = q.result.transaction('kv').objectStore('kv').get('s'); g.onsuccess = () => res(g.result.items.map(i => !!i.cut)); }; }));
    ok(cuts.length === 4 && cuts.every(Boolean), 'Testbilder sind freigestellt, der Fitter hat echte Umrisse gemessen');

    await p.screenshot({ path: `/tmp/shots/fit-${mobile ? 'mobile' : 'desktop'}.png`, fullPage: false });
    ok(native.length === 0, 'keine nativen Dialoge');
    ok(errors.length === 0, 'keine Skriptfehler ' + errors.join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(result.fails ? result.fails + ' FEHLER' : 'ALLES OK');
process.exit(result.fails ? 1 : 0);
