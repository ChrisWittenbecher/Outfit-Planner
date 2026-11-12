# Google-Sicherung einrichten

Damit speichert Anprobe deinen Stand automatisch in deinem Google Drive. Du musst das **einmal** einrichten (ca. 10 Minuten). Bis dahin bleibt „Google-Sicherung“ in der App ausgeblendet.

Was Anprobe bekommt: nur Zugriff auf einen **versteckten App-Ordner** (Recht `drive.appdata`). Anprobe sieht keine anderen Dateien in deinem Drive, andere Apps sehen die Datei nicht.

## 1. Google-Cloud-Projekt
1. Öffne <https://console.cloud.google.com/projectcreate>, Name z. B. „Anprobe“, **Erstellen**.
2. Öffne <https://console.cloud.google.com/apis/library/drive.googleapis.com> (mit diesem Projekt) und klicke **Aktivieren** (Google Drive API).

## 2. Zustimmungsbildschirm
1. <https://console.cloud.google.com/auth/overview> → **Erste Schritte**.
2. App-Name „Anprobe“, E-Mail: deine. Zielgruppe: **Extern**. Kontakt: deine E-Mail. Speichern.
3. Unter **Datenzugriff** → **Bereiche hinzufügen**: `…/auth/drive.appdata` auswählen. Speichern.
4. Unter **Zielgruppe**: **App veröffentlichen** (Produktion). Für diesen Bereich ist keine Prüfung durch Google nötig. Bleibt die App im Testmodus, läuft die Anmeldung nach 7 Tagen ab.

## 3. OAuth-Client
1. <https://console.cloud.google.com/auth/clients> → **Client erstellen** → Typ **Webanwendung**, Name „Anprobe“.
2. **Autorisierte JavaScript-Quellen:** `https://outfit-planner.org`
3. **Autorisierte Weiterleitungs-URIs:** `https://outfit-planner.org/` (mit Schrägstrich am Ende)
4. **Erstellen**. Du bekommst eine **Client-ID** und ein **Client-Geheimnis**. Das Geheimnis kommt nur in den Hilfsdienst, nie in die App.

## 4. Hilfsdienst (Cloudflare)
1. Ersetze den Code des Workers durch den aktuellen Stand von `worker/anprobe-worker.js` (Quick edit → einfügen → **Deploy**).
2. **Settings → Variables and Secrets** → hinzufügen:
   - `GOOGLE_CLIENT_ID` = deine Client-ID (Typ Text)
   - `GOOGLE_CLIENT_SECRET` = dein Client-Geheimnis (Typ **Secret**)
3. **Deploy** klicken.

## 5. App
Trage die Client-ID in `js/config.js` ein (`GOOGLE_CLIENT_ID`). Sie ist öffentlich, kein Geheimnis. Nach dem Veröffentlichen erscheint unter **Mehr** (Handy) bzw. oben (**Google**) die Google-Sicherung.

## Prüfen
App öffnen → **Google** → **Mit Google anmelden** → Google fragt nach dem Zugriff auf den App-Ordner → zurück in der App steht „Mit Google verbunden“. Auf einem zweiten Gerät dasselbe, danach erscheinen dort alle Teile.

## Hilfe bei Fehlern
| Meldung | Ursache |
|---|---|
| Google zeigt `redirect_uri_mismatch` | Weiterleitungs-URI in Schritt 3 stimmt nicht exakt (mit `/` am Ende, `https`) |
| „Der Hilfsdienst ist noch nicht für Google eingerichtet“ | Variablen in Schritt 4 fehlen oder Deploy vergessen |
| „Die Google Drive API ist … nicht aktiviert“ | Schritt 1.2 fehlt |
| „Die Anmeldung ist abgelaufen“ | Zugriff wurde widerrufen oder App steht im Testmodus (Schritt 2.4) |

Abmelden: in der App unter **Google → Abmelden**. Zugriff komplett entziehen: <https://myaccount.google.com/connections>.
