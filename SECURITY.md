# Sicherheit

Anprobe ist eine statische Web-App ohne Server und ohne Konto. Alle Daten bleiben im Browser des Nutzers (IndexedDB).
Deshalb gibt es keine Zugangsdaten, keine Datenbank und keine Server-Schnittstelle, die angegriffen werden könnten.
Was bleibt, sind Angriffe über Eingaben (Backup-Dateien, Bilder, Links), über die Auslieferung (Seite, Skripte) und über
die Entwicklungspipeline (Abhängigkeiten, GitHub Actions). Dagegen gelten diese Regeln.

## Schwachstelle melden

Bitte **nicht** öffentlich als Issue, sondern über *Security → Report a vulnerability* in diesem Repository
(private Meldung). Beschreibe, was passiert, wie man es nachstellt und welche Version betroffen ist (steht unten auf der Seite).

## Schutzmaßnahmen in der App

| Bereich | Maßnahme | Geprüft durch |
|---|---|---|
| Skripte | Strikte Content-Security-Policy ohne `unsafe-inline` und `unsafe-eval`; keine Inline-Skripte, keine Ereignis-Attribute, kein `eval` | `tests/unit/security.test.mjs`, `tests/e2e/security.mjs` |
| Ausgabe | Daten gelangen nur per `textContent` oder DOM-Aufbau in die Seite, `innerHTML` nur mit festen Texten | `security.test.mjs` |
| Links | Nur `http(s)`, keine Zugangsdaten, keine internen Adressen; geöffnet mit `noopener noreferrer` | `scraper.test.mjs`, `security.test.mjs` |
| Backup-Import | Größe (200 MB) und Menge (2000 Teile) begrenzt, jedes Feld einzeln geprüft und neu aufgebaut, nur eingebettete Bilder (keine Adressen, kein SVG), doppelte Kennungen und Prototyp-Schlüssel wirkungslos | `scraper.test.mjs`, `security.mjs` |
| Bilder | Dateien über 25 MB und Bilder über 60 Megapixel werden abgelehnt | `security.mjs` |
| Clickjacking | Die Seite blendet sich in fremden Rahmen aus (`frame-ancestors` ist per `<meta>` nicht möglich) | `security.mjs` |
| Fremder Code | Nur das optionale KI-Freistellen lädt Code von jsDelivr, und erst nach ausdrücklicher Zustimmung | `security.mjs` |
| Update | `version.json` wird streng geprüft; beim Aktualisieren werden nur eigene Dateien der App neu geladen | `version.test.mjs`, `security.mjs` |
| Offline-Speicher | Der Service Worker (`sw.js`) fasst nur GET-Anfragen im App-Ordner an, nie fremde Adressen (jsDelivr bleibt unberührt), lädt ohne Anmeldedaten und kennt keine fremden Skripte. Jede Version hat einen eigenen Cache, alte werden gelöscht. Er ändert sich mit jeder Versionsnummer, daher erkennt der Browser jedes Update | `pwa.test.mjs`, `pwa.mjs` |
| Tragen-Protokoll und Pläne im Backup | Jeder Eintrag wird beim Einlesen und beim Start neu aufgebaut: nur echte Kalendertage (2000–2100), nur Verweise auf vorhandene Teile und Outfits, Namen von Markup befreit, Anzahl und Länge begrenzt, Kennungen eindeutig, Prototyp-Schlüssel wirkungslos. Die Oberfläche setzt Texte nur als `textContent` ein. | `wear.test.mjs`, `calendar.mjs` |
| Tags, Farbe und Suche | Tags werden beim Einlesen und Speichern von Markup befreit, auf 12 Stück à 30 Zeichen begrenzt und nur als Text eingesetzt. Die Farbe muss einer festen Liste entsprechen. Der Suchbegriff wird nie als Muster oder HTML gedeutet; ein Test verbietet `innerHTML` mit Daten. Die Farberkennung rechnet lokal und sendet nichts. | `search.test.mjs`, `color.test.mjs`, `search.mjs` |
| Mehrfach-Upload | Höchstens 30 Bilder je Auswahl, jedes einzeln auf Größe und Format geprüft (defekte werden übersprungen und gemeldet), Dateinamen werden bereinigt, alles läuft ohne Netzwerk. | `intake.test.mjs`, `search.mjs` |
| Link einfügen (Hilfsdienst) | Die App verbindet sich nur mit der einen, in `connect-src` fest eingetragenen Adresse des Dienstes (keine Platzhalter; ein Test prüft die Übereinstimmung mit `js/config.js`). Anfragen ohne Cookies und ohne Referrer; die Antwort gilt als fremde Eingabe und wird wie fremde Eingabe geprüft (Texte gesäubert und gekürzt, Links nur https ohne Zugangsdaten und ohne lokale Adressen). Der Dienst antwortet nur auf Anfragen von der Adresse der App, nimmt nur https-Adressen mit Domainnamen auf Port 443 (keine IP-Adressen, `localhost`, interne Endungen), prüft jede Weiterleitung neu, begrenzt Größe (Seite 1,5 MB, Bild 8 MB) und Wartezeit, liefert von der Seite nur wenige Felder (inklusive höchstens acht Bildadressen) und Bilder nur nach Prüfung der Dateikennung (kein SVG) und speichert nichts. | `worker.test.mjs`, `linkfetch.mjs` |
| Ideen und Verkaufstext | Alles läuft lokal, ohne Netzwerkzugriff und ohne Dienste von Dritten (Wetter wird gewählt, nicht abgefragt). Alle Texte aus Namen, Tags und Farben gelangen nur über `textContent` bzw. Feldwerte in die Oberfläche, nie als Markup. Die Eingaben (Tage, Größe) sind begrenzt (1 bis 30, 20 Zeichen), der Verkaufstext enthält nur gespeicherte Angaben und keine erfundenen Behauptungen. Kopieren braucht eine Nutzeraktion, sonst greift der Ersatzweg über ein markiertes Feld. | `stylist.test.mjs`, `packing.test.mjs`, `sale.test.mjs`, `ideas.mjs` |
| Speicherformat und Umstellung | Die Umstellung vom alten Format läuft in einer einzigen Transaktion, bei einem Fehler bleibt alles unverändert und die App überschreibt nichts („Speicher nicht lesbar“). Kennungen werden eindeutig gemacht, Einträge ohne Objektform verworfen. Vorschaubilder werden beim Laden geprüft (nur `data:image/png`, `webp`, `jpeg`), gehören nicht ins Backup und passen nur zu genau dem Bild, aus dem sie entstanden sind. Schreibfehler zeigt die Oberfläche an, statt sie zu verschlucken. | `model.test.mjs`, `thumbs.test.mjs`, `storage.mjs` |
| Backup-Erinnerung | Zeitpunkt des letzten Backups liegt getrennt von den Daten im Browserspeicher und wird nie in Backups oder ins Netz geschrieben | `care.test.mjs`, `pwa.mjs` |

Hinweis zu `*.github.io`: Alle Projekte eines Nutzers teilen sich dieselbe Adresse (denselben „Ursprung“). Der Service Worker
ist auf den Ordner `/Outfit-Planner/` begrenzt, der Browserspeicher aber nicht. Wer das vermeiden will, nutzt eine eigene Domain für die App.

## Schutzmaßnahmen in der Pipeline

- GitHub Actions sind auf einen festen Commit gepinnt, nicht auf ein verschiebbares Tag.
- Workflows haben nur Lesezugriff (`permissions: contents: read`); `security-events: write` hat allein die Code-Analyse.
- `package-lock.json` mit Prüfsummen und `npm ci`; Installationsskripte von Paketen sind abgeschaltet (`.npmrc`).
- Dependabot meldet veraltete Abhängigkeiten und Actions, CodeQL analysiert den Code wöchentlich und bei jedem Pull Request, `npm audit` läuft in der CI.
- Kein Workflow nutzt `pull_request_target`; nichts aus Titeln oder Branch-Namen landet in Shell-Befehlen. Ein Test erzwingt das.

## Einstellungen auf GitHub (nur der Besitzer kann sie setzen)

Diese Punkte lassen sich nicht per Code erledigen. Sie stehen unter *Settings* des Repositorys:

1. **Branches → Branch protection rule für `main`:** Pull Request vor dem Merge verlangen, Status-Checks „test (chromium)“, „test (webkit)“ und „audit“ verlangen, Force-Push und Löschen verbieten.
2. **Code security:** *Secret scanning* und *Push protection*, *Dependabot alerts* und *Dependabot security updates*, *Private vulnerability reporting* einschalten (für öffentliche Repositories kostenlos).
3. **Pages:** *Enforce HTTPS* aktiv lassen.
4. **Konto:** Zwei-Faktor-Anmeldung für das GitHub-Konto, am besten mit Passkey oder Sicherheitsschlüssel.
5. **Gemeinsamer Ursprung:** GitHub Pages teilt sich `<name>.github.io` mit allen anderen Pages-Seiten desselben Kontos. Browser trennen Daten nach Ursprung, nicht nach Pfad. Eine andere Seite unter demselben Konto könnte also IndexedDB und localStorage dieser App lesen. Wer weitere Seiten betreibt, sollte hier eine eigene (Sub-)Domain als Custom Domain verwenden.

## Grenzen

- Das Backup (`anprobe-backup-….json`) enthält alle Daten im Klartext. Wer es weitergibt, gibt die Daten weiter.
- Wer die App im Browser öffnet, vertraut dem Stand auf GitHub Pages. Ohne eigene Header (kein `frame-ancestors`, kein HSTS-Einfluss) bleibt das Risiko, das jede statische Seite auf GitHub Pages hat.
- Der Hilfsdienst ruft die Shop-Seite ab; der Shop sieht dabei die Adresse von Cloudflare, nicht deine. Die App selbst lädt nichts von Shops.
