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
| **Bild und Screenshot** | Per Dateiauswahl, Drag & Drop oder Einfügen aus der Zwischenablage. Preis und **Link zum Shop** werden immer am Teil gespeichert (fehlt „https://“, wird es ergänzt). Aktionen pro Teil (Bearbeiten, Angebot öffnen, Löschen) liegen am Smartphone im Drei-Punkte-Menü. |
| **Automatisches Freistellen** | Flood-Fill-Freistellung mit Toleranzregler. Ausschnitt per Ziehen anpassbar. |
| **Outfit-Fitter** | Teile ordnen sich beim Auflegen **direkt passend zueinander** an, ohne dass du Größe und Lage anpassen musst: Die App misst an den freigestellten Bildern, wie breit der Saum des Oberteils und der Bund der Hose sind, und skaliert die Hose so, dass beides zusammenpasst. Die Schuhe richten sich nach dem Hosensaum, die Jacke ist etwas weiter als das Oberteil, Accessoires stehen daneben. Das Ganze wird auf das Board gestreckt. Verstellst du etwas von Hand, bleibt dein Layout (auch nach dem Neuladen); **„Passend anordnen“** stellt die Passform jederzeit wieder her. Bei Bildern ohne Freistellung nimmt die App übliche Proportionen an. |
| **Anprobe-Board** | **Doppeltipp** (am Smartphone) oder Doppelklick (Maus) nimmt ein Teil vom Board, ebenso die Entf-Taste; ein Hinweis mit „Rückgängig“ holt es zurück. Verschieben, Skalieren und **Drehen aller Teile**: am Smartphone mit **zwei Fingern** (Spreizen = Größe, Verdrehen = Drehung), am Desktop per Mausrad, Griff, Regler und Tastatur. Ebenen per Schaltfläche oder Liste. |
| **Wunschliste und Preisverlauf** | Jedes Teil ist entweder „Besitze ich“ oder „Wunschliste“ (filterbar, mit Marke an der Karte, „Als gekauft markieren“ per Klick). Im Outfit zeigt die Summe zusätzlich, was **noch zu kaufen** ist. Jede Preisänderung wird mit Datum im **Preisverlauf** festgehalten; die Karte zeigt die letzte Änderung als ↓ oder ↑ in Prozent. Der Preis wird von Hand eingetragen (siehe Roadmap). |
| **Suche, Tags und Farbe** | Das Suchfeld im Kleiderschrank findet nach Name, Kategorie, Farbe, Tag, Status und Shop (alle Wörter müssen passen; Groß- und Kleinschreibung, ß und Akzente sind egal). **Tags** (z. B. „Büro, Sommer“) legst du beim Bearbeiten an und filterst sie über Chips unter den Kategorien. Die **Farbe** erkennt die App beim Hinzufügen aus dem Bild, ganz auf deinem Gerät, und du kannst sie ändern. |
| **Mehrere Bilder auf einmal** | Im Dialog „Neues Teil“ mehrere Bilder wählen (oder ablegen): Jedes wird freigestellt und mit Namen aus dem Dateinamen hinzugefügt, bis zu 30 auf einmal. Die Kategorie folgt dem aktiven Filter (erst „Schuhe“ antippen, dann hinzufügen). Ein Klick auf „Rückgängig“ nimmt alle wieder weg. |
| **Tragen-Protokoll und Kalender** | „Heute getragen“ an jedem gespeicherten Outfit, oder im **Kalender** (Gespeichert → „Kalender“, am Smartphone im Menü „⋯“) für beliebige Tage bis heute. Künftige Tage lassen sich mit einem gespeicherten Outfit **planen**. Die Karten zeigen, wie oft ein Teil getragen wurde und was ein Tragen **kostet** (Preis geteilt durch Tragetage). Die **Auswertung** nennt die am häufigsten getragenen Teile und die, die seit 90 Tagen oder nie dabei waren. Wunschlisten-Teile zählen nicht; ein Outfit zählt pro Tag nur einmal. Alles ist Teil von Backup und Rückgängig. |
| **Link einfügen, alles füllt sich** | Ein in das Feld „Produktlink“ eingefügter Link lädt sofort, am PC auch über „Laden“ oder Enter: Name, Preis, Währung, Farbe, Kategorie, Marke (als Tag) und Bild werden ausgefüllt, das Bild wird freigestellt. Passt das Bild nicht (etwa weil eine Person darauf zu sehen ist), zeigt ein Streifen alle weiteren Produktbilder des Shops zur Auswahl. Dahinter steckt ein kleiner eigener Cloudflare Worker (`worker/anprobe-worker.js`, Einrichtung in `worker/ANLEITUNG.md`), der nur die Produktdaten der Seite liest, nichts speichert und nur der eigenen App antwortet. Sperrt ein Shop automatische Abrufe, bleibt der Screenshot. |
| **Ideen: Outfit-Vorschläge** | Der Knopf „Ideen“ (am Smartphone im Menü „⋯“) schlägt drei Outfits aus deinem Schrank vor. Du wählst das Wetter (Kalt, Mild, Warm, Regen); bei Kälte und Regen gehört eine Jacke dazu, bei Wärme nicht. Die Auswahl folgt einfachen, nachvollziehbaren Regeln: Farben (ruhige Töne und höchstens ein Akzent), Tags, die du selbst vergibst („Winter“, „Sommer“, „Übergang“, „Regen“, „wasserdicht“), und was lange nicht getragen wurde. Jeder Vorschlag sagt, warum er gewählt wurde. „Aufs Board“ legt ihn aufs Board und ordnet die Teile passend an; „Andere Vorschläge“ würfelt neu. Wunschlisten-Teile kommen nicht vor. Es gibt keine Wetterabfrage und keine KI-Dienste, das Wetter wählst du selbst. |
| **Packliste** | Im selben Dialog: Für 1 bis 30 Tage und das gewählte Wetter stellt die App eine Kapselgarderobe aus deinem Schrank zusammen: wenige Teile, die sich gut kombinieren lassen (Basisteile zuerst, möglichst neutral, höchstens zwei Farbakzente). Du siehst, wie viele Outfits sich daraus ergeben und woran es fehlt, kannst die Teile abhaken und die Liste als Text kopieren. |
| **Verkaufstext** | In der Kalender-Auswertung bekommen „Lange nicht getragen“-Teile einen Knopf „Verkaufstext“. Die App entwirft eine Anzeige (Zustand, Größe, Versand wählbar) mit einem Preisvorschlag aus dem Kaufpreis (Neu 70 %, Sehr gut 55 %, Gut 45 %, Gebraucht 30 %). Der Text enthält nur, was die App sicher weiß; er behauptet nichts zum Tragen. Du kannst ihn vor dem Kopieren ändern. |
| **Schuhe** | Ist nur ein Schuh zu sehen, wird der zweite gespiegelt ergänzt. |
| **Outfits** | Speichern, laden und als PNG exportieren. Preissumme pro Outfit. |
| **Dunkelmodus** | Hell, Dunkel oder **Automatisch** (folgt dem System), umschaltbar oben rechts und gespeichert. Kachel und Board bleiben eine helle **Bühne**, damit dunkle Kleidungsstücke sichtbar bleiben; die Bühne des Boards lässt sich auf Hell, Mittel oder Dunkel stellen und wird auch im PNG-Export verwendet. Kontraste sind per Test abgesichert (Text mindestens 4,5:1, Feldränder mindestens 3:1). |
| **Rückgängig und Wiederholen** | Bis zu 50 Schritte für Kleiderschrank, Board und Outfits (Strg/Cmd + Z, Strg/Cmd + Umschalt + Z oder die Pfeile oben). Löschen und Backup-Einlesen fragen nicht mehr nach, sondern bieten stattdessen **„Rückgängig“** an. |
| **Backup** | Gesamten Bestand als JSON sichern und wiederherstellen, über das Konto-Menü oben rechts (Knopf „Anmelden“ bzw. dein Profilbild). Das Format bleibt über alle Versionen lesbar; Vorschaubilder gehören nicht hinein, sie entstehen beim Einlesen neu. |
| **Schnelle Karten** | Der Kleiderschrank zeigt kleine Vorschaubilder (längste Seite 480 Pixel) statt der vollen Bilder. Sie entstehen nach und nach im Hintergrund, bleiben gespeichert und werden ersetzt, wenn sich das Bild ändert. Board und PNG-Export nutzen weiter das volle Bild. Gespeichert wird jedes Teil einzeln: Wer ein Teil umbenennt, schreibt nicht mehr den ganzen Schrank neu. |
| **Mobil optimiert** | Bedienung mit dem Daumen: Schwebender „+“-Button, Dialoge als Bottom-Sheet, große Touch-Ziele, Unterstützung für Notch und Home-Indikator. Bewegung wird bei „Bewegung reduzieren“ des Systems abgeschaltet. Die Zurück-Taste und -Geste schließt zuerst den offenen Dialog. |
| **Google-Sicherung** | Optional: Anmeldung mit Google über den Knopf oben rechts (danach Profilbild mit Dropdown für Stand, Backup und Abmelden; abgemeldet bietet das Dropdown „Mit Google anmelden“, Backup und Wiederherstellen). Dein Stand liegt dann in einer versteckten Datei im App-Ordner deines Google Drive (nur Anprobe sieht sie) und ist auf jedem angemeldeten Gerät aktuell. Jede Änderung geht nach etwa einer Sekunde nach Google, Änderungen von anderen Geräten holt die App von selbst; einen Knopf zum Abgleichen gibt es nicht. Bei Unterschieden fragt die App: zusammenführen, Google übernehmen oder diesen Stand behalten. Das Backup bleibt zusätzlich möglich. Einrichtung: [worker/GOOGLE.md](worker/GOOGLE.md). |
| **Haptisches Feedback** | Auf Handy und Tablet: leichtes Tippen bei Bedienelementen und Auswahl, Muster bei Speichern (Erfolg), Löschen (Warnung) und Fehlern. Android über die Vibration API, iPhone (Safari ab 17.4) über einen unsichtbaren Schalter. Ein- und ausschaltbar unter „Mehr“, am Desktop nicht vorhanden. |
| **Offline und installierbar (PWA)** | Läuft nach dem ersten Laden auch ohne Netz. Auf dem iPhone über Teilen → „Zum Home-Bildschirm“ als eigene App, dann räumt Safari die Daten nicht mehr nach Tagen ab. Die Fußzeile zeigt, wann das letzte Backup war, und nach 30 Tagen erinnert ein Hinweis. Das Teilen-Ziel („An Anprobe senden“) gibt es auf dem iPhone nicht. |
| **Barrierefrei** | Tastaturbedienung, sinnvolle ARIA-Rollen und Live-Meldungen, sichtbarer Fokus. |

## Schnellstart

### Online nutzen (GitHub Pages)

Die App liegt im Repository-Hauptverzeichnis und läuft direkt auf GitHub Pages:

1. Repository öffnen → **Settings → Pages**
2. **Source:** *Deploy from a branch*, Branch `main`, Ordner `/ (root)`
3. Nach ein bis zwei Minuten erreichbar unter `https://<name>.github.io/<repository>/`

Zeigt die Seite noch eine alte Version, hilft ein harter Reload (`Strg/Cmd + Shift + R`).

**Version prüfen und aktualisieren:** Unten auf der Seite steht die Versionsnummer, daneben **„Nach Update suchen“**. Die App vergleicht sich außerdem selbst mit `version.json` und bietet ein Update an, wenn sie veraltet ist. „Aktualisieren“ lädt alle Dateien am Zwischenspeicher vorbei neu. Das ist besonders am iPhone nützlich, wo geöffnete Tabs und Startbildschirm-Apps tagelang alte Dateien behalten. Eine ältere Version ohne diese Anzeige muss einmal von Hand erneuert werden: Tab schließen und die Adresse neu öffnen, oder unter *Einstellungen → Safari → Verlauf und Websitedaten löschen*.
Bei jeder Veröffentlichung die Version in `package.json`, `version.json` und `js/version.js` gemeinsam hochzählen (der Unit-Test `version.test.mjs` prüft das).

### Ohne Hosting ausprobieren

Die App besteht nur aus statischen Dateien und braucht keinen eigenen Server. Für einen schnellen lokalen Test genügt jeder Datei-Server im Projektordner, zum Beispiel `npx serve` oder `python3 -m http.server 8000`. Die Seite bitte über `http://localhost` öffnen und nicht per Doppelklick auf `index.html`, weil Browser ES-Module bei `file://` blockieren.

## Projektstruktur

```
.
├── index.html              Seitengerüst und Content-Security-Policy
├── version.json            Versionsnummer für den Update-Hinweis
├── manifest.webmanifest    Name, Symbole und Farben für die Installation als App
├── sw.js                   Service Worker: Offline-Speicher pro Version (Versionsnummer wie in version.json)
├── SECURITY.md             Sicherheitskonzept, Meldeweg, Einstellungen auf GitHub
├── package-lock.json       festgelegte Versionen der Entwicklungswerkzeuge (mit Prüfsummen)
├── css/
│   └── styles.css          Styles in Cascade Layers, alle Farben als Design-Tokens
├── js/
│   ├── main.js             Einstieg: lädt die Module, startet die App
│   ├── core.js             gemeinsamer Zustand, Konstanten, Helfer
│   ├── storage.js          Speicher (IndexedDB): Teile einzeln, Umstellung vom alten Format, Fehlermeldungen
│   ├── model.js            Speicherformat 2: Änderungsliste, Zerlegen und Zusammensetzen (reine Logik)
│   ├── thumbs.js           Vorschaubilder im Hintergrund erzeugen und speichern
│   ├── shopdata.js         Daten aus dem Hilfsdienst prüfen, Kategorie und Farbe erkennen (reine Logik)
│   ├── config.js           Adresse des Hilfsdienstes (leer = Funktion aus)
│   ├── linkfetch.js        Produktdaten und Bild über den Hilfsdienst holen
│   ├── stylist.js          Regel-Stylist: Outfit-Vorschläge nach Wetter, Farben, Tags (reine Logik)
│   ├── packing.js          Packliste / Kapselgarderobe (reine Logik)
│   ├── sale.js             Verkaufstext und Preisvorschlag (reine Logik)
│   ├── ideas.js            Dialog „Ideen“ (Vorschläge und Packliste)
│   ├── sell.js             Dialog „Verkaufstext“
│   ├── clip.js             Text in die Zwischenablage kopieren
│   ├── image.js            Bildverarbeitung: Freistellen, Zuschnitt, Schuhpaare
│   ├── dialog.js           Dialog „Teil hinzufügen / bearbeiten“
│   ├── wardrobe.js         Kleiderschrank: Filter, Karten, Drei-Punkte-Menü
│   ├── board.js            Board: auflegen, verschieben, skalieren, Ebenen
│   ├── rotation.js         Drehen und Positionieren (Griff, Regler)
│   ├── gestures.js         Zwei-Finger-Geste (Touch)
│   ├── haptics.js          Haptisches Feedback (Android, iPhone)
│   ├── cloud.js            Google-Sicherung (Abgleich mit Google Drive, Anmeldung)
│   ├── cloudauth.js        Bausteine der Anmeldung (PKCE, Adressen)
│   ├── syncmerge.js        Zusammenführen zweier Stände
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
│   ├── fit.js              Outfit-Fitter: Rechnung der Passform (reine Funktionen, getestet)
│   ├── fitter.js           Outfit-Fitter: Messung am Bild, Anwenden aufs Board, Knopf
│   ├── sheet.js            Dialoge: sanftes Schließen, Antippen daneben, Wisch-Griff am Bottom-Sheet
│   ├── update.js           Versionsanzeige und Update-Hinweis
│   ├── care.js             Backup-Erinnerung und Installationshinweis (reine Logik)
│   ├── color.js            Farbname aus Pixeln (reine Funktion, getestet)
│   ├── search.js           Suche, Tags, Normalisierung (reine Funktionen, getestet)
│   ├── intake.js           Namensvorschlag aus Dateinamen (reine Funktion, getestet)
│   ├── batch.js            Mehrere Bilder auf einmal hinzufügen
│   ├── wear.js             Tragen-Protokoll, Kalenderraster, Kosten pro Tragen, Prüfung beim Einlesen (reine Funktionen, getestet)
│   ├── wearlog.js          Eintragen eines Outfits für einen Tag (mit Rückgängig)
│   ├── calendar.js         Dialog Kalender und Auswertung
│   ├── pwa.js              Service Worker anmelden, Backup-Zeile und Hinweise
│   ├── version.js          Versionsnummer, Prüfung von Versionen, Auswahl der Dateien beim Aktualisieren (getestet)
│   └── fallback.js         Hinweis, falls die App nicht startet (z. B. per file://)
├── assets/
│   └── icons/              App-Icons (auch maskierbar und für den iPhone-Home-Bildschirm)
├── tests/
│   ├── unit/               Unit-Tests (node:test), darunter Kontrast- und Token-Prüfung
│   └── e2e/                End-to-End-Tests (Playwright): Hinzufügen/Wunschliste, Dunkelmodus/Rückgängig, Bild- und Shop-Link, Outfit-Fitter, Doppeltipp, Update-Hinweis, Bewegung und Touch-Verhalten, Offline und Installation, Kalender, Suche und Mehrfach-Upload, Sicherheit
├── .github/workflows/      Continuous Integration
├── package.json
└── tsconfig.json           strikte Typprüfung per JSDoc
```

## Datenschutz und Sicherheit

- **Lokale Datenhaltung:** Alles liegt in IndexedDB deines Browsers. Es gibt keinen Server und kein Konto. Jedes Gerät hat einen eigenen Kleiderschrank, zum Umziehen dienen Backup und Wiederherstellen.
- **Strikte Content-Security-Policy:** kein `unsafe-inline`, kein `unsafe-eval`, feste Liste erlaubter Verbindungen. Ein Test erzwingt sie.
- **Nur zwei Einstellungen in `localStorage`:** die Wahl von Design und Bühne (damit sie vor dem ersten Zeichnen bereitsteht). Alles andere liegt in IndexedDB.
- **Eingabeprüfung:** Links werden validiert (nur `http(s)`, keine Zugangsdaten, keine privaten oder lokalen Adressen). Texte, Preise, Bilder und Backup-Dateien werden bereinigt: Ein Backup wird nur mit eingebetteten Bildern gelesen (keine Adressen, kein SVG), Größe und Menge sind begrenzt, ungültige oder doppelte Teile werden übersprungen und gemeldet. Bilder über 25 MB werden abgelehnt.
- **Kein Backend:** Es gibt keinen Server, der angegriffen werden könnte.
- **Kein fremder Code:** Die App lädt keine Skripte von fremden Servern und nutzt kein `eval` (strenge Content-Security-Policy, Rahmen sind nicht erlaubt).
- **Lieferkette:** GitHub-Actions auf festen Commits, Lockfile mit Prüfsummen, Dependabot, CodeQL und `npm audit`.

Alle Maßnahmen, die Einstellungen auf GitHub (Branch-Schutz, Secret Scanning, …) und die Meldung von Schwachstellen stehen in [SECURITY.md](SECURITY.md).

### Externe Dienste

Das Freistellen läuft komplett auf deinem Gerät. Wenn du **„Bild per Link laden“** benutzt, holt dein Browser das Bild direkt vom Server des Shops, der dabei deine IP-Adresse sieht. Gespeichert wird danach nur eine lokale Kopie, nie der Bildlink. Alles andere läuft ohne Netzwerkzugriff.

## Entwicklung

Voraussetzung: Node.js 20 oder neuer.

```bash
npm install                 # TypeScript und Playwright
npm run typecheck           # strikte Typprüfung (JSDoc)
npm test                    # Unit-Tests
npx playwright install chromium webkit
npm run test:e2e            # End-to-End-Tests, mobil und Desktop (Chromium)
BROWSER=webkit npm run test:e2e   # dieselben Tests in der Safari-Engine
```

Die Tests laufen bei jedem Push und Pull Request über GitHub Actions (`.github/workflows/ci.yml`), und zwar in Chromium **und** WebKit (Safari-Engine, wie auf dem iPhone).

### Architektur in Kürze

- **Kleine Module:** Jede Datei in `js/` hat eine Aufgabe. Veränderlicher Zustand liegt gebündelt in `core.js` (`state`).
- **Reine Logik getrennt von der Oberfläche:** `geometry.js`, `scraper.js`, `prices.js`, `fit.js`, `care.js`, `wear.js`, `color.js`, `search.js`, `intake.js`, `model.js`, `stylist.js`, `packing.js`, `sale.js` und `shopdata.js` enthalten keine DOM-Zugriffe und sind per Unit-Test abgedeckt.
- **Kein Build-Schritt:** klassische Skripte und ES-Module, direkt vom Browser ausgeführt.
- **Typsicherheit ohne TypeScript-Quellcode:** `geometry.js`, `scraper.js`, `prices.js` und `fit.js` sind per JSDoc annotiert und werden mit `tsc --strict --checkJs` geprüft. Die Oberflächen-Module tragen `// @ts-nocheck` und werden vom End-to-End-Test abgedeckt. Sie nach und nach zu typisieren ist der nächste Schritt.
- **Persistenz:** IndexedDB (Version 2) mit verzögertem Speichern und sofortigem Sichern nach bewussten Aktionen. Jedes Teil liegt einzeln im Store `items`, der Rest (Reihenfolge, Outfits, Protokoll, Pläne, Board) als kleiner Datensatz unter `kv.s`, Vorschaubilder im Store `thumbs`. Beim Speichern wird nur geschrieben, was sich geändert hat, in einer Transaktion. Schlägt das fehl (etwa wegen Platzmangel), steht eine Meldung in der Oberfläche, und der nächste Versuch holt es nach.
- **Umstellung vom alten Format:** Beim ersten Start mit Version 1.7 werden vorhandene Daten in einer einzigen Transaktion umgestellt: Entweder ist alles umgestellt, oder es bleibt alles beim Alten. Dazu legt die App 14 Tage lang eine Kopie des alten Formats an (`kv.s_v1`); reicht der Platz dafür nicht, wird ohne Kopie umgestellt. Hält ein anderer Tab noch eine ältere Version offen, wartet die App und sagt es.
- **Design-Tokens:** Jede Farbe steht genau einmal in `@layer tokens` als `light-dark(hell, dunkel)`. Das Dunkle folgt `color-scheme` (System) oder `data-theme` (Umschalter). Ältere Browser ohne `light-dark()` bekommen die hellen Werte; der Test `contrast.test.mjs` stellt sicher, dass beides übereinstimmt, dass nirgends sonst Farben stehen und dass die Kontraste halten.
- **Bewegung und Touch:** Einheitliche Kurven und Zeiten als Tokens (`--ease-out`, `--ease-sheet`, `--t-press` …). Bewegung dient der Rückmeldung (Druck, Ein- und Ausblenden) und endet unter 300 ms. Hover-Stile gelten nur mit Maus (`@media (hover: hover) and (pointer: fine)`), auf dem Handy zeigt `:active` den Druck an, sodass nichts hängen bleibt. Bei „Bewegung reduzieren“ entfallen Skalierung und Verschiebung, Dialoge schließen sofort. Das Bottom-Sheet lässt sich am Griff wegwischen (Geschwindigkeit zählt, nicht nur die Strecke). Die Gestaltung folgt den Regeln aus [emilkowalski/skills](https://github.com/emilkowalski/skills).
- **Rückgängig ohne Sonderlogik:** `history.js` vergleicht nach jedem Sichern den Bestand mit dem letzten Stand und fasst schnelle Änderungen (z. B. Ziehen) zu einem Schritt zusammen. Bilder werden zwischen den Ständen geteilt, nicht kopiert. Bewusste Aktionen (Löschen, Einlesen) rufen `step()` für eine eigene Schrittgrenze.

## Roadmap

Der Plan folgt einem Konzept aus Bestandsaufnahme, Dunkelmodus und Funktionsideen. Alles, was ohne eigenen Server geht, kommt zuerst.

| Phase | Inhalt | Stand |
|---|---|---|
| **1 – Dunkelmodus und Feinschliff** | Dunkelmodus mit Bühne, Kontrast-Test, eigene Dialoge statt Browser-Dialogen, Rückgängig/Wiederholen, Bewegung, schnelleres Laden | fertig |
| **2 – Kernfunktionen** | Anprobe-Modus am Smartphone, ~~Kalender mit Tragen-Protokoll und Kosten pro Tragen~~ (fertig), ~~Suche, Tags und Farberkennung, Mehrfach-Upload~~ (fertig), ~~Installierbarkeit (PWA)~~ (fertig; das Teilen-Ziel entfällt, iOS kennt es nicht), ~~Datenmodell 2.0 mit Vorschaubildern~~ (fertig) | bis auf den Anprobe-Modus fertig |
| **3 – Erweiterungen** | ~~Regel-Stylist mit Wetter~~, ~~Kapselgarderobe und Packliste~~, ~~Schrankhüter und Verkaufsentwurf~~ (fertig), Kategorisierung per KI im Browser (nur lokal, als Farberkennung umgesetzt) | größtenteils fertig |

Was einen Server bräuchte (automatische Preisverfolgung, Abstimmung mit anderen, Konto-Sync), steht weiter unten.

Link-Import und Barcode-Scanner wurden entfernt, weil sie ohne eigenen Server nicht zuverlässig funktionieren: Browser dürfen fremde Shop-Seiten nicht direkt lesen, und öffentliche Abruf-Dienste werden von vielen Shops blockiert. Für Kleidung gibt es außerdem keine verlässliche freie Barcode-Datenbank. Der letzte Stand mit beiden Funktionen ist im Git-Verlauf unter dem Commit `95d3816` abrufbar (`git checkout 95d3816`).

### Automatische Preisverfolgung

Der Preisverlauf wird heute nur bei Änderungen geführt, die du selbst einträgst. Ein **automatischer Abruf aktueller Shop-Preise** ist ohne eigenen Server nicht zuverlässig möglich: Browser dürfen fremde Shop-Seiten nicht lesen, und im Hintergrund prüfen kann eine reine Webseite nur, solange sie geöffnet ist. Dafür wäre ein kleiner Backend-Dienst nötig (regelmäßiger Abruf der Produktseiten, Benachrichtigung bei Preissenkung). Das Datenmodell ist darauf vorbereitet: Der Dienst müsste nur neue Einträge in `priceHistory` ergänzen. Ob das den Aufwand eines Servers (Betrieb, Datenschutz, Kosten) wert ist, entscheidet sich nach dem Praxistest der manuellen Variante.
