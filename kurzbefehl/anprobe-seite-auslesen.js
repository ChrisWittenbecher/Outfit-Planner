// Anprobe: liest auf einer Produktseite Name, Preis, Farbe und Bildadresse aus.
// Gedacht für die Kurzbefehle-Aktion „JavaScript auf Webseite ausführen“ (Safari).
// Das Skript sendet nichts ins Netz; es gibt nur ein JSON zurück.
(function () {
  var out = { name: '', price: '', currency: '', url: location.href, image: '', color: '', brand: '' };
  function text(v) { return v == null ? '' : String(typeof v === 'object' ? (v.name || v['@id'] || '') : v).trim(); }
  function meta(names) {
    for (var i = 0; i < names.length; i++) {
      var m = document.querySelector('meta[property="' + names[i] + '"], meta[name="' + names[i] + '"]');
      if (m && m.content) return m.content.trim();
    }
    return '';
  }
  function abs(u) { try { return new URL(u, location.href).href; } catch (e) { return ''; } }
  function firstImage(v) {
    if (!v) return '';
    if (Array.isArray(v)) return firstImage(v[0]);
    if (typeof v === 'object') return firstImage(v.url || v.contentUrl);
    return String(v);
  }
  function isProduct(n) { var t = n && n['@type']; return t === 'Product' || t === 'ProductGroup' || (Array.isArray(t) && (t.indexOf('Product') >= 0 || t.indexOf('ProductGroup') >= 0)); }
  function findProduct(n, depth) {
    if (!n || typeof n !== 'object' || depth > 6) return null;
    if (Array.isArray(n)) { for (var i = 0; i < n.length; i++) { var a = findProduct(n[i], depth + 1); if (a) return a; } return null; }
    if (isProduct(n)) return n;
    return findProduct(n['@graph'], depth + 1) || findProduct(n.mainEntity, depth + 1);
  }
  var product = null, blocks = document.querySelectorAll('script[type="application/ld+json"]');
  for (var i = 0; i < blocks.length && !product; i++) { try { product = findProduct(JSON.parse(blocks[i].textContent), 0); } catch (e) {} }
  if (product) {
    var variant = Array.isArray(product.hasVariant) ? product.hasVariant[0] : null;
    var offer = product.offers || (variant && variant.offers);
    if (Array.isArray(offer)) offer = offer[0];
    out.name = text(product.name);
    out.brand = text(product.brand);
    out.color = text(product.color || (variant && variant.color));
    out.image = firstImage(product.image || (variant && variant.image));
    if (offer) {
      var spec = Array.isArray(offer.priceSpecification) ? offer.priceSpecification[0] : offer.priceSpecification;
      out.price = text(offer.price != null ? offer.price : offer.lowPrice != null ? offer.lowPrice : spec ? spec.price : '');
      out.currency = text(offer.priceCurrency || (spec && spec.priceCurrency));
    }
  }
  if (!out.name) out.name = meta(['og:title', 'twitter:title']) || document.title;
  if (!out.image) out.image = meta(['og:image:secure_url', 'og:image', 'twitter:image']);
  if (!out.price) { var p = document.querySelector('[itemprop="price"]'); out.price = meta(['product:price:amount', 'og:price:amount']) || (p ? (p.getAttribute('content') || p.textContent || '').trim() : ''); }
  if (!out.currency) { var c = document.querySelector('[itemprop="priceCurrency"]'); out.currency = meta(['product:price:currency', 'og:price:currency']) || (c ? (c.getAttribute('content') || '').trim() : ''); }
  if (!out.brand) out.brand = meta(['product:brand', 'og:brand']);
  if (!out.color) out.color = meta(['product:color', 'og:color']);
  var canon = document.querySelector('link[rel="canonical"]');
  if (canon && canon.href) out.url = canon.href;
  out.image = out.image ? abs(out.image) : '';
  out.name = out.name.slice(0, 200); out.color = out.color.slice(0, 60); out.brand = out.brand.slice(0, 60);
  completion(JSON.stringify(out));
})();
