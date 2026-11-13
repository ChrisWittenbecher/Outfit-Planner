// Notbremse beim Start. Klassisches Skript, läuft vor den Modulen und braucht keines davon.
// Hintergrund: Direkt nach einem Update liefert die Safari-Engine beim Neuladen manchmal noch einzelne alte Module aus ihrem Arbeitsspeicher
// zur neuen Seite. Die alte main.js kennt js/guard.js nicht, die App startet dann nicht ("null is not an object" in einem Modul), bis man ein
// zweites Mal lädt. Dieses Skript tut das von selbst: Ein Skriptfehler vor dem Start oder ein Start, der nach dem Laden zu lange dauert,
// führt zu einem Neuladen, höchstens zweimal pro Minute (Merker nur in sessionStorage), damit nie eine Schleife entsteht.
(function () {
  var KEY = 'anprobe-recover', WINDOW = 60000, MAX = 2, FAULT_MS = 1500, SLOW_MS = 10000;
  function ready() { return !!document.documentElement.dataset.ready; }
  function recover() {
    if (ready()) return;
    try {
      var saved = (sessionStorage.getItem(KEY) || '').split(','), count = Number(saved[0]) || 0, since = Number(saved[1]) || 0, now = Date.now();
      if (now - since >= WINDOW) { count = 0; since = now; }   // die Minute ist um: von vorn zählen
      if (count >= MAX) return;
      sessionStorage.setItem(KEY, (count + 1) + ',' + since);
    } catch (e) { return; }   // kein Speicher: lieber nichts tun als eine Schleife riskieren
    location.reload();
  }
  addEventListener('error', function () { setTimeout(recover, FAULT_MS); });
  addEventListener('load', function () { setTimeout(recover, SLOW_MS); });
})();
