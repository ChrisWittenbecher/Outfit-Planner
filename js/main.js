// @ts-nocheck
/**
 * Anprobe – Einstieg: lädt alle Module und startet die App.
 * Jedes Modul registriert seine Ereignisse beim Laden; hier wird nur noch der Bestand geladen und gezeichnet.
 *
 * Aufbau (js/):
 *   core        Zustand, Konstanten, kleine Helfer
 *   storage     Speicher (IndexedDB)
 *   image       Bildverarbeitung (Freistellen, Zuschnitt, Schuhpaare)
 *   dialog      Dialog „Teil hinzufügen / bearbeiten“
 *   wardrobe    Kleiderschrank (Filter, Karten, Menü)
 *   board       Outfit-Board (auflegen, verschieben, skalieren, Ebenen)
 *   rotation    Drehen und Positionieren
 *   gestures    Zwei-Finger-Geste (Touch)
 *   exchange    PNG-Export, Backup
 *   outfits     Preise, Ebenenliste, gespeicherte Outfits
 *   render      alles neu zeichnen
 *   geometry    reine Mathematik (getestet)
 *   scraper     Eingabeprüfung und Bereinigung (getestet)
 *   prices      Preisverlauf und Summen (getestet)
 *   ui          eigene Dialoge und Hinweise (statt alert, confirm, prompt)
 *   theme       Design (Hell, Dunkel, Automatisch) und Bühne des Boards
 *   history     Rückgängig und Wiederholen
 */
import { $ } from './core.js';
import { load, setReady } from './storage.js';
import { renderAll } from './render.js';
import './dialog.js';
import './wardrobe.js';
import './board.js';
import './rotation.js';
import './gestures.js';
import './exchange.js';
import './outfits.js';
import './ui.js';
import './theme.js';
import { startHistory } from './history.js';

load().then(ok => {
  setReady(ok);
  if (!ok) $('saveState').textContent = 'Speicher nicht lesbar – Änderungen werden nicht gesichert. Seite neu laden.';
  renderAll();
  startHistory();
  document.documentElement.dataset.ready = '1'; // Signal für Tests und die Fallback-Meldung
});
