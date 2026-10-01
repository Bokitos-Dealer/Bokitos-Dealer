#!/usr/bin/env node
/* Bokitos Air shop server: serves public/, stores orders and quote requests,
 * takes online payments through Stripe Checkout, sends emails through
 * Resend, and powers the admin page. Node 18+, no dependencies.
 * Configuration comes from environment variables; see README.md / .env.example. */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { SETTINGS, byId, computeTotals, countries } = require('./public/catalog.js');

// English product names for emails, Stripe and the admin page.
const I18N_EN = (() => {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'public', 'i18n.js'), 'utf8'), ctx);
  return ctx.window.I18N.en;
})();
const productName = (p) => (p.type === 'accessory' ? I18N_EN['acc.' + p.id] || p.id : 'Bokitos ' + p.name);

loadDotEnv(path.join(__dirname, '.env'));

const env = process.env;
const PORT = Number(env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.resolve(__dirname, env.DATA_DIR || 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const STRIPE_KEY = env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET || '';
const ADMIN_PASSWORD = env.ADMIN_PASSWORD || '';
const BANK = env.BANK_IBAN ? { iban: env.BANK_IBAN, holder: env.BANK_HOLDER || 'Bokitos Air' } : null;
const ORDER_STATUSES = ['new', 'awaiting_payment', 'paid', 'payment_failed', 'scheduled', 'shipped', 'installed', 'completed', 'cancelled'];
const QUOTE_STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost'];

// ------------------------------------------------------------------ storage
let db = { orders: [], quotes: [] };
try {
  db = Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
} catch (e) {
  if (e.code !== 'ENOENT') { console.error('Cannot read', DB_FILE, e.message); process.exit(1); }
}
let saving = Promise.resolve();
function save() {
  // Serialise writes and replace the file atomically.
  saving = saving.then(async () => {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    const tmp = DB_FILE + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(db, null, 2));
    await fsp.rename(tmp, DB_FILE);
  }).catch((e) => console.error('Saving failed:', e));
  return saving;
}

// ------------------------------------------------------------------ helpers
function loadDotEnv(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return; }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (n) => '€' + Number(n).toFixed(2);
const newId = (prefix) => prefix + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(isJson ? JSON.stringify(body) : body);
}

function readBody(req, limit = 100 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('Body too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJson(req) {
  try { return JSON.parse(await readBody(req)); } catch (e) {
    throw Object.assign(new Error(e.status ? e.message : 'Invalid JSON'), { status: e.status || 400 });
  }
}

function clientIp(req) {
  if (env.TRUST_PROXY) {
    const fwd = req.headers['x-forwarded-for'];
    if (fwd) return String(fwd).split(',')[0].trim();
  }
  return req.socket.remoteAddress || '?';
}

// Fixed-window rate limiter: max requests per window per IP and bucket.
const hits = new Map();
function limited(req, bucket, max, windowMs) {
  const key = bucket + ':' + clientIp(req);
  const now = Date.now();
  let h = hits.get(key);
  if (!h || h.reset < now) { h = { n: 0, reset: now + windowMs }; hits.set(key, h); }
  h.n += 1;
  return h.n > max;
}
setInterval(() => { const now = Date.now(); for (const [k, h] of hits) if (h.reset < now) hits.delete(k); }, 60_000).unref();

function baseUrl(req) {
  if (env.PUBLIC_URL) return env.PUBLIC_URL.replace(/\/$/, '');
  const proto = env.TRUST_PROXY && req.headers['x-forwarded-proto'] ? String(req.headers['x-forwarded-proto']).split(',')[0] : 'http';
  return `${proto}://${req.headers.host}`;
}

// -------------------------------------------------------------------- email
async function sendMail(to, subject, html) {
  if (!env.RESEND_API_KEY || !to) return;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM || 'Bokitos Air <onboarding@resend.dev>', to: [to], subject, html }),
    });
    if (!res.ok) console.error('Email failed:', res.status, await res.text());
  } catch (e) {
    console.error('Email failed:', e.message);
  }
}

function orderHtml(o) {
  const rows = o.items.map((i) => `<tr><td>${i.qty} × ${esc(i.name)}${i.install ? ' + installation' : ''}</td><td align="right">${eur(i.qty * (i.unit + i.installUnit))}</td></tr>`).join('');
  return `<table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">${rows}
    <tr><td>Shipping</td><td align="right">${o.totals.shipping ? eur(o.totals.shipping) : 'Free'}</td></tr>
    <tr><td><b>Total incl. VAT</b></td><td align="right"><b>${eur(o.totals.total)}</b></td></tr>
    ${o.totals.vatRate != null ? `<tr><td colspan="2" style="color:#666">includes ${o.totals.vatRate}% VAT (${eur(o.totals.vat)})</td></tr>` : ''}</table>`;
}

function notifyNewOrder(o) {
  const c = o.customer;
  const payText = { card: 'Paid online', bank: BANK ? `Please transfer ${eur(o.totals.total)} to IBAN ${esc(BANK.iban)} (${esc(BANK.holder)}) with reference ${o.id}.` : 'Bank transfer', invoice: 'You pay after installation by invoice.' }[o.payment];
  if (o.payment !== 'card') {
    sendMail(c.email, `Your Bokitos Air order ${o.id}`,
      `<p>Dear ${esc(c.name)},</p><p>Thank you for your order <b>${o.id}</b>. We will call you within one working day to schedule delivery and installation.</p>${orderHtml(o)}<p>${payText}</p><p>Bokitos Air</p>`);
  }
  sendMail(env.SHOP_EMAIL, `New order ${o.id} – ${eur(o.totals.total)} (${o.payment})`,
    `<p><b>${esc(c.name)}</b> &lt;${esc(c.email)}&gt;, ${esc(c.phone)}<br>${esc(c.address)}, ${esc(c.zip)} ${esc(c.city)}, ${esc(c.country)}</p>
     <p>Preferred date: ${esc(c.preferredDate || '–')}<br>Notes: ${esc(c.notes || '–')}</p>${orderHtml(o)}`);
}

// ------------------------------------------------------------------- stripe
async function createCheckoutSession(order, req) {
  const p = new URLSearchParams();
  const base = baseUrl(req);
  p.set('mode', 'payment');
  p.set('customer_email', order.customer.email);
  p.set('client_reference_id', order.id);
  p.set('metadata[order_id]', order.id);
  p.set('payment_intent_data[metadata][order_id]', order.id);
  if (['en', 'de', 'fr', 'nl', 'es'].includes(order.lang)) p.set('locale', order.lang);
  p.set('success_url', `${base}/?order=${order.id}&paid=1`);
  p.set('cancel_url', `${base}/?order=${order.id}&cancelled=1`);
  let i = 0;
  const line = (name, cents, qty) => {
    p.set(`line_items[${i}][price_data][currency]`, SETTINGS.currency.toLowerCase());
    p.set(`line_items[${i}][price_data][unit_amount]`, String(Math.round(cents)));
    p.set(`line_items[${i}][price_data][product_data][name]`, name);
    p.set(`line_items[${i}][quantity]`, String(qty));
    i += 1;
  };
  for (const it of order.items) {
    line(it.name, it.unit * 100, it.qty);
    if (it.install) line(`Installation – ${it.name}`, it.installUnit * 100, it.qty);
  }
  if (order.totals.shipping) line('Shipping', order.totals.shipping * 100, 1);

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: p.toString(),
  });
  const body = await res.json();
  if (!res.ok) throw new Error('Stripe: ' + (body.error && body.error.message));
  return body;
}

function verifyStripeSignature(raw, header) {
  if (!STRIPE_WEBHOOK_SECRET || !header) return false;
  const parts = {};
  for (const kv of String(header).split(',')) {
    const [k, v] = kv.split('=');
    (parts[k] = parts[k] || []).push(v);
  }
  const ts = parts.t && parts.t[0];
  if (!ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const expected = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET).update(`${ts}.${raw}`).digest('hex');
  return (parts.v1 || []).some((sig) => sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)));
}

// ---------------------------------------------------------------- handlers
async function createOrder(req, res) {
  if (limited(req, 'order', 10, 10 * 60_000)) return send(res, 429, { error: 'Too many requests' });
  const body = await readJson(req);
  const c = body.customer || {};
  const customer = {
    name: str(c.name, 120), email: str(c.email, 160), phone: str(c.phone, 40),
    address: str(c.address, 200), zip: str(c.zip, 20), city: str(c.city, 100), country: str(c.country, 2),
    preferredDate: /^\d{4}-\d{2}-\d{2}$/.test(c.preferredDate) ? c.preferredDate : '', notes: str(c.notes, 1000),
  };
  const payment = ['card', 'bank', 'invoice'].includes(c.payment) ? c.payment : '';
  const missing = ['name', 'email', 'phone', 'address', 'zip', 'city'].filter((k) => !customer[k]);
  if (missing.length || !EMAIL_RE.test(customer.email) || !countries.includes(customer.country) || !payment || c.terms !== 'on') {
    return send(res, 400, { error: 'Invalid customer details' });
  }
  if (payment === 'card' && !STRIPE_KEY) return send(res, 400, { error: 'Online payment is not available' });

  const totals = computeTotals(body.lines, customer.country);
  if (!totals.items.length) return send(res, 400, { error: 'Cart is empty' });
  const { items, ...sums } = totals;
  const order = {
    id: newId('BA'), createdAt: new Date().toISOString(), status: payment === 'invoice' ? 'new' : 'awaiting_payment',
    payment, lang: str(body.lang, 2) || 'en', customer, items: items.map((i) => ({ ...i, name: productName(byId(i.id)) })),
    totals: sums, history: [],
  };

  let paymentUrl = null;
  if (payment === 'card') {
    const session = await createCheckoutSession(order, req);
    order.stripeSessionId = session.id;
    paymentUrl = session.url;
  }
  db.orders.push(order);
  await save();
  notifyNewOrder(order);
  console.log(`order ${order.id} ${eur(order.totals.total)} ${payment}`);
  send(res, 201, { id: order.id, total: order.totals.total, paymentUrl, bank: payment === 'bank' ? BANK : null });
}

async function createQuote(req, res) {
  if (limited(req, 'quote', 10, 10 * 60_000)) return send(res, 429, { error: 'Too many requests' });
  const b = await readJson(req);
  const quote = {
    id: newId('Q'), createdAt: new Date().toISOString(), status: 'new',
    name: str(b.name, 120), email: str(b.email, 160), country: str(b.country, 2),
    rooms: Math.max(1, Math.min(50, parseInt(b.rooms, 10) || 1)), message: str(b.message, 3000), lang: str(b.lang, 2),
  };
  if (!quote.name || !EMAIL_RE.test(quote.email) || !countries.includes(quote.country) || b.consent !== 'on') {
    return send(res, 400, { error: 'Invalid request' });
  }
  db.quotes.push(quote);
  await save();
  sendMail(env.SHOP_EMAIL, `Quote request ${quote.id} from ${quote.name}`,
    `<p><b>${esc(quote.name)}</b> &lt;${esc(quote.email)}&gt;, ${esc(quote.country)}, ${quote.rooms} room(s)</p><p>${esc(quote.message).replace(/\n/g, '<br>')}</p>`);
  send(res, 201, { id: quote.id });
}

async function stripeWebhook(req, res) {
  const raw = await readBody(req, 1024 * 1024);
  if (!verifyStripeSignature(raw, req.headers['stripe-signature'])) return send(res, 400, { error: 'Bad signature' });
  const event = JSON.parse(raw);
  const session = event.data && event.data.object;
  const order = session && db.orders.find((o) => o.id === (session.metadata && session.metadata.order_id));
  if (order) {
    let status = null;
    if (event.type === 'checkout.session.completed' && session.payment_status === 'paid') status = 'paid';
    if (event.type === 'checkout.session.async_payment_succeeded') status = 'paid';
    if (event.type === 'checkout.session.async_payment_failed') status = 'payment_failed';
    if (event.type === 'checkout.session.expired' && order.status === 'awaiting_payment') status = 'cancelled';
    if (status && order.status !== status) {
      order.history.push({ at: new Date().toISOString(), from: order.status, to: status, by: 'stripe' });
      order.status = status;
      await save();
      if (status === 'paid') {
        sendMail(order.customer.email, `Payment received – Bokitos Air order ${order.id}`,
          `<p>Dear ${esc(order.customer.name)},</p><p>We have received your payment for order <b>${order.id}</b>. We will call you within one working day to schedule delivery and installation.</p>${orderHtml(order)}<p>Bokitos Air</p>`);
        sendMail(env.SHOP_EMAIL, `Order ${order.id} paid – ${eur(order.totals.total)}`, orderHtml(order));
      }
    }
  }
  send(res, 200, { received: true });
}

function adminAuthorized(req) {
  if (!ADMIN_PASSWORD) return false;
  const m = String(req.headers.authorization || '').match(/^Bearer (.+)$/);
  if (!m) return false;
  const a = crypto.createHash('sha256').update(m[1]).digest();
  const b = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}

async function admin(req, res, url) {
  if (!ADMIN_PASSWORD) return send(res, 503, { error: 'Set ADMIN_PASSWORD to enable the admin page' });
  if (limited(req, 'admin', 300, 10 * 60_000)) return send(res, 429, { error: 'Too many requests' });
  // Lock an IP out for 15 minutes after 10 wrong passwords.
  const fails = hits.get('adminfail:' + clientIp(req));
  if (fails && fails.reset > Date.now() && fails.n >= 10) return send(res, 429, { error: 'Too many failed logins, try again later' });
  if (!adminAuthorized(req)) {
    limited(req, 'adminfail', 10, 15 * 60_000);
    return send(res, 401, { error: 'Wrong password' });
  }
  if (req.method === 'GET' && url.pathname === '/api/admin/data') {
    return send(res, 200, { orders: db.orders, quotes: db.quotes, statuses: { orders: ORDER_STATUSES, quotes: QUOTE_STATUSES } });
  }
  const m = url.pathname.match(/^\/api\/admin\/(orders|quotes)\/([\w-]+)$/);
  if (req.method === 'POST' && m) {
    const list = db[m[1]];
    const item = list.find((x) => x.id === m[2]);
    const { status } = await readJson(req);
    const allowed = m[1] === 'orders' ? ORDER_STATUSES : QUOTE_STATUSES;
    if (!item) return send(res, 404, { error: 'Not found' });
    if (!allowed.includes(status)) return send(res, 400, { error: 'Invalid status' });
    (item.history = item.history || []).push({ at: new Date().toISOString(), from: item.status, to: status, by: 'admin' });
    item.status = status;
    await save();
    return send(res, 200, item);
  }
  send(res, 404, { error: 'Not found' });
}

// ------------------------------------------------------------- static files
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'self'",
};

async function serveStatic(req, res, url) {
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { return send(res, 400, 'Bad request'); }
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel === '/admin') rel = '/admin.html';
  const file = path.join(PUBLIC_DIR, path.normalize(rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden');
  try {
    const data = await fsp.readFile(file);
    const ext = path.extname(file);
    res.writeHead(200, {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
      ...SECURITY_HEADERS,
      ...(rel === '/admin.html' ? { 'X-Robots-Tag': 'noindex' } : {}),
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    const page = await fsp.readFile(path.join(PUBLIC_DIR, '404.html')).catch(() => 'Not found');
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS });
    res.end(page);
  }
}

// ------------------------------------------------------------------- server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/config' && req.method === 'GET') {
      return send(res, 200, { stripe: !!STRIPE_KEY, bank: !!BANK, currency: SETTINGS.currency });
    }
    if (url.pathname === '/api/health') return send(res, 200, { ok: true });
    if (url.pathname === '/api/orders' && req.method === 'POST') return await createOrder(req, res);
    if (url.pathname === '/api/quotes' && req.method === 'POST') return await createQuote(req, res);
    if (url.pathname === '/api/stripe/webhook' && req.method === 'POST') return await stripeWebhook(req, res);
    if (url.pathname.startsWith('/api/admin/')) return await admin(req, res, url);
    if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'Not found' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
    return await serveStatic(req, res, url);
  } catch (e) {
    if (!e.status) console.error(req.method, url.pathname, e);
    if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Server error' });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Bokitos Air running at http://localhost:${PORT}`);
    console.log(`  payments: ${STRIPE_KEY ? 'Stripe' + (STRIPE_WEBHOOK_SECRET ? '' : ' (WARNING: no STRIPE_WEBHOOK_SECRET, orders will not be marked paid)') : 'off'} | bank transfer details: ${BANK ? 'on' : 'off'} | email: ${env.RESEND_API_KEY ? 'Resend' : 'off'} | admin: ${ADMIN_PASSWORD ? '/admin' : 'off (set ADMIN_PASSWORD)'}`);
  });
}

module.exports = { server, verifyStripeSignature };
