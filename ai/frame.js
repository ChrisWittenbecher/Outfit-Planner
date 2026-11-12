// KI-Freistellen im abgeschotteten Rahmen: nimmt ein PNG von der App, gibt das freigestellte PNG zurück.
// Lädt Programm und Modell erst auf Anfrage (die App fragt vorher nach der Zustimmung).
const LIB = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.5.5/+esm';
const MAX = 30000000;
const blocked = [];
document.addEventListener('securitypolicyviolation', e => { if (blocked.length < 4) blocked.push(e.violatedDirective + ' ' + String(e.blockedURI || '').slice(0, 40)); });

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
    up({ type: 'error', id: m.id, message: String((err && err.message) || err).slice(0, 160), blocked: blocked.slice() });
  }
});
up({ type: 'ready' });
