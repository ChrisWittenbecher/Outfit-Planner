/* Anprobe – setzt das gespeicherte Design vor dem ersten Zeichnen (kein Aufblitzen).
   Bewusst klassisches, winziges Skript ohne Module; die Logik zum Umschalten steht in theme.js. */
(function () {
  try {
    var d = document.documentElement;
    // Clickjacking-Schutz: Per <meta> lässt sich frame-ancestors nicht setzen. Steckt die Seite in einem fremden Rahmen, bleibt sie unsichtbar.
    if (window.top !== window.self) { d.style.display = 'none'; return; }
  } catch (e) { document.documentElement.style.display = 'none'; return; }
  try {
    var d = document.documentElement, t = localStorage.getItem('anprobe-theme'), s = localStorage.getItem('anprobe-stage');
    if (t === 'light' || t === 'dark') d.dataset.theme = t;
    if (s === 'light' || s === 'mid' || s === 'dark') d.dataset.stage = s;
  } catch (e) { /* Speicher gesperrt: es gilt die Systemeinstellung */ }
})();
