# Anprobe-Hilfsdienst einrichten (Cloudflare Worker)

Mit dem Dienst fügst du in Anprobe nur den Produktlink ein, und Name, Preis, Farbe, Kategorie und Bild füllen sich von selbst. Er ist kostenlos (Cloudflare Free: 100 000 Anfragen pro Tag) und dauert etwa zehn Minuten.

## Einmal einrichten

1. Auf https://dash.cloudflare.com ein kostenloses Konto anlegen und die E-Mail bestätigen. Eine Domain ist nicht nötig.
2. Links im Menü **Workers & Pages** öffnen und **Create application** wählen. Dann **Start with Hello World!**.
3. Als Namen zum Beispiel `anprobe` eingeben und **Deploy** tippen.
4. Auf **Edit code** gehen. Links die Datei `worker.js` öffnen, den ganzen Inhalt löschen und den Inhalt von `worker/anprobe-worker.js` aus diesem Repository einfügen (auf GitHub die Datei öffnen, „Raw“, alles markieren, kopieren).
5. Oben rechts **Deploy** drücken.
6. Die Adresse des Dienstes steht danach auf der Seite des Workers, sie sieht so aus: `https://anprobe.DEIN-NAME.workers.dev`. **Diese Adresse an Claude schicken.** Claude trägt sie in `js/config.js` und in die Inhaltsrichtlinie (CSP) ein, damit die App sich nur mit genau diesem Dienst verbindet, und stellt die neue Version bereit.

Fertig. In Anprobe erscheint beim Hinzufügen ein Feld „Produktlink einfügen“.

## Prüfen, ob der Dienst läuft

Die Adresse im Browser öffnen: `https://anprobe.DEIN-NAME.workers.dev/product?u=https://www.example.com` zeigt **Forbidden**. Das ist richtig, denn der Dienst antwortet nur der App, nicht jedem Besucher.

## Optional: Missbrauch bremsen

Unter **Settings → Bindings → Add → Rate limiting** eine Bindung mit dem Namen `LIMITER` anlegen (zum Beispiel 20 Anfragen pro 60 Sekunden). Der Dienst nutzt sie automatisch.

## Was der Dienst tut und nicht tut

- Er ruft die Produktseite ab, liest Name, Preis, Währung, Farbe, Marke, Link und Bildadresse heraus und schickt nur diese Felder zurück. Das Produktbild liefert er mit, weil Browser fremde Bilder nicht selbst lesen dürfen.
- Er antwortet nur Anfragen, die von der Adresse der App kommen.
- Er nimmt nur https-Adressen mit Domainnamen. IP-Adressen, `localhost` und interne Namen lehnt er ab, jede Weiterleitung wird neu geprüft.
- Er speichert nichts, setzt keine Cookies und gibt keine Zugangsdaten weiter.
- Manche Shops (zum Beispiel mit Bot-Schutz) sperren automatische Abrufe. Dann zeigt Anprobe eine Meldung, und du nutzt den Kurzbefehl oder trägst von Hand ein.

## Aktualisieren

Bei einer neuen Version von `anprobe-worker.js` den Code in Cloudflare unter **Edit code** ersetzen und erneut **Deploy** drücken.

---

# Kurzbefehl auf dem iPhone testen (Checkliste)

Das ist der Weg ohne Dienst. Einmal durchgehen; die Schritte stehen auch in der App unter „Neues Teil → So geht’s“.

**Vorbereitung**
1. iPhone: **Einstellungen → Kurzbefehle → Erweitert** → „Ausführen von Skripten erlauben“ einschalten.
2. Anprobe im Safari öffnen, „+“ antippen, „So geht’s“ öffnen und **Skript kopieren** antippen. Es erscheint „Skript kopiert“.

**Kurzbefehl bauen** (App „Kurzbefehle“, „+“)
1. Name: `An Anprobe senden`. Oben auf den Namen tippen, **Details**: „Im Share-Sheet anzeigen“ an, Eingabetypen nur **Safari-Webseiten**.
2. Aktion **JavaScript auf Webseite ausführen** hinzufügen. Den vorgegebenen Text löschen, das kopierte Skript einfügen.
3. Aktion **Wörterbuch aus Eingabe abrufen** (Eingabe: Ergebnis des JavaScripts).
4. Aktion **Wörterbuchwert abrufen**, Schlüssel `image`.
5. Aktion **Inhalte von URL abrufen** (Eingabe: der Wert aus Schritt 4).
6. Aktion **Base64-codieren** (Zeilenumbrüche: Keine).
7. Aktion **Text** mit drei Zeilen: `ANPROBE1`, darunter die Variable „Ergebnis des JavaScripts“, darunter die Variable „Base64-codierter Text“.
8. Aktion **In die Zwischenablage kopieren**.

**Testen**
1. Im Safari eine Produktseite öffnen (zum Beispiel von Zalando, About You oder Zara), dann **Teilen → An Anprobe senden**. Beim ersten Mal „Erlauben“ wählen.
2. Prüfpunkt: Der Kurzbefehl läuft ohne Fehlermeldung durch (ein kurzer Haken oben).
3. Anprobe öffnen, „+“ und **Aus Shop übernehmen** antippen, „Einfügen erlauben“ bestätigen.
4. Prüfpunkt: Die Meldung nennt, was übernommen wurde. Name, Preis, Link, Kategorie und Farbe sind ausgefüllt, das Bild erscheint freigestellt.

**Wenn etwas nicht klappt**

| Beobachtung | Ursache und Lösung |
|---|---|
| Kurzbefehl meldet, Skripte seien nicht erlaubt | Schritt „Vorbereitung 1“ nachholen. |
| Anprobe sagt „keine Shop-Daten“ | Die Zwischenablage wurde überschrieben oder der Kurzbefehl lief nicht durch. Erneut ausführen, danach nichts anderes kopieren. |
| Felder bleiben leer, nur der Titel steht da | Die Seite hat keine Produktdaten im Quelltext (kommt vor). Von Hand ergänzen. |
| Alles da, nur das Bild fehlt | Das Bild hat eine Adresse, die der Kurzbefehl nicht laden konnte. Als Screenshot hinzufügen. |
| „Einfügen erlauben“ erscheint nicht | Lange in das Feld „Name“ tippen und „Einfügen“ wählen; die App erkennt die Daten auch dann. |
