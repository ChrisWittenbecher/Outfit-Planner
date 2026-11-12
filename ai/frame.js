// KI-Freistellen im abgeschotteten Rahmen: nimmt ein PNG von der App, gibt das freigestellte PNG zurück.
// Lädt Programm und Modell erst auf Anfrage (die App fragt vorher nach der Zustimmung).
const LIB = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/+esm';
const MAX = 30000000;
const blocked = [];
document.addEventListener('securitypolicyviolation', e => { if (blocked.length < 4) blocked.push(e.violatedDirective + ' ' + String(e.blockedURI || '').slice(0, 40)); });

/** Kleine Selbsttests, damit ein Fehler auf dem Gerät eindeutig zuzuordnen ist (blob-Adressen sind in abgeschotteten Rahmen nicht überall erlaubt). */
async function probes() {
  const r = [];
  const t = async (name, f) => { try { await Promise.race([f(), new Promise((_, no) => setTimeout(() => no(new Error('Zeit')), 2500))]); r.push(name + ' ok'); } catch (e) { r.push(name + ' ' + String((e && e.name) || e).slice(0, 20)); } };
  const url = () => URL.createObjectURL(new Blob(['export default 1'], { type: 'text/javascript' }));
  await t('blob-fetch', async () => { await (await fetch(url())).text(); });
  await t('blob-import', async () => { await import(url()); });
  await t('blob-worker', () => new Promise((res, no) => { const w = new Worker(URL.createObjectURL(new Blob(['postMessage(1)'], { type: 'text/javascript' }))); w.onmessage = () => { w.terminate(); res(); }; w.onerror = () => no(new Error('Fehler')); }));
  await t('wasm', async () => { await WebAssembly.instantiate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])); });
  return r.join(', ');
}

let lib = null;
const up = (msg, transfer) => window.parent.postMessage(msg, '*', transfer || []);

window.addEventListener('message', async e => {
  if (e.source !== window.parent) return;
  const m = e.data;
  if (!m || m.type !== 'cut' || typeof m.id !== 'number' || !(m.png instanceof ArrayBuffer) || m.png.byteLength > MAX) return;
  try {
    lib = lib || await import(LIB);
    const out = await lib.removeBackground(new Blob([m.png], { type: 'image/png' }), {
      progress: (_key, cur, total) => { if (total) up({ type: 'progress', id: m.id, pct: Math.round(cur / total * 100) }); },
    });
    const png = await out.arrayBuffer();
    up({ type: 'done', id: m.id, png }, [png]);
  } catch (err) {
    const probe = await probes();
    up({ type: 'error', id: m.id, message: String((err && err.message) || err).replace(/\s+/g, ' ').slice(-200) + ' | ' + probe, blocked: blocked.slice() });
  }
});
up({ type: 'ready' });
