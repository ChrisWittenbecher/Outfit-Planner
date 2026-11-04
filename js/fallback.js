setTimeout(function () {
  if (document.documentElement.dataset.ready) return;
  var s = document.getElementById('saveState');
  if (s) s.textContent = 'Die App konnte nicht starten. Bitte über GitHub Pages oder einen Webserver öffnen (nicht per Doppelklick).';
}, 2500);
