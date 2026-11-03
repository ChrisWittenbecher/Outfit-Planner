// Klassisches Skript (läuft auch ohne ES-Module): zeigt einen Hinweis, wenn die App nicht startet,
// z. B. beim Öffnen per Doppelklick (file://), weil Browser dort ES-Module blockieren.
setTimeout(function () {
  if (document.documentElement.dataset.ready) return;
  var s = document.getElementById('saveState');
  if (s) s.textContent = 'Die App konnte nicht starten. Bitte über GitHub Pages oder einen Webserver öffnen (nicht per Doppelklick).';
}, 2500);
