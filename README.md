# Anprobe – Outfit-Planer

Sammle Kleidungsstücke aus Screenshots, Shop-Links oder Barcodes in einem digitalen Kleiderschrank und kombiniere sie zu Outfits. Preise und Links zu den Angeboten bleiben an jedem Teil gespeichert.

Die App ist eine reine Web-App (HTML, CSS, JavaScript) ohne Build-Schritt, ohne Konto und ohne Tracking. Alle deine Daten bleiben im Browser.

## So kommt die Seite auf GitHub Pages

1. Entpacke das ZIP und öffne den entpackten Ordner.
2. Öffne dein Repository auf github.com → **Add file → Upload files**.
3. Markiere **alles im Ordner** (`index.html`, `css`, `js`, `assets`, …) und ziehe es in das Upload-Fenster. Wichtig: den *Inhalt* ziehen, nicht den Ordner selbst. `index.html` muss im Hauptverzeichnis des Repos landen.
4. Unten auf **Commit changes** klicken.
5. Im Repo **Settings → Pages**: Source **Deploy from a branch**, Branch `main`, Ordner `/ (root)`, speichern.
6. Nach ein bis zwei Minuten läuft die Seite unter `https://DEIN-NAME.github.io/REPO-NAME/`.

Alte Dateien im Repo (zum Beispiel eine frühere `index.html` oder der Ordner `extension/`) werden durch den Upload nicht automatisch gelöscht. Entferne sie bei Bedarf einzeln (Datei öffnen → Papierkorb-Symbol).

Zeigt die Seite noch die alte Version, lade sie mit Strg/Cmd + Shift + R neu.

## Funktionen

- **Teile hinzufügen:** Screenshot einfügen (Strg/Cmd + V), per Drag & Drop, über die Dateiauswahl, per Produktlink oder per Barcode
- **Automatisch freistellen:** Der Hintergrund wird entfernt und das Bild auf das Kleidungsstück zugeschnitten. Im Original kannst du einen Bereich aufziehen. Der Regler „Toleranz“ steuert, wie viel Hintergrund und Schatten verschwindet. Für schwierige Bilder gibt es „KI-Freistellen“.
- **Produkt per Link:** Name, Bild und Preis werden ausgelesen. Ist alles eindeutig, landet das Teil direkt im Kleiderschrank, mit einer Meldung samt **Rückgängig** und **Bearbeiten**. Sonst öffnet sich der Dialog zur Prüfung.
- **Barcode-Scanner:** Die Handykamera liest EAN-8, UPC-A, EAN-13 (Prüfziffer wird kontrolliert). Ohne Kamera oder ohne Erlaubnis gibst du die Nummer von Hand ein.
- **Preis und Link:** Jedes Teil speichert Preis, Währung und den Link zum Angebot (sichtbar an der Karte). Unter dem Board siehst du alle Preise und die Summe.
- **Anprobe-Board:** Teile anklicken, verschieben, mit dem Mausrad oder +/− skalieren.
- **Drehen und Positionieren (alle Teile):** Runder Griff am Teil (Maus oder Finger, Shift = 15°-Schritte), Regler für Drehung und Position, Tasten `[` und `]` (drehen) und Pfeiltasten (schieben).
- **Ebenen:** Schuhe liegen standardmäßig hinter der Hose. Änderbar mit „Nach vorn“/„Nach hinten“ oder ▲▼ in der Ebenenliste.
- **Schuhe:** Zeigt das Bild nur einen Schuh, wird ein gespiegelter zweiter ergänzt (abschaltbar).
- **Outfits speichern**, laden, als PNG exportieren
- **Backup und Wiederherstellen:** Alles als JSON-Datei sichern

## Wo liegen meine Daten?

Alles liegt **nur im Browser** deines Geräts (IndexedDB), nichts auf GitHub oder einem Server.

- Jedes Gerät und jede Adresse hat einen **eigenen** Kleiderschrank.
- Löschst du die Browserdaten, ist der Schrank weg. Mach regelmäßig ein **Backup**.
- Zum Umziehen auf ein anderes Gerät: dort „Backup“, auf dem Ziel „Wiederherstellen“.

## Externe Dienste (nur bei Bedarf)

| Wann | Dienst | Was wird gesendet |
|---|---|---|
| Produktlink auf GitHub Pages | allorigins.win (Seite), wsrv.nl (Bild) | die Link-Adresse. Vorher fragt die Seite einmalig um Erlaubnis. |
| „KI-Freistellen“ | jsDelivr, staticimgly.com | nichts außer dem Laden des Modells (ca. 40 MB) |
| Barcode ohne eingebaute Erkennung | jsDelivr (ZXing, feste Version) | nichts, nur das Laden der Bibliothek |
| Barcode-Produktsuche | Open Products/Beauty/Food Facts | die Barcode-Nummer |

Mit `python3 server.py` (lokal) ruft dein Rechner Produktseiten selbst ab, dann sind allorigins.win und wsrv.nl nicht nötig.

**Grenzen:**

- Manche Shops blockieren automatische Abrufe. Dann hilft ein Screenshot.
- Preise sind nur so zuverlässig wie die Produktdaten der Seite. Prüfe sie vor dem Verlassen darauf.
- Für **Kleidung** gibt es keine verlässliche kostenlose Barcode-Datenbank. Die offenen Datenbanken kennen vor allem Lebensmittel und Kosmetik. Ohne Treffer öffnet sich der Dialog mit dem Barcode, und du ergänzt Bild und Namen. Der Barcode bleibt am Teil gespeichert.
- Die Kamera funktioniert nur über https oder localhost (GitHub Pages ist https).

## Lokal starten (optional)

```bash
python3 server.py          # öffnet http://localhost:8000
python3 server.py 8080     # anderer Port
```

Öffne die Seite über den Server (oder GitHub Pages), **nicht** per Doppelklick auf `index.html`: Browser blockieren ES-Module bei `file://`. In diesem Fall zeigt die Seite einen Hinweis.

## Projektstruktur

```
index.html          Seitengerüst (semantisches HTML, Content-Security-Policy)
css/styles.css      Styles in Cascade Layers (reset → tokens → base → layout → components → modules → utilities)
js/app.js           Anwendungslogik
js/main.js          lädt die ES-Module und stellt window.Anprobe bereit
js/geometry.js      Drehen und Positionieren (reine Mathematik)
js/scraper.js       Link-Prüfung, Auslesen und Bereinigen von Produktdaten, Backup-Prüfung
js/barcode.js       Barcode-Prüfziffer (EAN-8, UPC-A, EAN-13, GTIN-14)
js/scanner.js       Kamera und Erkennung (eingebaute API, sonst ZXing)
assets/icons/       App-Icons
tests/              Unit-Tests
server.py           optionaler lokaler Server (Link-Import ohne Fremddienste)
```

## Sicherheit

- **Strenge Content-Security-Policy:** keine Inline-Skripte, keine Inline-Styles, kein `eval`. Skripte kommen nur aus der eigenen Seite und von jsDelivr, Netzwerkzugriffe gehen nur an die oben genannten Dienste.
- **Eingaben werden geprüft, bevor sie in die App gelangen:**
  - Links: nur `http(s)`, keine Zugangsdaten (`user:pw@`), keine lokalen oder internen Adressen (localhost, 192.168.x.x, 169.254.x.x …), nur übliche Ports, höchstens 2048 Zeichen.
  - Produktdaten aus Webseiten: Tags und Steuerzeichen entfernt, Texte gekürzt, Preise auf 0 bis 100 000 begrenzt, Währungen nur aus einer festen Liste, Bild-Adressen nur `http(s)`.
  - Barcodes: nur Ziffern, Länge und Prüfziffer müssen stimmen, beim Scannen muss der Code zweimal hintereinander erkannt werden.
  - Backup-Dateien: ungültige Einträge werden verworfen, Werte begrenzt, nur Rasterbilder erlaubt (kein SVG).
- Texte aus fremden Quellen werden nur als Text angezeigt, nie als HTML.
- Abrufe laufen ohne Cookies, ohne Referrer, mit Zeitlimit und Größenbegrenzung.
- Die Kamera wird beendet, sobald der Dialog schließt, ein Code erkannt wird oder der Tab in den Hintergrund geht.

## Barrierefreiheit

Semantische Bereiche, „Zum Inhalt springen“-Link, sichtbarer Tastaturfokus, Dialoge mit Titel, Statusmeldungen für Bildschirmleser, Karten, Ebenenliste, Drehgriff und Scanner per Tastatur bedienbar, Touch-Ziele ab 40 px bei Hauptaktionen.

## Tests

```bash
node --test tests/*.test.mjs        # 25 Unit-Tests (Geometrie, Barcode, Eingabeprüfung)
npx -p typescript tsc -p tsconfig.json   # strikte Typprüfung der Module
```

Die Module sind mit JSDoc typisiert und bestehen `tsc --strict --checkJs`.

## Bedienung im Überblick

| Aktion | So geht's |
|---|---|
| Teil zum Outfit hinzufügen oder entfernen | Karte im Kleiderschrank anklicken |
| Produkt per Link importieren | Link in „Produkt per Link hinzufügen“ einfügen, Importieren |
| Barcode scannen | „Barcode scannen“, Kamera erlauben, Code ins Rechteck halten |
| Teil verschieben | auf dem Board ziehen |
| Teil drehen | runden Griff ziehen (Shift = 15°), Regler „Drehung“, `[` / `]` oder +15° / −15° |
| Teil exakt verschieben | Regler „Position“ oder Pfeiltasten (Shift = 10 px) |
| Größe ändern | Mausrad oder Buttons + und − |
| Ebene ändern | „Nach vorn“, „Nach hinten“ oder ▲▼ in der Liste |
| Teil vom Board entfernen | Doppelklick oder Entf |
| Auswahl aufheben | Klick ins Leere oder Esc |
| Teil bearbeiten (Name, Kategorie, Preis, Link, Zuschnitt) | Stift-Symbol auf der Karte |
| Aktion rückgängig machen | „Rückgängig“ in der Meldung nach dem Hinzufügen |

## Fehlerbehebung

- **Seite zeigt 404:** `index.html` muss im Hauptverzeichnis des Repos liegen und genau so heißen.
- **Seite ist leer oder zeigt „Module konnten nicht geladen werden“:** Die Ordner `js/`, `css/` und `assets/` müssen mit hochgeladen sein. Lokal über `python3 server.py` öffnen.
- **Alte Version sichtbar:** Mit Strg/Cmd + Shift + R neu laden.
- **Schrank ist leer:** Du bist auf einer anderen Adresse oder einem anderen Gerät. Stelle ein Backup wieder her.
- **Kamera startet nicht:** Erlaube die Kamera in den Browser-Einstellungen. Wird sie von einer anderen App benutzt, schließe diese. Sonst gib die Nummer unter dem Barcode ein.
- **Link lädt kein Bild oder keinen Preis:** Der Shop blockiert den Abruf, oder der Preis steht nicht in den Produktdaten der Seite. Mach einen Screenshot und trage den Preis ein.
- **Reste vom Hintergrund oder Schatten:** Toleranz erhöhen (etwa 45), ein Stück im Original markieren oder „KI-Freistellen“ nutzen.
