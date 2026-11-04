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
| Links | Nur `http(s)`, keine Zugangsdaten, keine internen Adressen beim Bildlink; geöffnet mit `noopener noreferrer` | `scraper.test.mjs`, `security.test.mjs` |
| Backup-Import | Größe (200 MB) und Menge (2000 Teile) begrenzt, jedes Feld einzeln geprüft und neu aufgebaut, nur eingebettete Bilder (keine Adressen, kein SVG), doppelte Kennungen und Prototyp-Schlüssel wirkungslos | `scraper.test.mjs`, `security.mjs` |
| Bilder | Dateien über 25 MB und Bilder über 60 Megapixel werden abgelehnt | `security.mjs` |
| Clickjacking | Die Seite blendet sich in fremden Rahmen aus (`frame-ancestors` ist per `<meta>` nicht möglich) | `security.mjs` |
| Fremder Code | Nur das optionale KI-Freistellen lädt Code von jsDelivr, und erst nach ausdrücklicher Zustimmung | `security.mjs` |
| Update | `version.json` wird streng geprüft; beim Aktualisieren werden nur eigene Dateien der App neu geladen | `version.test.mjs`, `security.mjs` |

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
- Der Bildlink lädt ein Bild vom angegebenen Server. Der Betreiber dieses Servers sieht dabei die IP-Adresse.
