// Läuft nur auf der Anprobe-Seite und reicht gemerkte Bilder an die Seite weiter.
const send = async () => {
  const { pending = [] } = await chrome.storage.local.get('pending');
  if (pending.length) window.postMessage({ source: 'anprobe-ext', type: 'add', items: pending }, location.origin);
};
window.addEventListener('message', async e => {
  const m = e.data; if (e.source !== window || !m || m.source !== 'anprobe-app') return;
  if (m.type === 'ready') send();
  if (m.type === 'ack' && Array.isArray(m.ids)) {
    const { pending = [] } = await chrome.storage.local.get('pending');
    await chrome.storage.local.set({ pending: pending.filter(i => !m.ids.includes(i.id)) });
  }
});
chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c.pending) send(); });
