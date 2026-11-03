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
| **Bild und Screenshot** | Per Dateiauswahl, Drag & Drop oder Einfügen aus der Zwischenablage. Preis und Link zum Angebot werden am Teil gespeichert. |
| **Automatisches Freistellen** | Flood-Fill-Freistellung mit Toleranzregler, optional KI-Freistellen für schwierige Bilder. Ausschnitt per Ziehen anpassbar. |
| **Anprobe-Board** | Verschieben, Skalieren und **Drehen aller Teile** (Griff, Regler, Tastatur), Ebenen per Schaltfläche oder Liste. |
| **Schuhe** | Ist nur ein Schuh zu sehen, wird der zweite gespiegelt ergänzt. |
| **Outfits** | Speichern, laden und als PNG exportieren. Preissumme pro Outfit. |
| **Backup** | Gesamten Bestand als JSON sichern und wiederherstellen. |
| **Mobil optimiert** | Bedienung mit dem Daumen: Schwebender „+“-Button, Dialoge als Bottom-Sheet, große Touch-Ziele, Unterstützung für Notch und Home-Indikator. |
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
│   └── styles.css          Styles in Cascade Layers
├── js/
│   ├── main.js             lädt die ES-Module, stellt window.Anprobe bereit
│   ├── app.js              Oberfläche und Anwendungslogik
│   ├── geometry.js         Drehen und Positionieren (reine Funktionen)
│   └── scraper.js          Eingabeprüfung und Bereinigung (Texte, Preise, Links, Backups)
├── assets/
│   └── icons/              App-Icons
├── tests/
│   ├── unit/               Unit-Tests (node:test)
│   └── e2e/                End-to-End-Tests (Playwright)
├── .github/workflows/      Continuous Integration
├── package.json
└── tsconfig.json           strikte Typprüfung per JSDoc
```

## Datenschutz und Sicherheit

- **Lokale Datenhaltung:** Alles liegt in IndexedDB deines Browsers. Es gibt keinen Server und kein Konto. Jedes Gerät hat einen eigenen Kleiderschrank, zum Umziehen dienen Backup und Wiederherstellen.
- **Strikte Content-Security-Policy:** kein `unsafe-inline`, feste Liste erlaubter Verbindungen.
- **Eingabeprüfung:** Links werden validiert (nur `http(s)`, keine Zugangsdaten, keine privaten oder lokalen Adressen). Texte, Preise, Bilder und Backup-Dateien werden bereinigt.
- **Kein Backend:** Es gibt keinen Server, der angegriffen werden könnte.

### Externe Dienste

Nur das optionale **KI-Freistellen** lädt beim ersten Mal ein Modell (ca. 40 MB) von jsDelivr und staticimgly.com. Dabei werden keine deiner Daten gesendet. Alles andere läuft ohne Netzwerkzugriff.

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

- **Reine Logik getrennt von der Oberfläche:** `geometry.js` und `scraper.js` enthalten keine DOM-Zugriffe und sind per Unit-Test abgedeckt.
- **Kein Build-Schritt:** klassische Skripte und ES-Module, direkt vom Browser ausgeführt.
- **Typsicherheit ohne TypeScript-Quellcode:** JSDoc-Annotationen werden mit `tsc --strict --checkJs` geprüft.
- **Persistenz:** IndexedDB mit verzögertem Speichern und sofortigem Sichern nach bewussten Aktionen.

## Roadmap

Link-Import und Barcode-Scanner wurden entfernt, weil sie ohne eigenen Server nicht zuverlässig funktionieren: Browser dürfen fremde Shop-Seiten nicht direkt lesen, und öffentliche Abruf-Dienste werden von vielen Shops blockiert. Für Kleidung gibt es außerdem keine verlässliche freie Barcode-Datenbank. Der letzte Stand mit beiden Funktionen ist im Branch `archive-link-barcode` abrufbar.
