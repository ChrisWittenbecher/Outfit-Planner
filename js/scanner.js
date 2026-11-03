// @ts-check
/**
 * Anprobe – Barcode-Scanner mit Kamera (Schritt 3).
 *
 * Machbarkeit im Browser
 * - Kamera: navigator.mediaDevices.getUserMedia (WebRTC). Funktioniert nur in sicheren Kontexten
 *   (https oder localhost). GitHub Pages ist https. Ohne Kamera oder ohne Erlaubnis gibt es klare
 *   Fehlermeldungen, und die Nummer lässt sich von Hand eingeben.
 * - Erkennung 1 (schnell): die eingebaute BarcodeDetector-API (z. B. Chrome auf Android).
 * - Erkennung 2 (Rückfall): ZXing (@zxing/library, feste Version), wird nur bei Bedarf von jsDelivr geladen.
 *   QuaggaJS wird nicht verwendet, weil es nicht mehr gepflegt wird.
 * - Jeder Treffer wird sofort geprüft (Länge und Prüfziffer) und muss zweimal hintereinander
 *   erkannt werden, damit Fehllesungen nicht durchrutschen.
 */
import { parseGtin } from './barcode.js';

/** Feste Version der Rückfall-Bibliothek. */
export const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';
/** Gesuchte Formate (EAN/UPC). */
const FORMATS = ['ean_13', 'ean_8', 'upc_a'];

/** Eigene Fehlerklasse: Die Meldung ist bereits für Menschen formuliert. */
export class ScanError extends Error {
  /** @param {string} message */
  constructor(message) { super(message); this.name = 'ScanError'; }
}

/**
 * Prüft vorab, ob Kamerazugriff grundsätzlich möglich ist.
 * @param {Window} [win]
 * @returns {{ ok: boolean, reason: string }}
 */
export function cameraSupport(win = window) {
  if (!win.isSecureContext) return { ok: false, reason: 'Die Kamera funktioniert nur über eine sichere Verbindung (https oder localhost).' };
  const md = win.navigator && win.navigator.mediaDevices;
  if (!md || typeof md.getUserMedia !== 'function') return { ok: false, reason: 'Dieser Browser unterstützt keinen Kamerazugriff.' };
  return { ok: true, reason: '' };
}

/**
 * Übersetzt Kamera-Fehler in verständliche Hinweise.
 * @param {any} err
 * @returns {string}
 */
export function describeCameraError(err) {
  switch (err && err.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'Der Kamerazugriff wurde nicht erlaubt. Erlaube die Kamera in den Browser-Einstellungen oder gib die Nummer von Hand ein.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'Es wurde keine Kamera gefunden. Gib die Nummer unter dem Barcode von Hand ein.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Die Kamera wird gerade von einer anderen App benutzt. Schließe sie und versuche es erneut.';
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'Die Kamera unterstützt die gewünschten Einstellungen nicht.';
    case 'AbortError':
      return 'Der Kamerastart wurde abgebrochen. Bitte erneut versuchen.';
    case 'TypeError':
      return 'Dieser Browser unterstützt keinen Kamerazugriff.';
    default:
      return 'Die Kamera konnte nicht gestartet werden. Gib die Nummer unter dem Barcode von Hand ein.';
  }
}

/** @type {Promise<any> | null} */
let zxingPromise = null;

/**
 * Lädt ZXing bei Bedarf (einmalig). Mit Zeitlimit, damit der Dialog nicht hängen bleibt.
 * @param {Window} [win]
 * @param {string} [url]
 * @param {number} [timeoutMs]
 * @returns {Promise<any>}
 */
export function loadZxing(win = window, url = ZXING_URL, timeoutMs = 15000) {
  const w = /** @type {any} */ (win);
  if (w.ZXing) return Promise.resolve(w.ZXing);
  if (!zxingPromise) {
    zxingPromise = new Promise((resolve, reject) => {
      const s = win.document.createElement('script');
      s.src = url; s.async = true; s.crossOrigin = 'anonymous'; s.referrerPolicy = 'no-referrer';
      const t = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      s.onload = () => { clearTimeout(t); if (w.ZXing) resolve(w.ZXing); else reject(new Error('ZXing fehlt')); };
      s.onerror = () => { clearTimeout(t); reject(new Error('laden fehlgeschlagen')); };
      win.document.head.append(s);
    }).catch(e => { zxingPromise = null; throw e; });
  }
  return zxingPromise;
}

/**
 * Baut aus ZXing einen Detektor mit derselben Form wie die native BarcodeDetector-API.
 * @param {any} ZXing
 * @param {Window} [win]
 * @returns {{ detect: (video: HTMLVideoElement) => Promise<{ rawValue: string }[]> }}
 */
export function createZxingDetector(ZXing, win = window) {
  const reader = new ZXing.MultiFormatReader();
  const hints = new Map();
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_A]);
  hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
  reader.setHints(hints);
  const canvas = win.document.createElement('canvas');
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d', { willReadFrequently: true }));
  return {
    async detect(video) {
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) return [];
      const k = Math.min(1, 960 / Math.max(w, h)); // verkleinern für mehr Tempo
      canvas.width = Math.round(w * k); canvas.height = Math.round(h * k);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      try {
        const bitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(new ZXing.HTMLCanvasElementLuminanceSource(canvas)));
        return [{ rawValue: reader.decode(bitmap).getText() }];
      } catch { return []; } // „nichts gefunden“ ist der Normalfall
    },
  };
}

/**
 * Wählt den Detektor: erst die eingebaute API, sonst ZXing.
 * @param {Window} win
 * @param {() => Promise<any>} loadFallback
 * @returns {Promise<{ name: 'native' | 'zxing', det: { detect: (video: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }>}
 */
async function pickDetector(win, loadFallback) {
  const w = /** @type {any} */ (win);
  if (typeof w.BarcodeDetector === 'function') {
    try {
      const supported = /** @type {string[]} */ (await w.BarcodeDetector.getSupportedFormats());
      const formats = FORMATS.filter(f => supported.includes(f));
      if (formats.length) return { name: 'native', det: new w.BarcodeDetector({ formats }) };
    } catch { /* weiter mit ZXing */ }
  }
  try {
    return { name: 'zxing', det: createZxingDetector(await loadFallback(), win) };
  } catch {
    throw new ScanError('Der Barcode-Leser konnte nicht geladen werden (Internetverbindung nötig). Gib die Nummer unter dem Barcode von Hand ein.');
  }
}

/** Steuert Kamera und Erkennung. Nach einem gültigen Treffer stoppt es selbst und ruft `onCode` auf. */
export class BarcodeScanner {
  /**
   * @param {{
   *   video: HTMLVideoElement,
   *   onCode: (code: string) => void,
   *   onState?: (msg: string, kind: 'info' | 'error') => void,
   *   onStop?: () => void,
   *   win?: Window,
   *   loadFallback?: () => Promise<any>,
   *   confirmations?: number,
   *   intervalMs?: number,
   * }} o
   */
  constructor(o) {
    this.video = o.video;
    this.onCode = o.onCode;
    this.onState = o.onState || (() => {});
    this.onStop = o.onStop || (() => {});
    this.win = o.win || window;
    this.loadFallback = o.loadFallback || (() => loadZxing(this.win));
    this.confirmations = o.confirmations ?? 2;
    this.intervalMs = o.intervalMs ?? 120;
    this.running = false;
    this.starting = false;
    /** @type {MediaStream | null} */ this.stream = null;
    /** @type {any} */ this.detector = null;
    /** @type {ReturnType<typeof setTimeout> | undefined} */ this.timer = undefined;
    this.busy = false;
    this.last = '';
    this.hits = 0;
    /** Welcher Detektor aktiv ist (für Tests und Anzeige). */
    this.mode = '';
  }

  /**
   * Startet Kamera und Erkennung. Wirft ScanError mit verständlicher Meldung.
   * @returns {Promise<void>}
   */
  async start() {
    if (this.running || this.starting) return;
    const sup = cameraSupport(this.win);
    if (!sup.ok) throw new ScanError(sup.reason);
    this.starting = true;
    try {
      const picked = await pickDetector(this.win, this.loadFallback); // vor dem Kamerastart: ohne Leser keine Kamera
      const md = this.win.navigator.mediaDevices;
      /** @type {MediaStream} */
      let stream;
      try {
        stream = await md.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      } catch (e) {
        const name = /** @type {any} */ (e)?.name;
        if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') stream = await md.getUserMedia({ video: true, audio: false });
        else throw e;
      }
      this.stream = stream;
      this.video.srcObject = stream;
      this.video.muted = true;
      this.video.setAttribute('playsinline', '');
      await this.video.play();
      this.detector = picked.det; this.mode = picked.name;
      this.running = true; this.last = ''; this.hits = 0;
      this.onState('Halte den Barcode ruhig in den Rahmen.', 'info');
      this.#loop();
    } catch (e) {
      this.stop();
      throw e instanceof ScanError ? e : new ScanError(describeCameraError(e));
    } finally {
      this.starting = false;
    }
  }

  /** Beendet Kamera und Erkennung (mehrfach aufrufbar). */
  stop() {
    const was = this.running || !!this.stream;
    this.running = false;
    clearTimeout(this.timer);
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null;
    try { this.video.pause(); } catch { /* egal */ }
    this.video.srcObject = null;
    this.last = ''; this.hits = 0; this.busy = false;
    if (was) this.onStop();
  }

  #loop() {
    if (!this.running) return;
    this.timer = setTimeout(async () => { try { await this.#tick(); } finally { this.#loop(); } }, this.intervalMs);
  }

  async #tick() {
    if (!this.running || this.busy || this.video.readyState < 2) return;
    this.busy = true;
    try {
      const found = await this.detector.detect(this.video);
      const hit = /** @type {{rawValue: string}[]} */ (found).map(f => parseGtin(f.rawValue)).find(r => r.ok);
      if (hit && hit.ok) {
        if (hit.code === this.last) this.hits++; else { this.last = hit.code; this.hits = 1; }
        if (this.hits >= this.confirmations) { const code = hit.code; this.stop(); this.onCode(code); }
      } else { this.last = ''; this.hits = 0; }
    } catch { /* einzelne Fehlversuche sind normal */ } finally { this.busy = false; }
  }
}
