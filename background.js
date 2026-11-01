// Anprobe-Erweiterung: Rechtsklick auf ein Bild -> in den Kleiderschrank legen.
// Ändere APP_URL und die "matches" in manifest.json, wenn deine Seite unter einer anderen Adresse läuft.
const APP_URL = 'https://chriswittenbecher.github.io/Outfit-Planner/';
const APP_MATCH = ['https://chriswittenbecher.github.io/*', 'http://localhost/*', 'http://127.0.0.1/*'];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => chrome.contextMenus.create({ id: 'anprobe-add', title: 'Zu Anprobe hinzufügen', contexts: ['image'] }));
});
chrome.contextMenus.onClicked.addListener((info, tab) => { if (info.menuItemId === 'anprobe-add') addFromContext(info, tab).catch(console.error); });
chrome.action.onClicked.addListener(() => openApp());

// Läuft IN der Webseite: liest Titel und Preis aus den Produktdaten der Seite.
function scrapePage(src) {
  try {
    const m = k => document.querySelector(`meta[property="${k}"],meta[name="${k}"]`)?.content?.trim() || '';
    let price = m('product:price:amount') || m('og:price:amount'), cur = m('product:price:currency') || m('og:price:currency');
    const prods = [];
    const walk = n => { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) return n.forEach(walk); if ([].concat(n['@type'] || []).includes('Product')) prods.push(n); if (n['@graph']) walk(n['@graph']); };
    document.querySelectorAll('script[type="application/ld+json"]').forEach(s => { try { walk(JSON.parse(s.textContent)); } catch (e) {} });
    let title = m('og:title') || document.title || '';
    if (prods.length === 1) {
      const p = prods[0]; title = p.name || title;
      if (!price) {
        const offers = [].concat(p.offers || []).flatMap(o => o && o.offers ? [].concat(o.offers) : [o]);
        for (const o of offers) { const v = o?.price ?? o?.lowPrice ?? o?.priceSpecification?.price; if (v != null && v !== '') { price = String(v); cur = cur || o.priceCurrency || o.priceSpecification?.priceCurrency || ''; break; } }
      }
      if (!price) { const e = document.querySelector('[itemprop=price]'); if (e) price = e.getAttribute('content') || e.textContent; }
    } else if (!price) {
      price = ''; // Übersichtsseite: Preis unklar, lieber leer lassen
      const img = [...document.images].find(i => i.currentSrc === src || i.src === src); if (img && img.alt && img.alt.length > 2) title = img.alt;
    }
    return { title: title.trim().slice(0, 120), price: String(price || '').trim().slice(0, 30), cur: String(cur || '').trim().slice(0, 5) };
  } catch (e) { return { title: '', price: '', cur: '' }; }
}

async function toData(blob) { // verkleinert auf max. 1000 px
  const bmp = await createImageBitmap(blob), k = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k)), cv = new OffscreenCanvas(w, h), ctx = cv.getContext('2d');
  const jpeg = blob.type === 'image/jpeg'; if (jpeg) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
  ctx.drawImage(bmp, 0, 0, w, h);
  const out = await cv.convertToBlob({ type: jpeg ? 'image/jpeg' : 'image/png', quality: .9 }), buf = new Uint8Array(await out.arrayBuffer()); let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return 'data:' + out.type + ';base64,' + btoa(s);
}
async function fetchImage(src, tabId, frameId) {
  if (src.startsWith('data:')) return src;
  try { const r = await fetch(src); if (r.ok) { const b = await r.blob(); if (b.type.startsWith('image/')) return await toData(b); } } catch (e) {}
  try { // Zweiter Versuch aus der Seite heraus (Cookies/Referer der Seite)
    const [res] = await chrome.scripting.executeScript({ target: { tabId, frameIds: [frameId || 0] }, args: [src], func: async u => {
      try { const r = await fetch(u, { credentials: 'include' }), b = await r.blob(); return await new Promise(ok => { const f = new FileReader(); f.onload = () => ok(f.result); f.readAsDataURL(b); }); } catch (e) { return null; } } });
    if (res && res.result) { const b = await (await fetch(res.result)).blob(); if (b.type.startsWith('image/')) return await toData(b); }
  } catch (e) {}
  return ''; // die Seite versucht es dann selbst über die Bild-URL
}
async function addFromContext(info, tab) {
  const src = info.srcUrl || '', link = info.pageUrl || tab.url || '';
  let meta = { title: '', price: '', cur: '' };
  try { const [r] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: scrapePage, args: [src] }); if (r && r.result) meta = r.result; } catch (e) {}
  const image = await fetchImage(src, tab.id, info.frameId);
  const { pending = [] } = await chrome.storage.local.get('pending');
  pending.push({ id: Date.now() + '-' + Math.random().toString(36).slice(2, 8), image, src: /^https?:/.test(src) ? src : '', link, ...meta });
  await chrome.storage.local.set({ pending });
  chrome.action.setBadgeText({ text: '✓' }); chrome.action.setBadgeBackgroundColor({ color: '#3b3bff' }); setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2500);
  await openApp();
}
async function openApp() {
  const tabs = await chrome.tabs.query({ url: APP_MATCH }), t = tabs.find(x => x.url.startsWith(APP_URL)) || tabs.find(x => /^http:\/\/(localhost|127\.0\.0\.1)/.test(x.url));
  if (t) { await chrome.tabs.update(t.id, { active: true }); await chrome.windows.update(t.windowId, { focused: true }); }
  else await chrome.tabs.create({ url: APP_URL });
}
