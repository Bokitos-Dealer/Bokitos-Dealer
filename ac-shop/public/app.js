/* Bokitos Air – storefront logic: catalogue, product pages, filters, size
 * calculator, cart, checkout and translations.
 * Talks to server.js (/api/...) when served by it; opened as a plain file it
 * runs in demo mode and sends nothing. */
(function () {
  'use strict';

  const { SETTINGS, PRODUCTS, ENERGY_COLORS, byId, computeTotals, countries } = window.CATALOG;
  const I18N = window.I18N;
  const LOCALES = { en: 'en-IE', de: 'de-DE', fr: 'fr-FR', nl: 'nl-NL', es: 'es-ES' };
  // Accessories suggested on each product type's page.
  const RELATED = { wall: ['bracket', 'pipe-5m', 'pump', 'service'], floor: ['pipe-5m', 'pump', 'service'], multi: ['bracket', 'pipe-5m', 'pump', 'service'], portable: ['seal', 'wifi'] };

  // ----------------------------------------------------------------- state
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
    },
  };

  const browserLang = (navigator.language || 'en').slice(0, 2);
  let lang = store.get('lang', I18N[browserLang] ? browserLang : 'en');
  if (!I18N[lang]) lang = 'en';
  let cart = store.get('cart', []).filter((l) => byId(l.id));
  const filter = { type: 'all', cap: 'all', sort: 'pop', minKw: 0, q: '' };
  let api = null; // server config from /api/config, or null in demo mode

  // --------------------------------------------------------------- helpers
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const t = (key, vars) => {
    let s = (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key;
    if (vars) for (const k in vars) s = s.split(`{${k}}`).join(vars[k]);
    return s;
  };
  const money = (n) => new Intl.NumberFormat(LOCALES[lang], { style: 'currency', currency: SETTINGS.currency, minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(n);
  const num = (n, d = 1) => new Intl.NumberFormat(LOCALES[lang], { maximumFractionDigits: d }).format(n);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isAcc = (p) => p.type === 'accessory';
  const nameOf = (p) => (isAcc(p) ? t('acc.' + p.id) : 'Bokitos ' + p.name);
  const typeLabel = (type) => t({ wall: 'f.wall', multi: 'f.multi', portable: 'f.portable', floor: 'f.floor', accessory: 'f.acc' }[type]);
  // Rule of thumb for the room size a unit can cool: ~100 W per m² at 2.6 m.
  const roomFor = (kw) => Math.round(kw * 10);
  const roomLabel = (p) => t('p.forRoom', { m2: p.rooms ? `${p.rooms} × ${roomFor(p.cool / p.rooms)}` : roomFor(p.cool) });

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  // ------------------------------------------------------- product artwork
  function unitSvg(p) {
    const type = p.type === 'accessory' ? p.icon : p.type;
    const svg = (body) => `<svg viewBox="0 0 200 160" aria-hidden="true">${body}</svg>`;
    const indoor = (x, y, w) => `
      <rect x="${x}" y="${y}" width="${w}" height="${w * 0.28}" rx="${w * 0.07}" fill="#fff" stroke="#d3dbe7" stroke-width="2"/>
      <rect x="${x + w * 0.06}" y="${y + w * 0.22}" width="${w * 0.88}" height="${w * 0.04}" rx="2" fill="#dfe5ee"/>
      <circle cx="${x + w * 0.88}" cy="${y + w * 0.12}" r="${w * 0.018}" fill="#2ad38b"/>`;
    switch (type) {
      case 'portable': return svg(`
        <rect x="70" y="14" width="60" height="132" rx="14" fill="#fff" stroke="#d3dbe7" stroke-width="2"/>
        <rect x="80" y="26" width="40" height="10" rx="5" fill="#e9eef5"/><circle cx="114" cy="31" r="2.5" fill="#2ad38b"/>
        ${[50, 60, 70, 80, 90, 100, 110].map((y) => `<rect x="82" y="${y}" width="36" height="3" rx="1.5" fill="#e3e9f2"/>`).join('')}
        <path d="M130 120 q30 0 36 -40 q4 -26 20 -30" fill="none" stroke="#c9d3e1" stroke-width="10" stroke-linecap="round"/>
        <rect x="76" y="142" width="10" height="6" rx="3" fill="#9aa8bd"/><rect x="114" y="142" width="10" height="6" rx="3" fill="#9aa8bd"/>`);
      case 'floor': return svg(`
        <rect x="30" y="40" width="140" height="96" rx="12" fill="#fff" stroke="#d3dbe7" stroke-width="2"/>
        <rect x="42" y="50" width="116" height="16" rx="4" fill="#e9eef5"/>
        ${[78, 88, 98, 108, 118].map((y) => `<rect x="42" y="${y}" width="116" height="4" rx="2" fill="#e3e9f2"/>`).join('')}
        <circle cx="150" cy="58" r="3" fill="#2ad38b"/>
        <path d="M60 34 q8 -14 0 -26 M100 34 q8 -14 0 -26 M140 34 q8 -14 0 -26" fill="none" stroke="#9cc7ff" stroke-width="3" stroke-linecap="round"/>`);
      case 'multi': return svg(`
        ${indoor(14, 18, 80)}${indoor(106, 18, 80)}
        <rect x="56" y="78" width="88" height="66" rx="8" fill="#f7f9fc" stroke="#d3dbe7" stroke-width="2"/>
        <circle cx="86" cy="111" r="22" fill="none" stroke="#c9d3e1" stroke-width="3"/>
        <path d="M86 92v38M67 111h38M73 98l26 26M99 98l-26 26" stroke="#dbe2ec" stroke-width="2"/>
        ${[92, 100, 108, 116, 124, 132].map((y) => `<rect x="116" y="${y}" width="20" height="3" rx="1.5" fill="#dbe2ec"/>`).join('')}`);
      case 'bracket': return svg(`
        <path d="M50 30 v100 M150 30 v100" stroke="#9aa8bd" stroke-width="10" stroke-linecap="round"/>
        <path d="M50 110 h100 M50 110 l40 -50 M150 110 l-40 -50" stroke="#b7c3d4" stroke-width="8" stroke-linecap="round"/>
        <circle cx="50" cy="40" r="4" fill="#fff"/><circle cx="150" cy="40" r="4" fill="#fff"/>`);
      case 'pipe': return svg(`
        <circle cx="100" cy="80" r="46" fill="none" stroke="#d58b4b" stroke-width="10"/>
        <circle cx="100" cy="80" r="30" fill="none" stroke="#c9d3e1" stroke-width="10"/>
        <path d="M146 80 h34" stroke="#d58b4b" stroke-width="10" stroke-linecap="round"/>`);
      case 'pump': return svg(`
        <rect x="55" y="45" width="90" height="70" rx="10" fill="#fff" stroke="#d3dbe7" stroke-width="2"/>
        <circle cx="100" cy="80" r="18" fill="none" stroke="#9cc7ff" stroke-width="4"/>
        <path d="M100 66 q8 10 0 28 q-8 -10 0 -28z" fill="#9cc7ff"/>
        <path d="M145 70 h30 M25 90 h30" stroke="#c9d3e1" stroke-width="6" stroke-linecap="round"/>`);
      case 'wifi': return svg(`
        <rect x="60" y="60" width="80" height="56" rx="10" fill="#fff" stroke="#d3dbe7" stroke-width="2"/>
        <path d="M70 46 q30 -26 60 0 M80 54 q20 -16 40 0" fill="none" stroke="#0a6cff" stroke-width="5" stroke-linecap="round"/>
        <circle cx="100" cy="88" r="6" fill="#0a6cff"/>`);
      case 'seal': return svg(`
        <rect x="40" y="20" width="120" height="120" rx="6" fill="#fff" stroke="#c9d3e1" stroke-width="6"/>
        <path d="M100 20 v120" stroke="#c9d3e1" stroke-width="4"/>
        <path d="M60 100 q20 -10 40 0 t40 0" fill="none" stroke="#9aa8bd" stroke-width="4" stroke-dasharray="6 5"/>
        <circle cx="132" cy="100" r="10" fill="#e9eef5" stroke="#9aa8bd" stroke-width="3"/>`);
      case 'service': return svg(`
        <path d="M70 120 l45 -45 a22 22 0 1 0 -15 -15 l-45 45 a10 10 0 0 0 15 15z" fill="#fff" stroke="#9aa8bd" stroke-width="4" stroke-linejoin="round"/>
        <circle cx="130" cy="50" r="8" fill="#e9eef5"/>
        <path d="M120 110 l10 10 l22 -26" fill="none" stroke="#12a150" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`);
      default: return svg(`
        ${indoor(20, 30, 160)}
        <path d="M50 92 q-6 22 4 44 M100 92 q-6 22 4 44 M150 92 q-6 22 4 44" fill="none" stroke="#9cc7ff" stroke-width="3" stroke-linecap="round" opacity=".8"/>`);
    }
  }

  function energyTag(cls) {
    const dark = cls === 'A' ? 'color:#0b1b33;' : '';
    return `<div class="energy" style="--c:${ENERGY_COLORS[cls] || '#999'};${dark}" title="${esc(t('d.label'))}"><span>${esc(cls)}</span></div>`;
  }

  // A simplified EU energy label: the class scale with the product's class marked.
  function energyLabel(p) {
    const scale = ['A+++', 'A++', 'A+', 'A', 'B', 'C', 'D'];
    const col = (title, cls, value) => `
      <div class="el-col">
        <div class="el-head">${esc(title)}</div>
        ${scale.map((c, i) => `
          <div class="el-row">
            <span class="el-bar" style="width:${42 + i * 8}%;background:${ENERGY_COLORS[c]};${c === 'A' || c === 'B' ? 'color:#0b1b33' : ''}">${c}</span>
            ${c === cls ? `<span class="el-mark">${c}</span>` : ''}
          </div>`).join('')}
        <div class="el-val">${esc(value)}</div>
      </div>`;
    const cols = [col(t('d.labelCool'), p.seerClass, (p.type === 'portable' ? 'EER ' : 'SEER ') + num(p.seer))];
    if (p.scopClass) cols.push(col(t('d.labelHeat'), p.scopClass, 'SCOP ' + num(p.scop)));
    return `<div class="elabel"><div class="el-top"><b>${esc(t('d.label'))}</b><span>Bokitos · ${esc(p.name)}</span></div><div class="el-cols">${cols.join('')}</div></div>`;
  }

  // ---------------------------------------------------------------- render
  function applyI18n() {
    document.documentElement.lang = lang;
    $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $$('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
    $('#langSelect').value = lang;
    fillCountries();
    renderFaq();
    renderProducts();
    renderCart();
    updateCalc();
    if (!$('#productModal').hidden) route();
    if (!$('#checkout').hidden) updateCheckoutSummary();
  }

  function fillCountries() {
    let names;
    try { names = new Intl.DisplayNames([LOCALES[lang]], { type: 'region' }); } catch { names = null; }
    const opts = countries
      .map((code) => ({ code, name: names ? names.of(code) : code }))
      .sort((a, b) => a.name.localeCompare(b.name, LOCALES[lang]));
    $$('#countrySelect, #coCountry').forEach((sel) => {
      const current = sel.value || store.get('country', '');
      sel.innerHTML = `<option value="">${esc(t('form.choose'))}</option>` +
        opts.map((o) => `<option value="${o.code}">${esc(o.name)}</option>`).join('');
      sel.value = current;
    });
  }

  function renderFaq() {
    const open = $$('#faqList details').map((d) => d.open);
    $('#faqList').innerHTML = [1, 2, 3, 4, 5, 6].map((i) =>
      `<details${open[i - 1] ? ' open' : ''}><summary>${esc(t('faq.q' + i))}</summary><p>${esc(t('faq.a' + i))}</p></details>`).join('');
  }

  function visibleProducts() {
    let list = PRODUCTS.filter((p) => (filter.type === 'all' ? !isAcc(p) : p.type === filter.type));
    if (filter.q) {
      const q = filter.q.toLowerCase();
      list = PRODUCTS.filter((p) => `${nameOf(p)} ${typeLabel(p.type)} ${p.refrigerant || ''} ${isAcc(p) ? t('acc.' + p.id + 'D') : ''}`.toLowerCase().includes(q))
        .filter((p) => filter.type === 'all' || p.type === filter.type);
    }
    if (filter.cap !== 'all') {
      const [lo, hi] = filter.cap.split('-').map(Number);
      list = list.filter((p) => !isAcc(p) && p.cool > lo && p.cool <= hi);
    }
    if (filter.minKw) list = list.filter((p) => !isAcc(p) && p.cool >= filter.minKw && p.cool <= Math.max(filter.minKw * 1.6, filter.minKw + 1.5));
    const sorters = {
      pop: (a, b) => b.pop - a.pop,
      priceAsc: (a, b) => a.price - b.price,
      priceDesc: (a, b) => b.price - a.price,
      seer: (a, b) => (b.seer || 0) - (a.seer || 0),
    };
    return list.sort(sorters[filter.sort]);
  }

  function productCard(p) {
    if (isAcc(p)) {
      return `<article class="card acc">
        <a class="card-media" href="#product/${p.id}" aria-label="${esc(nameOf(p))}">${unitSvg(p)}</a>
        <div class="card-body">
          <span class="card-type">${esc(typeLabel(p.type))}</span>
          <h3><a href="#product/${p.id}">${esc(nameOf(p))}</a></h3>
          <p class="card-desc">${esc(t('acc.' + p.id + 'D'))}</p>
          <div class="card-foot">
            <div class="price">${money(p.price)}</div>
            <button class="btn btn-primary" data-add="${p.id}">${esc(t('p.add'))}</button>
          </div>
        </div>
      </article>`;
    }
    const lastSpec = p.rooms ? [t('p.rooms'), p.rooms] : p.scop ? [t('p.gas'), p.refrigerant] : ['Wi-Fi', p.features.includes('ft.wifi') ? '✓' : '–'];
    return `<article class="card">
      <a class="card-media" href="#product/${p.id}" aria-label="${esc(nameOf(p))}">
        ${p.badge ? `<span class="badge">${esc(t('b.' + p.badge))}</span>` : ''}
        ${energyTag(p.seerClass)}
        ${unitSvg(p)}
      </a>
      <div class="card-body">
        <span class="card-type">${esc(typeLabel(p.type))}</span>
        <h3><a href="#product/${p.id}">${esc(nameOf(p))}</a></h3>
        <p class="card-room">${esc(roomLabel(p))}</p>
        <dl class="specs">
          <div><dt>${t('p.cool')}</dt><dd>${num(p.cool)} kW</dd></div>
          <div><dt>${t('p.heat')}</dt><dd>${num(p.heat)} kW</dd></div>
          <div><dt>${p.type === 'portable' ? 'EER' : t('p.seer')}</dt><dd>${num(p.seer)}</dd></div>
          ${p.scop ? `<div><dt>${t('p.scop')}</dt><dd>${num(p.scop)} (${p.scopClass})</dd></div>` : `<div><dt>${t('p.gas')}</dt><dd>${p.refrigerant}</dd></div>`}
          <div><dt>${t('p.noise')}</dt><dd>${p.noise} dB(A)</dd></div>
          <div><dt>${esc(lastSpec[0])}</dt><dd>${esc(lastSpec[1])}</dd></div>
        </dl>
        <div class="card-foot">
          <div class="price">${p.was ? `<s>${money(p.was)}</s>` : ''}${money(p.price)}</div>
          <button class="btn btn-primary" data-add="${p.id}">${esc(t('p.add'))}</button>
        </div>
      </div>
    </article>`;
  }

  function renderProducts() {
    const list = visibleProducts();
    $('#productGrid').innerHTML = list.length ? list.map(productCard).join('') : `<p class="empty">${esc(t('p.none'))}</p>`;
    const note = $('#resultNote');
    note.hidden = !filter.minKw;
    if (filter.minKw) {
      note.innerHTML = `<span>${esc(t('calc.note', { kw: num(filter.minKw) }))}</span><button type="button" id="clearCalc">${esc(t('calc.clear'))}</button>`;
    }
  }

  // ---------------------------------------------------------- product page
  function renderProductPage(p) {
    const specs = isAcc(p) ? [] : [
      [t('p.cool'), `${num(p.cool)} kW`],
      [t('p.heat'), `${num(p.heat)} kW`],
      [p.type === 'portable' ? 'EER' : t('p.seer'), `${num(p.seer)} (${p.seerClass})`],
      p.scop ? [t('p.scop'), `${num(p.scop)} (${p.scopClass})`] : null,
      [t('p.noise'), `${p.noise} dB(A)`],
      p.noiseOut ? [t('p.noiseOut'), `${p.noiseOut} dB(A)`] : null,
      p.rooms ? [t('p.rooms'), p.rooms] : null,
      [t('p.gas'), p.refrigerant],
      [p.type === 'portable' ? t('p.dimsPortable') : t('p.dims'), p.dims],
      [p.type === 'portable' ? t('p.weightPortable') : t('p.weight'), `${num(p.weight)} kg`],
      [t('p.power'), p.power],
      [t('p.range'), p.range],
      [t('p.warranty'), t('p.years', { n: p.warranty })],
    ].filter(Boolean);
    const ip = SETTINGS.installPrice[p.type];
    const related = (RELATED[p.type] || []).map(byId);

    $('#productBody').innerHTML = `
      <div class="pd">
        <div class="pd-media">
          ${p.badge ? `<span class="badge">${esc(t('b.' + p.badge))}</span>` : ''}
          ${unitSvg(p)}
        </div>
        <div class="pd-info">
          <span class="card-type">${esc(typeLabel(p.type))}</span>
          <h2 id="pmTitle">${esc(nameOf(p))}</h2>
          ${isAcc(p) ? `<p>${esc(t('acc.' + p.id + 'D'))}</p><p class="muted">${esc(t('p.accNote'))}</p>` : `<p class="card-room">${esc(roomLabel(p))}</p>
          <ul class="pd-features">${p.features.map((f) => `<li>${esc(t(f, { n: p.rooms }))}</li>`).join('')}</ul>`}
          <div class="pd-buy">
            <div class="price big">${p.was ? `<s>${money(p.was)}</s>` : ''}${money(p.price)}</div>
            <div class="qty" aria-label="${esc(t('p.qty'))}"><button type="button" data-pq="-1">−</button><span id="pdQty">1</span><button type="button" data-pq="1">+</button></div>
            <button class="btn btn-primary" id="pdAdd" data-id="${p.id}">${esc(t('p.add'))}</button>
          </div>
          ${isAcc(p) ? '' : `<p class="pd-note">${esc(ip ? t('p.installNote', { price: money(ip) }) : t('p.noInstall'))}</p>`}
        </div>
      </div>
      ${isAcc(p) ? '' : `
      <div class="pd-lower">
        <div>
          <h3>${esc(t('d.specs'))}</h3>
          <table class="spec-table">${specs.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</table>
        </div>
        <div>${energyLabel(p)}</div>
      </div>`}
      ${related.length ? `
      <div class="pd-related">
        <h3>${esc(t('d.related'))}</h3>
        <div class="related-grid">${related.map((r) => `
          <div class="related">
            <a href="#product/${r.id}" class="related-media">${unitSvg(r)}</a>
            <div><a href="#product/${r.id}"><b>${esc(nameOf(r))}</b></a><span>${money(r.price)}</span></div>
            <button class="btn btn-ghost sm" data-add="${r.id}" aria-label="${esc(t('p.add'))}">+</button>
          </div>`).join('')}</div>
      </div>` : ''}`;
  }

  function route() {
    const m = location.hash.match(/^#product\/([\w-]+)$/);
    const p = m && byId(m[1]);
    const modal = $('#productModal');
    if (p) {
      renderProductPage(p);
      if (modal.hidden) {
        modal.hidden = false;
        document.body.classList.add('no-scroll');
      }
      $('.modal-card', modal).scrollTop = 0;
      document.title = `${nameOf(p)} – Bokitos Air`;
    } else if (!modal.hidden) {
      modal.hidden = true;
      document.body.classList.remove('no-scroll');
      document.title = 'Bokitos Air – Air conditioners & heat pumps for Europe';
    }
  }

  function closeProduct() {
    if (/^#product\//.test(location.hash)) history.pushState(null, '', '#shop');
    route();
  }

  // ------------------------------------------------------------ calculator
  function calcKw() {
    const area = parseFloat($('#calcArea').value);
    const height = parseFloat($('#calcHeight').value);
    if (!(area > 0) || !(height > 0)) return null;
    const sun = parseFloat($('#calcSun').value);
    const insul = parseFloat($('#calcInsul').value);
    // ~100 W/m² for a 2.6 m ceiling, scaled by volume, sun and insulation.
    const kw = area * 0.1 * (height / 2.6) * sun * insul;
    return Math.max(1.5, Math.round(kw * 10) / 10);
  }

  function updateCalc() {
    const kw = calcKw();
    $('#calcResult').innerHTML = kw ? t('calc.result', { kw: num(kw), btu: num(Math.round(kw * 3412 / 100) * 100, 0) }) : '';
  }

  // ------------------------------------------------------------------ cart
  function saveCart() { store.set('cart', cart); }

  function addToCart(id, qty = 1) {
    const p = byId(id);
    const line = cart.find((l) => l.id === id);
    if (line) line.qty = Math.min(50, line.qty + qty);
    else cart.push({ id, qty, install: !!SETTINGS.installPrice[p.type] });
    saveCart();
    renderCart();
    const badge = $('#cartCount');
    badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump');
    toast(t('p.added', { name: nameOf(p) }));
  }

  function renderCart() {
    $('#cartCount').textContent = cart.reduce((n, l) => n + l.qty, 0);
    const items = $('#cartItems');
    if (!cart.length) {
      items.innerHTML = `<p class="cart-empty">${esc(t('cart.empty'))}</p>`;
      $('#cartFoot').hidden = true;
      return;
    }
    $('#cartFoot').hidden = false;
    items.innerHTML = cart.map((l) => {
      const p = byId(l.id);
      const ip = SETTINGS.installPrice[p.type];
      return `<div class="cart-item" data-id="${p.id}">
        <div class="cart-thumb">${unitSvg(p)}</div>
        <div>
          <h4>${esc(nameOf(p))}</h4>
          <div class="qty"><button data-qty="-1" aria-label="−">−</button><span>${l.qty}</span><button data-qty="1" aria-label="+">+</button></div>
          ${ip ? `<label class="install-toggle"><input type="checkbox" data-install ${l.install ? 'checked' : ''}> ${esc(t('cart.addInstall', { price: money(ip) }))}</label>` : ''}
          <button class="remove" data-remove>${esc(t('cart.remove'))}</button>
        </div>
        <div class="ci-price">${money(p.price * l.qty)}</div>
      </div>`;
    }).join('');

    const tt = computeTotals(cart);
    $('#cartSubtotal').textContent = money(tt.subtotal);
    $('#cartInstall').textContent = money(tt.install);
    $('#cartShipping').textContent = tt.shipping ? money(tt.shipping) : t('cart.free');
    $('#cartTotal').textContent = money(tt.total);
    if (tt.shipping) {
      items.insertAdjacentHTML('beforeend', `<p class="cart-note">${esc(t('cart.freeHint', { amount: money(SETTINGS.freeShippingFrom - tt.subtotal) }))}</p>`);
    }
  }

  function openCart() {
    $('#cart').classList.add('open');
    $('#cart').setAttribute('aria-hidden', 'false');
    $('#overlay').hidden = false;
    document.body.classList.add('no-scroll');
  }
  function closeCart() {
    $('#cart').classList.remove('open');
    $('#cart').setAttribute('aria-hidden', 'true');
    $('#overlay').hidden = true;
    document.body.classList.remove('no-scroll');
  }

  // -------------------------------------------------------------- checkout
  function updateCheckoutSummary() {
    const tt = computeTotals(cart, $('#coCountry').value);
    $('#coItems').innerHTML = tt.items.map((i) => {
      const p = byId(i.id);
      return `<li><span>${i.qty} × ${esc(nameOf(p))}</span><span>${money(i.unit * i.qty)}</span></li>` +
        (i.install ? `<li class="sub"><span>${esc(t('cart.install'))}</span><span>${money(i.installUnit * i.qty)}</span></li>` : '');
    }).join('') + `<li class="sub"><span>${esc(t('cart.shipping'))}</span><span>${tt.shipping ? money(tt.shipping) : esc(t('cart.free'))}</span></li>`;
    $('#coTotal').textContent = money(tt.total);
    $('#coVat').textContent = tt.vatRate != null ? t('cart.vat', { rate: num(tt.vatRate), amount: money(tt.vat) }) : '';
  }

  function showCheckoutStep(step) {
    $('#checkoutForm').hidden = step !== 'form';
    $('#checkoutTitle').hidden = step !== 'form';
    $('#checkoutDone').hidden = step !== 'done';
  }

  function openCheckout() {
    if (!cart.length) return;
    closeCart();
    showCheckoutStep('form');
    $('#coStatus').textContent = '';
    $('#payCardOpt').hidden = !(api && api.stripe);
    const checked = $('#checkoutForm input[name=payment]:checked');
    if (!checked || checked.closest('[hidden]')) $(`#checkoutForm input[name=payment][value=${api && api.stripe ? 'card' : 'bank'}]`).checked = true;
    const min = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
    $('#coDate').min = min;
    updateCheckoutSummary();
    $('#checkout').hidden = false;
    document.body.classList.add('no-scroll');
    $('#checkoutForm input').focus();
  }
  function closeCheckout() {
    $('#checkout').hidden = true;
    document.body.classList.remove('no-scroll');
  }

  function showOrderDone({ id, email, paid, bank, total }) {
    $('#coDoneText').innerHTML = t('co.doneText', { id: esc(id), email: esc(email || '') });
    const extra = $('#coExtra');
    extra.hidden = true;
    if (paid) { extra.textContent = t('co.paid'); extra.hidden = false; }
    else if (bank) { extra.innerHTML = t('co.bankInfo', { amount: money(total), iban: esc(bank.iban), holder: esc(bank.holder), id: esc(id) }); extra.hidden = false; }
    else if (!api) { extra.textContent = t('co.demo'); extra.hidden = false; }
    showCheckoutStep('done');
    $('#checkout').hidden = false;
    document.body.classList.add('no-scroll');
  }

  // ----------------------------------------------------------------- forms
  function validate(form) {
    let ok = true;
    $$('input, select, textarea', form).forEach((el) => {
      if (el.closest('[hidden]')) return;
      const bad = !el.checkValidity();
      el.classList.toggle('invalid', bad);
      if (bad) ok = false;
    });
    return ok;
  }

  async function post(path, data) {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'HTTP ' + res.status);
    return body;
  }

  async function handleForm(form, statusEl, send) {
    statusEl.className = 'form-status';
    statusEl.textContent = '';
    if (!validate(form)) {
      statusEl.textContent = t('form.err');
      statusEl.classList.add('err');
      return;
    }
    const btn = $('button[type=submit]', form);
    btn.disabled = true;
    try {
      await send(Object.fromEntries(new FormData(form)));
    } catch (e) {
      console.error(e);
      statusEl.textContent = t('form.fail');
      statusEl.classList.add('err');
    } finally {
      btn.disabled = false;
    }
  }

  async function submitOrder(data) {
    store.set('country', data.country);
    const order = { customer: data, lines: cart, lang };
    let result;
    if (api) {
      result = await post('/api/orders', order);
      if (result.paymentUrl) {
        store.set('pendingOrder', { id: result.id, email: data.email });
        $('#coStatus').className = 'form-status ok';
        $('#coStatus').textContent = t('co.redirect');
        location.href = result.paymentUrl;
        return;
      }
    } else {
      console.info('[demo mode] order', order);
      await new Promise((r) => setTimeout(r, 400));
      result = { id: 'BA-' + Date.now().toString(36).toUpperCase().slice(-6), total: computeTotals(cart, data.country).total };
    }
    cart = [];
    saveCart();
    renderCart();
    $('#checkoutForm').reset();
    showOrderDone({ id: result.id, email: data.email, bank: result.bank, total: result.total });
  }

  // Back from Stripe Checkout: ?order=…&paid=1 or ?order=…&cancelled=1
  function handlePaymentReturn() {
    const params = new URLSearchParams(location.search);
    const id = params.get('order');
    if (!id) return;
    const pending = store.get('pendingOrder', null);
    store.set('pendingOrder', null);
    if (params.get('paid')) {
      cart = [];
      saveCart();
      renderCart();
      showOrderDone({ id, email: pending && pending.id === id ? pending.email : '', paid: true });
    } else if (params.get('cancelled')) {
      toast(t('co.cancelled'));
    }
    history.replaceState(null, '', location.pathname + location.hash);
  }

  // ---------------------------------------------------------------- events
  function bind() {
    $('#year').textContent = new Date().getFullYear();

    $('#langSelect').addEventListener('change', (e) => { lang = e.target.value; store.set('lang', lang); applyI18n(); });

    $('#menuBtn').addEventListener('click', () => $('#mainNav').classList.toggle('open'));
    $$('#mainNav a').forEach((a) => a.addEventListener('click', () => $('#mainNav').classList.remove('open')));

    const setType = (type) => {
      filter.type = type;
      $$('.chip').forEach((c) => c.classList.toggle('active', c.dataset.type === type));
    };
    $$('.chip').forEach((chip) => chip.addEventListener('click', () => {
      setType(chip.dataset.type);
      if (chip.dataset.type === 'accessory') { filter.cap = 'all'; filter.minKw = 0; $('#capFilter').value = 'all'; }
      renderProducts();
    }));
    $('#capFilter').addEventListener('change', (e) => {
      filter.cap = e.target.value;
      filter.minKw = 0;
      if (filter.type === 'accessory') setType('all');
      renderProducts();
    });
    $('#sortSelect').addEventListener('change', (e) => { filter.sort = e.target.value; renderProducts(); });
    $('#searchInput').addEventListener('input', (e) => { filter.q = e.target.value.trim(); renderProducts(); });

    // Add-to-cart buttons live in the grid, the product page and related items.
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-add]');
      if (btn) addToCart(btn.dataset.add);
    });
    $('#resultNote').addEventListener('click', (e) => {
      if (e.target.id === 'clearCalc') { filter.minKw = 0; renderProducts(); }
    });

    $('#calcForm').addEventListener('input', updateCalc);
    $('#calcForm').addEventListener('submit', (e) => e.preventDefault());
    $('#calcShow').addEventListener('click', () => {
      const kw = calcKw();
      if (!kw) return;
      Object.assign(filter, { minKw: kw, cap: 'all', q: '' });
      setType('all');
      $('#capFilter').value = 'all';
      $('#searchInput').value = '';
      renderProducts();
      $('#shop').scrollIntoView({ behavior: 'smooth' });
    });

    // Product page
    window.addEventListener('hashchange', route);
    $('#productClose').addEventListener('click', closeProduct);
    $('#productModal').addEventListener('click', (e) => {
      if (e.target.id === 'productModal') { closeProduct(); return; }
      const pq = e.target.closest('[data-pq]');
      if (pq) {
        const el = $('#pdQty');
        el.textContent = Math.max(1, Math.min(50, Number(el.textContent) + Number(pq.dataset.pq)));
      }
      const add = e.target.closest('#pdAdd');
      if (add) {
        addToCart(add.dataset.id, Number($('#pdQty').textContent));
        $('#pdQty').textContent = '1';
      }
    });

    // Cart
    $('#cartOpen').addEventListener('click', openCart);
    $('#cartClose').addEventListener('click', closeCart);
    $('#overlay').addEventListener('click', closeCart);
    $('#cartItems').addEventListener('click', (e) => {
      const row = e.target.closest('.cart-item');
      if (!row) return;
      const line = cart.find((l) => l.id === row.dataset.id);
      const q = e.target.closest('[data-qty]');
      if (q) {
        line.qty = Math.min(50, line.qty + Number(q.dataset.qty));
        if (line.qty < 1) cart = cart.filter((l) => l !== line);
      } else if (e.target.closest('[data-remove]')) {
        cart = cart.filter((l) => l !== line);
      } else return;
      saveCart();
      renderCart();
    });
    $('#cartItems').addEventListener('change', (e) => {
      if (!e.target.matches('[data-install]')) return;
      cart.find((l) => l.id === e.target.closest('.cart-item').dataset.id).install = e.target.checked;
      saveCart();
      renderCart();
    });

    // Checkout
    $('#checkoutBtn').addEventListener('click', openCheckout);
    $('#checkoutClose').addEventListener('click', closeCheckout);
    $('#coBack').addEventListener('click', closeCheckout);
    $('#checkout').addEventListener('click', (e) => { if (e.target.id === 'checkout') closeCheckout(); });
    $('#coCountry').addEventListener('change', updateCheckoutSummary);
    $('#checkoutForm').addEventListener('submit', (e) => {
      e.preventDefault();
      handleForm(e.target, $('#coStatus'), submitOrder);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!$('#checkout').hidden) closeCheckout();
      else if (!$('#productModal').hidden) closeProduct();
      else closeCart();
    });

    // Quote request
    $('#contactForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const form = e.target;
      const status = $('#contactStatus');
      handleForm(form, status, async (data) => {
        if (api) await post('/api/quotes', { ...data, lang });
        else console.info('[demo mode] quote', data);
        form.reset();
        status.textContent = api ? t('form.ok') : t('form.ok') + ' ' + t('co.demo');
        status.className = 'form-status ok';
      });
    });

    document.addEventListener('input', (e) => {
      if (e.target.classList && e.target.classList.contains('invalid') && e.target.checkValidity()) e.target.classList.remove('invalid');
    });

    // Privacy notice
    if (!store.get('ck', false)) $('#cookie').hidden = false;
    $('#cookieOk').addEventListener('click', () => { store.set('ck', true); $('#cookie').hidden = true; });
  }

  async function detectServer() {
    if (!/^https?:$/.test(location.protocol)) return null;
    try {
      const res = await fetch('/api/config', { headers: { Accept: 'application/json' } });
      return res.ok ? await res.json() : null;
    } catch { return null; }
  }

  bind();
  applyI18n();
  route();
  detectServer().then((cfg) => {
    api = cfg;
    handlePaymentReturn();
  });
})();
