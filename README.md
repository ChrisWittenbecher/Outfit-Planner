# Anprobe – Outfit-Planer

Sammle Kleidungsstücke aus Screenshots oder Shop-Links in einem digitalen Kleiderschrank und kombiniere sie zu Outfits, um zu sehen, wie sie zusammen aussehen.

Die App besteht aus einer einzigen Datei (`index.html`) ohne Abhängigkeiten, ohne Konto und ohne Tracking.

## Funktionen

- **Teile hinzufügen:** Screenshot einfügen (Strg/Cmd + V), per Drag & Drop, über die Dateiauswahl oder per Link
- **Kleiderschrank:** Filter nach Kategorie (Oberteil, Jacke, Hose/Rock, Schuhe, Accessoire), Teile bearbeiten und löschen, Original-Link öffnen
- **Anprobe-Board:** Teile anklicken, verschieben, mit dem Mausrad oder +/− skalieren, nach vorn legen, mit Doppelklick oder Entf entfernen
- **Zufällig kombinieren:** stellt ein Outfit aus deinem Schrank zusammen
- **Outfits speichern:** benennen, wieder laden, löschen
- **Als Bild laden:** exportiert das aktuelle Outfit als PNG
- **Backup und Wiederherstellen:** sichert Schrank und Outfits als JSON-Datei
- Funktioniert auf Desktop und Handy

## Wo liegen meine Daten?

Alles wird **nur im Browser** deines Geräts gespeichert (IndexedDB). Es wird nichts auf einen Server hochgeladen, auch nicht auf GitHub.

Das hat Folgen:

- Jedes Gerät und jede Adresse hat einen **eigenen** Kleiderschrank. `localhost:8000` und `deinname.github.io` sind getrennt.
- Wenn du die Browserdaten löschst, ist der Schrank weg. Mach deshalb regelmäßig ein **Backup**.
- Zum Umziehen auf ein anderes Gerät oder eine andere Adresse: dort „Backup“ klicken, auf dem Ziel „Wiederherstellen“ wählen.

## Variante A: GitHub Pages (ohne Server)

1. Lege `index.html` in den Hauptordner deines Repos.
2. Öffne im Repo **Settings → Pages**.
3. Wähle unter „Build and deployment“ als Source **Deploy from a branch**, dann Branch `main` und Ordner `/ (root)`.
4. Nach ein bis zwei Minuten läuft die Seite unter `https://DEIN-NAME.github.io/REPO-NAME/`.

Was auf GitHub Pages geht:

- Screenshots einfügen, Dateien hochladen und Drag & Drop
- Direkte Bild-URLs, wenn der Bildserver das Laden durch andere Seiten erlaubt

Was dort nicht geht:

- Produktseiten-Links. Dafür muss ein kleiner Server die Seite abrufen, und den gibt es bei GitHub Pages nicht. Nutze stattdessen einen Screenshot oder Variante B.

### Eigene Domain (optional)

1. Domain bei einem Registrar kaufen.
2. In **Settings → Pages → Custom domain** eintragen.
3. Beim Registrar einen `CNAME`-Eintrag für eine Subdomain auf `DEIN-NAME.github.io` setzen. Für die Hauptdomain sind `A`-Einträge nötig, die aktuellen Adressen stehen in der GitHub-Dokumentation.
4. Sobald GitHub das Zertifikat ausgestellt hat, unter Pages **Enforce HTTPS** aktivieren.

Denke daran: Auf der neuen Adresse ist der Schrank leer. Vorher ein Backup erstellen und dort wiederherstellen.

## Variante B: Lokal mit Link-Import

Du brauchst nur Python 3, keine weiteren Pakete.

```bash
python3 server.py          # öffnet http://localhost:8000
python3 server.py 8080     # anderer Port
```

Der Server liefert die Seite aus und holt bei einem Produktlink das Bild und den Namen von der Seite.

- Er lauscht nur auf deinem Rechner (`127.0.0.1`).
- Er ruft nur öffentliche `http(s)`-Adressen ab. `file://` sowie lokale und Heimnetz-Adressen sind gesperrt.
- Manche Shops blockieren automatische Abrufe. Dann hilft ein Screenshot.

## Dateien

| Datei | Zweck |
|---|---|
| `index.html` | die komplette App |
| `server.py` | optionaler lokaler Server für den Link-Import |
| `README.md` | diese Anleitung |

## Bedienung im Überblick

| Aktion | So geht's |
|---|---|
| Teil zum Outfit hinzufügen oder entfernen | Karte im Kleiderschrank anklicken |
| Teil verschieben | auf dem Board ziehen |
| Größe ändern | Mausrad oder Buttons + und − |
| Teil nach vorn legen | „Nach vorn“ |
| Teil vom Board entfernen | Doppelklick oder Entf |
| Teil umbenennen oder Kategorie ändern | Stift-Symbol auf der Karte |

## Fehlerbehebung

- **Seite zeigt 404:** Prüfe, ob die Datei im Hauptordner liegt und genau `index.html` heißt.
- **Alte Version sichtbar:** Mit Strg/Cmd + Shift + R neu laden.
- **Schrank ist leer:** Du bist auf einer anderen Adresse oder einem anderen Gerät. Stelle ein Backup wieder her.
- **Hinweis „Speicher nicht lesbar“:** Seite neu laden. Im privaten Modus mancher Browser ist der Speicher eingeschränkt.
- **Link lädt kein Bild:** Der Shop blockiert den Abruf oder du nutzt die GitHub-Variante. Mach einen Screenshot des Artikels.
