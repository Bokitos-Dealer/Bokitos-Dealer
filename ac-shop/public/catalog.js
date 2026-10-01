/* Product catalogue, shop settings and price calculation.
 * Loaded by the browser (window.CATALOG) and by server.js (require), so the
 * server recomputes every total itself instead of trusting the browser. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CATALOG = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SETTINGS = {
    currency: 'EUR',
    freeShippingFrom: 500,
    shippingFee: 29,
    installPrice: { wall: 399, floor: 449, multi: 799 },
    // Standard VAT rates (%) per destination country. Prices are shown
    // VAT-inclusive; this decides how much of the total is VAT (EU OSS rules).
    vat: {
      AT: 20, BE: 21, BG: 20, HR: 25, CY: 19, CZ: 21, DK: 25, EE: 24, FI: 25.5, FR: 20, DE: 19, GR: 24, HU: 27, IE: 23,
      IT: 22, LV: 21, LT: 21, LU: 17, MT: 18, NL: 21, PL: 23, PT: 23, RO: 21, SK: 23, SI: 22, ES: 21, SE: 25,
    },
  };

  // cool/heat: rated capacity in kW. seerClass/scopClass: EU energy label.
  // features: translation keys (ft.*) shown on the product page.
  const PRODUCTS = [
    { id: 'breeze-25', name: 'Breeze 25', type: 'wall', cool: 2.5, heat: 2.8, seer: 8.5, seerClass: 'A+++', scop: 4.6, scopClass: 'A++', refrigerant: 'R32', noise: 19, noiseOut: 48, dims: '805 × 285 × 194 mm', weight: 9, power: '230 V / 50 Hz', range: '−15 … +24 °C', warranty: 5, price: 749, was: 849, pop: 10, badge: 'bestseller', features: ['ft.wifi', 'ft.quiet', 'ft.r32', 'ft.filter', 'ft.dehum', 'ft.timer'] },
    { id: 'breeze-35', name: 'Breeze 35', type: 'wall', cool: 3.5, heat: 4.0, seer: 8.1, seerClass: 'A++', scop: 4.5, scopClass: 'A+', refrigerant: 'R32', noise: 21, noiseOut: 50, dims: '805 × 285 × 194 mm', weight: 9.5, power: '230 V / 50 Hz', range: '−15 … +24 °C', warranty: 5, price: 899, pop: 9, features: ['ft.wifi', 'ft.quiet', 'ft.r32', 'ft.filter', 'ft.dehum', 'ft.timer'] },
    { id: 'nordic-35', name: 'Nordic 35 Heat Pump', type: 'wall', cool: 3.5, heat: 4.2, seer: 8.6, seerClass: 'A+++', scop: 5.2, scopClass: 'A+++', refrigerant: 'R32', noise: 19, noiseOut: 49, dims: '890 × 300 × 210 mm', weight: 11, power: '230 V / 50 Hz', range: '−25 … +24 °C', warranty: 5, price: 1399, pop: 8, badge: 'cold', features: ['ft.cold', 'ft.wifi', 'ft.quiet', 'ft.r32', 'ft.filter', 'ft.dehum'] },
    { id: 'breeze-50', name: 'Breeze 50', type: 'wall', cool: 5.0, heat: 5.8, seer: 7.2, seerClass: 'A++', scop: 4.1, scopClass: 'A+', refrigerant: 'R32', noise: 24, noiseOut: 54, dims: '965 × 319 × 215 mm', weight: 12.5, power: '230 V / 50 Hz', range: '−15 … +24 °C', warranty: 5, price: 1249, pop: 7, features: ['ft.wifi', 'ft.r32', 'ft.filter', 'ft.dehum', 'ft.timer'] },
    { id: 'arctic-70', name: 'Arctic Pro 70', type: 'wall', cool: 7.0, heat: 7.6, seer: 6.9, seerClass: 'A++', scop: 4.0, scopClass: 'A+', refrigerant: 'R32', noise: 27, noiseOut: 56, dims: '1080 × 335 × 230 mm', weight: 15, power: '230 V / 50 Hz', range: '−15 … +24 °C', warranty: 5, price: 1799, pop: 4, features: ['ft.wifi', 'ft.r32', 'ft.filter', 'ft.dehum', 'ft.timer'] },
    { id: 'floora-35', name: 'Floora 35 Console', type: 'floor', cool: 3.5, heat: 4.0, seer: 7.6, seerClass: 'A++', scop: 4.6, scopClass: 'A++', refrigerant: 'R32', noise: 23, noiseOut: 50, dims: '700 × 600 × 210 mm', weight: 15, power: '230 V / 50 Hz', range: '−15 … +24 °C', warranty: 5, price: 1349, pop: 5, features: ['ft.floor', 'ft.wifi', 'ft.r32', 'ft.filter', 'ft.dehum'] },
    { id: 'duo-2x25', name: 'Duo Multi-Split 2×2.5', type: 'multi', rooms: 2, cool: 5.0, heat: 5.6, seer: 7.0, seerClass: 'A++', scop: 4.0, scopClass: 'A+', refrigerant: 'R32', noise: 20, noiseOut: 53, dims: '2 × 805 × 285 × 194 mm', weight: 18, power: '230 V / 50 Hz', range: '−15 … +24 °C', warranty: 5, price: 2190, was: 2390, pop: 6, features: ['ft.multi', 'ft.wifi', 'ft.quiet', 'ft.r32', 'ft.filter'] },
    { id: 'trio-3x25', name: 'Trio Multi-Split 3×2.5', type: 'multi', rooms: 3, cool: 7.5, heat: 8.2, seer: 6.8, seerClass: 'A++', scop: 4.0, scopClass: 'A+', refrigerant: 'R32', noise: 20, noiseOut: 55, dims: '3 × 805 × 285 × 194 mm', weight: 27, power: '230 V / 50 Hz', range: '−15 … +24 °C', warranty: 5, price: 2990, pop: 3, features: ['ft.multi', 'ft.wifi', 'ft.quiet', 'ft.r32', 'ft.filter'] },
    { id: 'mobi-26', name: 'Mobi 26 Portable', type: 'portable', cool: 2.6, heat: 2.3, seer: 2.6, seerClass: 'A', refrigerant: 'R290', noise: 52, dims: '345 × 705 × 330 mm', weight: 24, power: '230 V / 50 Hz', range: '+16 … +35 °C', warranty: 2, price: 449, pop: 8.5, badge: 'diy', features: ['ft.portable', 'ft.r290', 'ft.dehum', 'ft.timer'] },
    { id: 'mobi-35', name: 'Mobi 35 Dual-Hose', type: 'portable', cool: 3.5, heat: 3.1, seer: 3.1, seerClass: 'A+', refrigerant: 'R290', noise: 50, dims: '380 × 760 × 360 mm', weight: 29, power: '230 V / 50 Hz', range: '+16 … +35 °C', warranty: 2, price: 599, pop: 5.5, badge: 'diy', features: ['ft.portable', 'ft.wifi', 'ft.r290', 'ft.dehum', 'ft.timer'] },
    // Accessories: name/description come from translations (acc.<id>, acc.<id>D).
    { id: 'bracket', type: 'accessory', price: 49, pop: 2, icon: 'bracket' },
    { id: 'pipe-5m', type: 'accessory', price: 89, pop: 2, icon: 'pipe' },
    { id: 'pump', type: 'accessory', price: 79, pop: 1.5, icon: 'pump' },
    { id: 'wifi', type: 'accessory', price: 39, pop: 1, icon: 'wifi' },
    { id: 'seal', type: 'accessory', price: 29, pop: 1.8, icon: 'seal' },
    { id: 'service', type: 'accessory', price: 129, pop: 1.2, icon: 'service' },
  ];

  const ENERGY_COLORS = { 'A+++': '#00a651', 'A++': '#4cb848', 'A+': '#b4cf2a', A: '#e5d800', B: '#fff200', C: '#fdb913', D: '#f37021' };

  const byId = (id) => PRODUCTS.find((p) => p.id === id);
  const round2 = (n) => Math.round(n * 100) / 100;

  /** lines: [{id, qty, install}] -> totals; unknown ids and bad qty are dropped. */
  function computeTotals(lines, country) {
    const items = [];
    let subtotal = 0, install = 0;
    for (const l of lines || []) {
      const p = byId(l && l.id);
      const qty = Math.floor(Number(l && l.qty));
      if (!p || !(qty >= 1 && qty <= 50)) continue;
      const ip = l.install && SETTINGS.installPrice[p.type] ? SETTINGS.installPrice[p.type] : 0;
      items.push({ id: p.id, name: p.name || p.id, qty, unit: p.price, install: !!ip, installUnit: ip });
      subtotal += p.price * qty;
      install += ip * qty;
    }
    const shipping = items.length && subtotal < SETTINGS.freeShippingFrom ? SETTINGS.shippingFee : 0;
    const total = subtotal + install + shipping;
    const vatRate = SETTINGS.vat[country] != null ? SETTINGS.vat[country] : null;
    const vat = vatRate == null ? null : round2(total - total / (1 + vatRate / 100));
    return { items, subtotal, install, shipping, total, vatRate, vat };
  }

  return { SETTINGS, PRODUCTS, ENERGY_COLORS, byId, computeTotals, countries: Object.keys(SETTINGS.vat) };
});
