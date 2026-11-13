# Plan Version 2.0

Stand der Planung: 13.11.2026. Ausgangspunkt ist 1.15.14. Die Vorschau mit den sechs Ansichten ist die Vorlage.

## Entscheidungen

- **Umfang:** alles aus der Vorschau (Reiter, Vorschläge mit Wetter, Auswertung, Teilen, schnelleres Hinzufügen).
- **Teilen:** nur als Bild über den Teilen-Dialog des Geräts. Es gibt keinen Server, keine öffentlichen Links und kein „geteilt“-Zeichen. Die Vorschau „Geteilter Link“ entfällt. Datenschutz- und Impressumsseiten sind dafür nicht nötig.
- **Name:** Outfit-Planner (umgesetzt in 1.15.14). „Anprobe-Board“ bleibt der Name der Funktion.
- **Reihenfolge:** in Etappen. Jede Etappe ist für sich lauffähig, vollständig getestet und wird einzeln veröffentlicht. Erst nach der letzten Etappe heißt die App 2.0.0.

## Leitplanken (gelten in jeder Etappe)

1. **Keine Daten gehen verloren.** Speicherformat bleibt 2. Einzige Erweiterung: ein optionales Feld `keep` am Teil (siehe Etappe 3). Es wird in `sanitizeItem`, Backup und Sync-Zusammenführung mitgeführt und per Test belegt. Ein Backup aus 1.15.x muss in jeder Etappe unverändert ladbar sein.
2. **Sicherheit zuerst.** CSP bleibt streng. Einzige neue Verbindung: `https://api.open-meteo.com` (Etappe 2), nur mit Zustimmung. Keine neuen Abhängigkeiten, kein Code von außen, kein `innerHTML` mit Nutzerdaten.
3. **Offline bleibt.** Jede neue Moduldatei steht als `modulepreload` in `index.html`, sonst nimmt sie der Service Worker nicht in den Cache. Ein Test prüft das für alle Importe.
4. **Alles ist bedienbar:** Tastatur, Screenreader (Rollen, Live-Meldungen), Touch-Ziele ab 44 px, Kontrast in Hell und Dunkel, „Bewegung reduzieren“.
5. **Rückgängig:** Änderungen am Bestand bleiben in einem Schritt rückgängig zu machen.
6. **Ein Etappen-Tor vor jedem Merge:** Unit-Tests, `tsc`, alle E2E-Tests (Chromium lokal, WebKit in der CI), Bildschirmfotos in Hell und Dunkel bei 360, 390, 768 und 1280 px von mir angesehen, keine CSP-Verstöße, keine Skriptfehler. Erst dann Merge, danach Live-Seite prüfen.

## Etappen

### Etappe 1 · 1.16.0 · Reiter und Vorschläge-Seite

- Navigation mit drei Reitern: **Schrank**, **Vorschläge**, **Auswertung**. Am PC als Pillen in der Kopfzeile, am Handy als feste Reihe unter der Kopfzeile (kein Zusammenstoß mit dem „+“-Knopf, keine Probleme mit der iPhone-Leiste).
- Adresse mit `#vorschlaege` und `#auswertung`, Schrank ohne Hash. Reiterwechsel legt einen Verlaufseintrag an, Zurück führt zum Schrank. Das Zurück-System der Dialoge (`sheet.js`) bleibt unberührt, `popstate` mit Dialogzustand wird nicht angefasst.
- ARIA: Reiterleiste als `tablist` mit Pfeiltasten, Seiten als `tabpanel`, Fokus geht beim Wechsel auf die Überschrift der Seite.
- **Vorschläge-Seite** ersetzt den Dialog „Ideen“: „Heute für dich“ mit Datum, drei Karten (Bilder, Titel, Gründe, „Anprobieren“, „Speichern“), „Neue Vorschläge“ (nutzt andere Teile als zuvor), rechts „Anlass“ und Schalter. Die **Packliste** bleibt als zweiter Bereich auf derselben Seite erhalten.
- „Anprobieren“ legt das Outfit aufs Board und wechselt zum Schrank. „Speichern“ legt es direkt unter „Gespeichert“ ab.
- Neue reine Logik mit Unit-Tests: Titel der Karten, Anlass, Vermeidungsliste.

### Etappe 2 · 1.17.0 · Wetter und Anlass

- Schalter „Wetter berücksichtigen“, standardmäßig aus. Beim Einschalten fragt der Browser nach dem Standort. Die Koordinaten werden auf 0,1° gerundet (etwa 10 km), nirgends gespeichert und nur an `api.open-meteo.com` gesendet. Gespeichert wird nur der Schalter.
- Antwort wird streng geprüft (nur endliche Zahlen in plausiblen Bereichen, Wettercode aus einer festen Liste) und auf die bestehenden vier Stufen abgebildet (kalt, mild, warm, regen). Ohne Netz, ohne Erlaubnis oder bei Fehler greifen die bisherigen Wahlknöpfe, mit klarer Meldung.
- Anzeige: Temperatur und Wetterlage. Ein Ortsname entfällt (er bräuchte einen zweiten Dienst).
- **Anlass** (Büro, Alltag, Abend, Sport, Reise) arbeitet mit deinen Tags: passende Tags bevorzugt, „Sport“-Teile nur bei Anlass Sport. Fehlen Tags, sagt die Seite das und nennt den Weg.
- Schalter „Selten Getragenes bevorzugen“ und „Nur Teile, die ich besitze“ (bisher fest) werden einstellbar.
- CSP: `connect-src` um Open-Meteo erweitert, Sicherheitstest angepasst, Test gegen jede andere Adresse bleibt.

### Etappe 3 · 1.18.0 · Auswertung-Seite

- Kacheln: getragene Teile (x von y), Kosten pro Tragen (je Währung, keine Mischrechnung), meistgetragene Farbe. Zeitraum: 90 Tage, Jahr, Gesamt.
- „Am häufigsten getragen“ als Balken mit Farbpunkt.
- „Aussortieren?“: Teile ohne Tragen in 90 Tagen. **Behalten** setzt `keep` (Datum, 90 Tage Ruhe). **Aussortieren** fragt: Verkaufstext erstellen, Löschen (rückgängig möglich) oder Abbrechen.
- Der Kalender bleibt als Dialog erreichbar (Knopf „Kalender“ auf der Seite). Sein Reiter „Auswertung“ entfällt, weil die Seite ihn ersetzt.
- Neues Modul `stats.js` mit Unit-Tests (Zeiträume, Tagesgrenzen, Währungen, leere Daten, Teile ohne Preis).

### Etappe 4 · 1.19.0 · Teilen als Bild

- Knopf „Teilen“ am Board und Teilen-Symbol an jedem gespeicherten Outfit.
- Bild wird lokal gezeichnet. Mit Unterstützung wird `navigator.share({ files })` genutzt, sonst Speichern der Datei mit Hinweis. Abbruch durch den Nutzer ist keine Fehlermeldung.
- Dateiname aus dem Outfit-Namen, bereinigt. Gemeinsame Zeichenfunktion mit dem bestehenden PNG-Export, damit beides gleich aussieht.

### Etappe 5 · 1.20.0 · Schneller hinzufügen

- „Hinzufügen“ öffnet ein Blatt mit drei großen Wegen: **Fotos wählen** (mehrere), **Kamera**, **Link einfügen** (nur wenn der Hilfsdienst eingerichtet ist). Ein einzelnes Foto führt weiter in den vorhandenen ausführlichen Dialog.
- Mehrere Fotos: Warteschlange mit Zustand je Foto (Wartet, Verarbeitet …, Fertig, Fehler), Fortschrittsbalken, Abbrechen. Verarbeitung nacheinander mit Pausen für die Oberfläche, wie bisher, damit nichts hängt.
- **Prüfschritt:** „Fertige prüfen“ zeigt Name und Kategorie je Foto zum Anpassen. Erst „Hinzufügen“ schreibt in den Bestand, in einem Rückgängig-Schritt. Bis dahin ist nichts verändert.
- Grenzen: höchstens 30 Fotos, Größe je Datei wie bisher, Speicherverbrauch begrenzt.

### Etappe 6 · 2.0.0 · Abschluss

- Gesamtdurchgang: alle Wege von Hand und per Test, Daten aus einem alten Backup, Offline-Start, Update von 1.15.x auf 2.0.0 mit vorhandenen Daten und Google-Sicherung.
- README, SECURITY.md, Anleitungen und diese Datei auf den Endstand bringen.
- Version 2.0.0.

## Teststrategie

| Ebene | Was |
|---|---|
| Unit | neue reine Module (Titel, Anlass, Wetter-Abbildung, Statistik, Teilen, Warteschlange), `sanitizeItem` mit `keep`, Import-Graph gegen `modulepreload`, CSP-Liste |
| E2E (je Etappe neu) | Reiterwechsel per Maus, Tastatur, Zurück-Taste und Adresse; Karten, Aktionen, Wetter mit nachgestellter Antwort (Erfolg, Fehler, Ablehnung, Offline); Auswertung mit Beispieldaten; Teilen mit und ohne Share-API; Hinzufügen mit 1, 5 und 31 Fotos, Abbruch, kaputter Datei |
| Bestand | Backup aus 1.15.14 laden, Etappe nutzen, Backup erneut exportieren: gleicher Inhalt |
| Optik | Bildschirmfotos aller Seiten, Hell und Dunkel, 360 bis 1280 px, von mir geprüft; Kontrasttest erweitert |
| Zugänglichkeit | Rollen, Fokusreihenfolge, Tastaturbedienung, Live-Meldungen, 44-px-Ziele |
| Sicherheit | CSP ohne Verstöße im ganzen Lauf, keine zusätzliche Adresse außer Open-Meteo, Eingaben bereinigt |
| Browser | Chromium lokal, WebKit in der CI (iPhone-Verhalten) |
| Live | nach jedem Merge Version, Service Worker und Startseite auf outfit-planner.org prüfen |

## Bewusst nicht Teil von 2.0

- Öffentliche Links zum Teilen, Konten von Empfängern, Server-Speicher.
- Ortsname zum Wetter, Wettervorhersage für andere Tage.
- Neue KI-Funktionen (das KI-Freistellen bleibt entfernt, die einfache Freistellung bleibt).

## Risiken und Gegenmaßnahmen

| Risiko | Gegenmaßnahme |
|---|---|
| Reiter stören Dialog-Zurück-Logik | Eigener `popstate`-Zweig mit Prüfung des Dialogzustands, E2E für Dialog in Reiter und Zurück |
| Neue Datei fehlt im Offline-Cache | Unit-Test über den Import-Graphen, E2E „Offline-Start jeder Seite“ |
| Wetterdienst nicht erreichbar oder liefert Unsinn | Streng geprüft, jede Störung führt zu den manuellen Knöpfen |
| Zu viele Fotos füllen den Speicher | Grenze 30, Verarbeitung nacheinander, Ergebnis erst nach Prüfung im Bestand |
| `keep` geht beim Sync oder Backup verloren | Test in Bereinigung, Backup und Zusammenführung |
| iPhone-Eigenheiten (Teilen, Kamera) nicht lokal prüfbar | WebKit-Lauf in der CI, Rückfälle ohne Share-API, klare Hinweise |
