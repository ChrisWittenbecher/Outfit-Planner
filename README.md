<div align="center">

# Anprobe

**Der Outfit-Planer für das Web.** Sammle Kleidungsstücke aus Screenshots und Bildern, kombiniere sie zu Outfits und behalte Preise und Angebote im Blick.

[**Live-Demo**](https://chriswittenbecher.github.io/Outfit-Planner/) · [Funktionen](#funktionen) · [Schnellstart](#schnellstart) · [Datenschutz](#datenschutz-und-sicherheit) · [Entwicklung](#entwicklung)

</div>

---

## Überblick

Anprobe ist eine statische Web-App ohne Build-Schritt, ohne Konto und ohne Tracking. Sie läuft auf dem Smartphone genauso wie am Desktop und speichert alle Daten ausschließlich im Browser des Geräts.

Der typische Ablauf:

1. **Hinzufügen:** Über **„+ Kleidungsstück hinzufügen“** fügst du einen Screenshot oder ein Foto hinzu und ergänzt Name, Kategorie, Preis und optional den Link zum Angebot.
2. **Freistellen:** Der Hintergrund wird automatisch entfernt, das Bild auf das Teil zugeschnitten.
3. **Kombinieren:** Teile auf dem Anprobe-Board verschieben, skalieren, drehen und stapeln.
4. **Vergleichen:** Preise, Gesamtsumme und der Link zum Angebot stehen direkt am Outfit.

## Funktionen

| Bereich | Beschreibung |
|---|---|
| **Bild und Screenshot** | Per Dateiauswahl, Drag & Drop, Einfügen aus der Zwischenablage oder **direktem Bildlink**. Preis und **Link zum Shop** werden immer am Teil gespeichert (fehlt „https://“, wird es ergänzt). Landet ein Seitenlink im Bildfeld, übernimmt die App ihn als Shop-Link, sofern dieses Feld leer ist. Das Laden per Bildlink klappt nur, wenn der Server des Shops es erlaubt; sonst hilft ein Screenshot. Aktionen pro Teil (Bearbeiten, Angebot öffnen, Löschen) liegen am Smartphone im Drei-Punkte-Menü. |
| **Automatisches Freistellen** | Flood-Fill-Freistellung mit Toleranzregler, optional KI-Freistellen für schwierige Bilder. Ausschnitt per Ziehen anpassbar. |
| **Anprobe-Board** | Verschieben, Skalieren und **Drehen aller Teile**: am Smartphone mit **zwei Fingern** (Spreizen = Größe, Verdrehen = Drehung), am Desktop per Mausrad, Griff, Regler und Tastatur. Ebenen per Schaltfläche oder Liste. |
| **Wunschliste und Preisverlauf** | Jedes Teil ist entweder „Besitze ich“ oder „Wunschliste“ (filterbar, mit Marke an der Karte, „Als gekauft markieren“ per Klick). Im Outfit zeigt die Summe zusätzlich, was **noch zu kaufen** ist. Jede Preisänderung wird mit Datum im **Preisverlauf** festgehalten; die Karte zeigt die letzte Änderung als ↓ oder ↑ in Prozent. Der Preis wird von Hand eingetragen (siehe Roadmap). |
| **Schuhe** | Ist nur ein Schuh zu sehen, wird der zweite gespiegelt ergänzt. |
| **Outfits** | Speichern, laden und als PNG exportieren. Preissumme pro Outfit. |
| **Dunkelmodus** | Hell, Dunkel oder **Automatisch** (folgt dem System), umschaltbar oben rechts und gespeichert. Kachel und Board bleiben eine helle **Bühne**, damit dunkle Kleidungsstücke sichtbar bleiben; die Bühne des Boards lässt sich auf Hell, Mittel oder Dunkel stellen und wird auch im PNG-Export verwendet. Kontraste sind per Test abgesichert (Text mindestens 4,5:1, Feldränder mindestens 3:1). |
| **Rückgängig und Wiederholen** | Bis zu 50 Schritte für Kleiderschrank, Board und Outfits (Strg/Cmd + Z, Strg/Cmd + Umschalt + Z oder die Pfeile oben). Löschen und Backup-Einlesen fragen nicht mehr nach, sondern bieten stattdessen **„Rückgängig“** an. |
| **Backup** | Gesamten Bestand als JSON sichern und wiederherstellen. Am Smartphone im Menü „⋯“. |
| **Mobil optimiert** | Bedienung mit dem Daumen: Schwebender „+“-Button, Dialoge als Bottom-Sheet, große Touch-Ziele, Unterstützung für Notch und Home-Indikator. Bewegung wird bei „Bewegung reduzieren“ des Systems abgeschaltet. |
| **Barrierefrei** | Tastaturbedienung, sinnvolle ARIA-Rollen und Live-Meldungen, sichtbarer Fokus. |

## Schnellstart

### Online nutzen (GitHub Pages)

Die App liegt im Repository-Hauptverzeichnis und läuft direkt auf GitHub Pages:

1. Repository öffnen → **Settings → Pages**
2. **Source:** *Deploy from a branch*, Branch `main`, Ordner `/ (root)`
3. Nach ein bis zwei Minuten erreichbar unter `https://<name>.github.io/<repository>/`

Zeigt die Seite noch eine alte Version, hilft ein harter Reload (`Strg/Cmd + Shift + R`).

### Ohne Hosting ausprobieren

Die App besteht nur aus statischen Dateien und braucht keinen eigenen Server. Für einen schnellen lokalen Test genügt jeder Datei-Server im Projektordner, zum Beispiel `npx serve` oder `python3 -m http.server 8000`. Die Seite bitte über `http://localhost` öffnen und nicht per Doppelklick auf `index.html`, weil Browser ES-Module bei `file://` blockieren.

## Projektstruktur

```
.
├── index.html              Seitengerüst und Content-Security-Policy
├── css/
│   └── styles.css          Styles in Cascade Layers, alle Farben als Design-Tokens
├── js/
│   ├── main.js             Einstieg: lädt die Module, startet die App
│   ├── core.js             gemeinsamer Zustand, Konstanten, Helfer
│   ├── storage.js          Speicher (IndexedDB)
│   ├── image.js            Bildverarbeitung: Freistellen, Zuschnitt, Schuhpaare
│   ├── dialog.js           Dialog „Teil hinzufügen / bearbeiten“
│   ├── wardrobe.js         Kleiderschrank: Filter, Karten, Drei-Punkte-Menü
│   ├── board.js            Board: auflegen, verschieben, skalieren, Ebenen
│   ├── rotation.js         Drehen und Positionieren (Griff, Regler)
│   ├── gestures.js         Zwei-Finger-Geste (Touch)
│   ├── exchange.js         PNG-Export, Backup, Wiederherstellen
│   ├── outfits.js          Preise, Ebenenliste, gespeicherte Outfits
│   ├── render.js           alles neu zeichnen
│   ├── ui.js               eigene Dialoge und Hinweise statt alert, confirm, prompt
│   ├── theme.js            Design (Hell, Dunkel, Automatisch) und Bühne des Boards
│   ├── theme-init.js       setzt das gespeicherte Design vor dem ersten Zeichnen (kein Aufblitzen)
│   ├── history.js          Rückgängig und Wiederholen
│   ├── geometry.js         Drehen und Positionieren (reine Funktionen, getestet)
│   ├── scraper.js          Eingabeprüfung und Bereinigung (getestet)
│   ├── prices.js           Preisverlauf, Preisänderung, Summen (reine Funktionen, getestet)
│   └── fallback.js         Hinweis, falls die App nicht startet (z. B. per file://)
├── assets/
│   └── icons/              App-Icons
├── tests/
│   ├── unit/               Unit-Tests (node:test), darunter Kontrast- und Token-Prüfung
│   └── e2e/                End-to-End-Tests (Playwright): Hinzufügen/Wunschliste, Dunkelmodus/Rückgängig, Bild- und Shop-Link
├── .github/workflows/      Continuous Integration
├── package.json
└── tsconfig.json           strikte Typprüfung per JSDoc
```

## Datenschutz und Sicherheit

- **Lokale Datenhaltung:** Alles liegt in IndexedDB deines Browsers. Es gibt keinen Server und kein Konto. Jedes Gerät hat einen eigenen Kleiderschrank, zum Umziehen dienen Backup und Wiederherstellen.
- **Strikte Content-Security-Policy:** kein `unsafe-inline`, feste Liste erlaubter Verbindungen.
- **Nur zwei Einstellungen in `localStorage`:** die Wahl von Design und Bühne (damit sie vor dem ersten Zeichnen bereitsteht). Alles andere liegt in IndexedDB.
- **Eingabeprüfung:** Links werden validiert (nur `http(s)`, keine Zugangsdaten, keine privaten oder lokalen Adressen). Texte, Preise, Bilder und Backup-Dateien werden bereinigt.
- **Kein Backend:** Es gibt keinen Server, der angegriffen werden könnte.

### Externe Dienste

Nur das optionale **KI-Freistellen** lädt beim ersten Mal ein Modell (ca. 40 MB) von jsDelivr und staticimgly.com. Dabei werden keine deiner Daten gesendet. Wenn du **„Bild per Link laden“** benutzt, holt dein Browser das Bild direkt vom Server des Shops, der dabei deine IP-Adresse sieht. Gespeichert wird danach nur eine lokale Kopie, nie der Bildlink. Alles andere läuft ohne Netzwerkzugriff.

## Entwicklung

Voraussetzung: Node.js 20 oder neuer.

```bash
npm install                 # TypeScript und Playwright
npm run typecheck           # strikte Typprüfung (JSDoc)
npm test                    # Unit-Tests
npx playwright install chromium
npm run test:e2e            # End-to-End-Test, mobil und Desktop
```

Die Tests laufen bei jedem Push und Pull Request über GitHub Actions (`.github/workflows/ci.yml`).

### Architektur in Kürze

- **Kleine Module:** Jede Datei in `js/` hat eine Aufgabe. Veränderlicher Zustand liegt gebündelt in `core.js` (`state`).
- **Reine Logik getrennt von der Oberfläche:** `geometry.js`, `scraper.js` und `prices.js` enthalten keine DOM-Zugriffe und sind per Unit-Test abgedeckt.
- **Kein Build-Schritt:** klassische Skripte und ES-Module, direkt vom Browser ausgeführt.
- **Typsicherheit ohne TypeScript-Quellcode:** `geometry.js`, `scraper.js` und `prices.js` sind per JSDoc annotiert und werden mit `tsc --strict --checkJs` geprüft. Die Oberflächen-Module tragen `// @ts-nocheck` und werden vom End-to-End-Test abgedeckt. Sie nach und nach zu typisieren ist der nächste Schritt.
- **Persistenz:** IndexedDB mit verzögertem Speichern und sofortigem Sichern nach bewussten Aktionen.
- **Design-Tokens:** Jede Farbe steht genau einmal in `@layer tokens` als `light-dark(hell, dunkel)`. Das Dunkle folgt `color-scheme` (System) oder `data-theme` (Umschalter). Ältere Browser ohne `light-dark()` bekommen die hellen Werte; der Test `contrast.test.mjs` stellt sicher, dass beides übereinstimmt, dass nirgends sonst Farben stehen und dass die Kontraste halten.
- **Rückgängig ohne Sonderlogik:** `history.js` vergleicht nach jedem Sichern den Bestand mit dem letzten Stand und fasst schnelle Änderungen (z. B. Ziehen) zu einem Schritt zusammen. Bilder werden zwischen den Ständen geteilt, nicht kopiert. Bewusste Aktionen (Löschen, Einlesen) rufen `step()` für eine eigene Schrittgrenze.

## Roadmap

Der Plan folgt einem Konzept aus Bestandsaufnahme, Dunkelmodus und Funktionsideen. Alles, was ohne eigenen Server geht, kommt zuerst.

| Phase | Inhalt | Stand |
|---|---|---|
| **1 – Dunkelmodus und Feinschliff** | Dunkelmodus mit Bühne, Kontrast-Test, eigene Dialoge statt Browser-Dialogen, Rückgängig/Wiederholen, Bewegung, schnelleres Laden | fertig |
| **2 – Kernfunktionen** | Anprobe-Modus am Smartphone, Kalender mit Tragen-Protokoll und Kosten pro Tragen, Suche, Tags und Farberkennung, Mehrfach-Upload, Installierbarkeit (PWA) mit Teilen-Ziel, Datenmodell 2.0 mit Vorschaubildern | geplant |
| **3 – Erweiterungen** | Regel-Stylist mit Wetter, Kapselgarderobe und Packliste, Schrankhüter und Verkaufsentwurf, Kategorisierung per KI im Browser | geplant |

Was einen Server bräuchte (automatische Preisverfolgung, Abstimmung mit anderen, Konto-Sync), steht weiter unten.

Link-Import und Barcode-Scanner wurden entfernt, weil sie ohne eigenen Server nicht zuverlässig funktionieren: Browser dürfen fremde Shop-Seiten nicht direkt lesen, und öffentliche Abruf-Dienste werden von vielen Shops blockiert. Für Kleidung gibt es außerdem keine verlässliche freie Barcode-Datenbank. Der letzte Stand mit beiden Funktionen ist im Git-Verlauf unter dem Commit `95d3816` abrufbar (`git checkout 95d3816`).

### Automatische Preisverfolgung

Der Preisverlauf wird heute nur bei Änderungen geführt, die du selbst einträgst. Ein **automatischer Abruf aktueller Shop-Preise** ist ohne eigenen Server nicht zuverlässig möglich: Browser dürfen fremde Shop-Seiten nicht lesen, und im Hintergrund prüfen kann eine reine Webseite nur, solange sie geöffnet ist. Dafür wäre ein kleiner Backend-Dienst nötig (regelmäßiger Abruf der Produktseiten, Benachrichtigung bei Preissenkung). Das Datenmodell ist darauf vorbereitet: Der Dienst müsste nur neue Einträge in `priceHistory` ergänzen. Ob das den Aufwand eines Servers (Betrieb, Datenschutz, Kosten) wert ist, entscheidet sich nach dem Praxistest der manuellen Variante.
