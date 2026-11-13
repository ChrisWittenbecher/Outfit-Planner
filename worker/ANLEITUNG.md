# Outfit-Planner-Hilfsdienst einrichten (Cloudflare Worker)

Mit dem Dienst fügst du im Outfit-Planner nur den Produktlink ein, und Name, Preis, Farbe, Kategorie und Bild füllen sich von selbst. Er ist kostenlos (Cloudflare Free: 100 000 Anfragen pro Tag) und dauert etwa zehn Minuten.

## Einmal einrichten

1. Auf https://dash.cloudflare.com ein kostenloses Konto anlegen und die E-Mail bestätigen. Eine Domain ist nicht nötig.
2. Links im Menü **Workers & Pages** öffnen und **Create application** wählen. Dann **Start with Hello World!**.
3. Als Namen zum Beispiel `anprobe` eingeben und **Deploy** tippen.
4. Auf **Edit code** gehen. Links die Datei `worker.js` öffnen, den ganzen Inhalt löschen und den Inhalt von `worker/anprobe-worker.js` aus diesem Repository einfügen (auf GitHub die Datei öffnen, „Raw“, alles markieren, kopieren).
5. Oben rechts **Deploy** drücken.
6. Die Adresse des Dienstes steht danach auf der Seite des Workers, sie sieht so aus: `https://anprobe.DEIN-NAME.workers.dev`. **Diese Adresse an Claude schicken.** Claude trägt sie in `js/config.js` und in die Inhaltsrichtlinie (CSP) ein, damit die App sich nur mit genau diesem Dienst verbindet, und stellt die neue Version bereit.

Fertig. Im Outfit-Planner erscheint beim Hinzufügen ein Feld „Produktlink einfügen“.

## Prüfen, ob der Dienst läuft

Die Adresse im Browser öffnen: `https://anprobe.DEIN-NAME.workers.dev/product?u=https://www.example.com` zeigt **Forbidden**. Das ist richtig, denn der Dienst antwortet nur der App, nicht jedem Besucher.

## Optional: Missbrauch bremsen

Unter **Settings → Bindings → Add → Rate limiting** eine Bindung mit dem Namen `LIMITER` anlegen (zum Beispiel 20 Anfragen pro 60 Sekunden). Der Dienst nutzt sie automatisch.

## Was der Dienst tut und nicht tut

- Er ruft die Produktseite ab, liest Name, Preis, Währung, Farbe, Marke, Link und Bildadresse heraus und schickt nur diese Felder zurück. Das Produktbild liefert er mit, weil Browser fremde Bilder nicht selbst lesen dürfen.
- Er antwortet nur Anfragen, die von der Adresse der App kommen.
- Er nimmt nur https-Adressen mit Domainnamen. IP-Adressen, `localhost` und interne Namen lehnt er ab, jede Weiterleitung wird neu geprüft.
- Er speichert nichts, setzt keine Cookies und gibt keine Zugangsdaten weiter.
- Manche Shops (zum Beispiel mit Bot-Schutz) sperren automatische Abrufe. Dann zeigt der Outfit-Planner eine Meldung, und du nutzt den Kurzbefehl oder trägst von Hand ein.

## Aktualisieren

Bei einer neuen Version von `anprobe-worker.js` den Code in Cloudflare unter **Edit code** ersetzen und erneut **Deploy** drücken.

## Prüfen in der App

1. App öffnen (als Home-Bildschirm-App ganz schließen und neu öffnen, bis unten die neue Version steht).
2. Auf „+“ tippen und in das Feld „Produktlink“ tippen.
3. Einen Produktlink einfügen. Er lädt sofort. Am PC „Laden“ oder Enter.
4. Name, Preis, Farbe, Kategorie und Bild sind ausgefüllt. Kurz prüfen und speichern.

| Meldung | Ursache |
|---|---|
| „Der Shop lässt das automatische Auslesen nicht zu“ | Der Shop blockt Abrufe aus Rechenzentren. Screenshot verwenden. |
| „Der Hilfsdienst ist nicht erreichbar“ | Worker nicht veröffentlicht oder die Adresse in `js/config.js` stimmt nicht. |
| Felder bleiben leer | Die Seite enthält keine Produktdaten im Quelltext. Von Hand ergänzen. |
| Alles da, nur das Bild fehlt | Das Bild ließ sich nicht abrufen. Als Screenshot hinzufügen. |
