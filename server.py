"""Lokaler Server für den Outfit-Planer ("Anprobe").
Start:  python3 server.py   ->  öffnet http://localhost:8000
Optional anderer Port:  python3 server.py 8080
Er liefert die Seite aus und ruft Produktseiten und Bilder für den Link-Import ab. Er lauscht nur auf deinem Rechner."""
import http.server, ipaddress, json, os, re, socket, sys, threading, urllib.parse, urllib.request, webbrowser
from urllib.parse import urljoin, urlparse

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
os.chdir(os.path.dirname(os.path.abspath(__file__)))
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
      "Accept-Language": "de,en;q=0.8"}

class Refused(Exception):
    pass

def check(url):
    """Nur öffentliche http(s)-Adressen, damit niemand den Server auf dein Heimnetz richten kann."""
    u = urlparse(url)
    if u.scheme not in ("http", "https") or not u.hostname:
        raise Refused("Nur http(s)-Links sind erlaubt")
    try:
        infos = socket.getaddrinfo(u.hostname, u.port or 80)
    except OSError:
        raise Refused("Adresse nicht gefunden")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            if os.environ.get("ANPROBE_ALLOW_LOCAL") != "1":
                raise Refused("Lokale Adressen sind gesperrt")

class Redirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        check(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)

opener = urllib.request.build_opener(Redirects)

def get(url):
    check(url)
    return opener.open(urllib.request.Request(url, headers=UA), timeout=12)

def fetch_raw(url):
    r = get(url)
    return r.headers.get_content_type(), r.read(15_000_000)

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):
        pass

    def reply(self, code, body, ctype="application/json"):
        out = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def do_GET(self):
        p = urlparse(self.path)
        if p.path != "/api/raw":
            return super().do_GET()
        # Schutz vor fremden Webseiten und DNS-Rebinding
        host = (self.headers.get("Host") or "").split(":")[0]
        if host not in ("localhost", "127.0.0.1") or self.headers.get("Sec-Fetch-Site") == "cross-site":
            return self.reply(403, {"error": "Zugriff verweigert"})
        url = urllib.parse.parse_qs(p.query).get("url", [""])[0].strip()
        try:
            ctype, data = fetch_raw(url)
            self.reply(200, data, ctype)
        except Refused as e:
            self.reply(502, {"error": str(e)})
        except Exception:
            self.reply(502, {"error": "Seite nicht erreichbar oder blockiert den Abruf"})

if __name__ == "__main__":
    try:
        srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError:
        sys.exit(f"Port {PORT} ist belegt. Starte mit anderem Port: python3 server.py {PORT + 1}")
    url = f"http://localhost:{PORT}"
    print(f"Anprobe läuft auf {url}  (Beenden: Strg+C)")
    if sys.stdout.isatty():
        threading.Timer(.6, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
