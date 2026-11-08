(function () {
  // fremder Rahmen: ausblenden (frame-ancestors lässt sich per <meta> nicht setzen)
  try {
    var d = document.documentElement;
    if (window.top !== window.self) { d.style.display = 'none'; return; }
  } catch (e) { document.documentElement.style.display = 'none'; return; }
  try {
    var d = document.documentElement, t = localStorage.getItem('anprobe-theme'), s = localStorage.getItem('anprobe-stage');
    if (t === 'light' || t === 'dark') d.dataset.theme = t;
    if (s === 'light' || s === 'mid' || s === 'dark') d.dataset.stage = s;
  } catch (e) { /* Speicher gesperrt: es gilt die Systemeinstellung */ }
})();
