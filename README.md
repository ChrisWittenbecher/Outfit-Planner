<div align="center">

# Anprobe

**Der Outfit-Planer für das Web.** Sammle Kleidungsstücke per Link, Barcode oder Screenshot, kombiniere sie zu Outfits und behalte Preise und Angebote im Blick.

[**Live-Demo**](https://chriswittenbecher.github.io/Outfit-Planner/) · [Funktionen](#funktionen) · [Schnellstart](#schnellstart) · [Datenschutz](#datenschutz-und-sicherheit) · [Entwicklung](#entwicklung)

</div>

---

## Überblick

Anprobe ist eine statische Web-App ohne Build-Schritt, ohne Konto und ohne Tracking. Sie läuft auf dem Smartphone genauso wie am Desktop und speichert alle Daten ausschließlich im Browser des Geräts.

Der typische Ablauf:

1. **Hinzufügen:** Über **„+ Kleidungsstück hinzufügen“** wählst du Link, Barcode oder Bild.
2. **Freistellen:** Der Hintergrund wird automatisch entfernt, das Bild auf das Teil zugeschnitten.
3. **Kombinieren:** Teile auf dem Anprobe-Board verschieben, skalieren, drehen und stapeln.
4. **Vergleichen:** Preise, Gesamtsumme und der Link zum Angebot stehen direkt am Outfit.

## Funktionen

| Bereich | Beschreibung |
|---|---|
| **Link-Import** | Liest Name, Produktbild und Preis aus Shop-Links (Open Graph, JSON-LD, Produktdaten). Bereinigt Titel, erkennt die Kategorie und zieht bei Modellfotos das Produktbild vor. Eindeutige Treffer landen direkt im Kleiderschrank, mit **Rückgängig**. |
| **Barcode-Scanner** | Liest EAN-8, UPC-A, EAN-13 und GTIN-14 per Kamera (inklusive Prüfziffer). Ohne Kamera oder Berechtigung gibst du die Nummer von Hand ein. |
| **Bild und Screenshot** | Per Dateiauswahl, Drag & Drop oder Einfügen aus der Zwischenablage. |
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

### Lokal starten (empfohlen für den Link-Import)

Voraussetzung ist Python 3.

```bash
python3 server/server.py          # öffnet http://localhost:8000
python3 server/server.py 8080     # anderer Port
```

Der lokale Server liefert die Seite aus und ruft Produktseiten selbst ab. Dadurch sind keine öffentlichen Abruf-Dienste nötig, und mehr Shops funktionieren. Die Seite bitte über den Server öffnen, nicht per Doppelklick auf `index.html`, weil Browser ES-Module bei `file://` blockieren.

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
│   ├── scraper.js          Link-Prüfung, Produktdaten lesen und bereinigen
│   ├── barcode.js          GTIN-Prüfziffern und Normalisierung
│   └── scanner.js          Kamera und Erkennung (BarcodeDetector, ZXing)
├── assets/
│   └── icons/              App-Icons
├── server/
│   └── server.py           lokaler Server mit gesichertem Abruf (/api/raw)
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
- **Eingabeprüfung:** Links werden validiert (nur `http(s)`, keine Zugangsdaten, keine privaten oder lokalen Adressen, Port-Allowlist). Importierte Texte, Preise, Bilder und Backup-Dateien werden bereinigt.
- **Abgesicherter lokaler Server:** Der Abruf-Endpunkt lauscht nur auf `127.0.0.1`, prüft jede Weiterleitung gegen private Adressen (SSRF-Schutz) und lehnt fremde Ursprünge ab.

### Externe Dienste (nur bei Bedarf)

| Wann | Dienst | Übermittelt |
|---|---|---|
| Link-Import auf GitHub Pages | allorigins.win (Seite), wsrv.nl (Bild) | die Link-Adresse, nach einmaliger Zustimmung |
| KI-Freistellen | jsDelivr, staticimgly.com | nichts, nur Download des Modells (ca. 40 MB) |
| Barcode ohne eingebaute Erkennung | jsDelivr (ZXing, feste Version) | nichts, nur Download der Bibliothek |
| Barcode-Produktsuche | Open Products / Beauty / Food Facts | die Barcode-Nummer |

## Bekannte Grenzen

- Manche Shops blockieren automatische Abrufe (Bot-Schutz). Die App meldet das und empfiehlt einen Screenshot. Lokal mit `server/server.py` klappt es häufiger.
- Preise sind nur so zuverlässig wie die Produktdaten der Seite und sollten vor dem Kauf geprüft werden.
- Für Kleidung gibt es keine verlässliche freie Barcode-Datenbank. Ohne Treffer ergänzt du Bild und Namen im Dialog, die Nummer bleibt am Teil gespeichert.
- Der Kamerazugriff erfordert `https` oder `localhost`.

## Entwicklung

Voraussetzungen: Node.js 20 oder neuer und Python 3.

```bash
npm install                 # TypeScript und Playwright
npm run typecheck           # strikte Typprüfung (JSDoc)
npm test                    # Unit-Tests
npx playwright install chromium
npm run test:e2e            # End-to-End-Tests, mobil und Desktop
```

Die Tests laufen bei jedem Push und Pull Request über GitHub Actions (`.github/workflows/ci.yml`).

### Architektur in Kürze

- **Reine Logik getrennt von der Oberfläche:** `geometry.js`, `scraper.js` und `barcode.js` enthalten keine DOM-Zugriffe und sind per Unit-Test abgedeckt.
- **Kein Build-Schritt:** klassische Skripte und ES-Module, direkt vom Browser ausgeführt.
- **Typsicherheit ohne TypeScript-Quellcode:** JSDoc-Annotationen werden mit `tsc --strict --checkJs` geprüft.
- **Persistenz:** IndexedDB mit verzögertem Speichern und sofortigem Sichern nach bewussten Aktionen.
