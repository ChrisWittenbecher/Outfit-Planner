// @ts-check
/**
 * Anprobe – Einstieg für ES-Module.
 * Wird VOR app.js geladen (beide sind „deferred“ und laufen in Dokumentreihenfolge)
 * und stellt die Module über window.Anprobe bereit.
 */
import * as geometry from './geometry.js';
import * as scraper from './scraper.js';
import * as barcode from './barcode.js';
import * as scanner from './scanner.js';

/** @type {any} */ (window).Anprobe = Object.freeze({ geometry, scraper, barcode, scanner });
