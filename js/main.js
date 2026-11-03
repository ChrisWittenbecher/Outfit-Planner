// @ts-check
/**
 * Anprobe – Einstieg für ES-Module.
 * Wird VOR js/app.js geladen (beide sind „deferred“ und laufen in Dokumentreihenfolge)
 * und stellt die Module über window.Anprobe bereit.
 */
import * as geometry from './geometry.js';
import * as scraper from './scraper.js';

/** @type {any} */ (window).Anprobe = Object.freeze({ geometry, scraper });
