'use strict';
// Run with: npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bokitos-'));
Object.assign(process.env, {
  DATA_DIR: dataDir, ADMIN_PASSWORD: 'secret-pw', STRIPE_SECRET_KEY: 'sk_test_dummy', STRIPE_WEBHOOK_SECRET: 'whsec_test',
  BANK_IBAN: 'NL00 TEST 0000 0000 00', BANK_HOLDER: 'Bokitos Air', PUBLIC_URL: 'https://shop.example',
});

// Fake Stripe: record the Checkout Session request and answer like the API.
const realFetch = global.fetch;
let stripeRequest = null;
global.fetch = async (url, opts) => {
  if (String(url).startsWith('https://api.stripe.com/')) {
    stripeRequest = new URLSearchParams(opts.body);
    return new Response(JSON.stringify({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' }), { status: 200 });
  }
  return realFetch(url, opts);
};

const { server } = require('../server.js');
let base;
test.before(() => new Promise((r) => server.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
test.after(() => { server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });

const call = (p, opts = {}) => realFetch(base + p, opts);
const postJson = (p, body, headers = {}) => call(p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
const customer = (extra) => ({ name: 'Ana Test', email: 'ana@example.eu', phone: '+32 470 00 00 00', address: 'Rue 1', zip: '1000', city: 'Brussels', country: 'BE', terms: 'on', payment: 'bank', ...extra });

test('serves the shop and blocks path traversal', async () => {
  const res = await call('/');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Bokitos/);
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal((await call('/../server.js')).status, 404);
  assert.notEqual((await call('/%2e%2e/server.js')).status, 200);
  assert.equal((await call('/nope')).status, 404);
});

test('config reports enabled features', async () => {
  assert.deepEqual(await (await call('/api/config')).json(), { stripe: true, bank: true, currency: 'EUR' });
});

test('bank transfer order: server recomputes totals and VAT', async () => {
  const res = await postJson('/api/orders', {
    customer: customer(),
    // Client-side prices are ignored; unknown ids and bad quantities are dropped.
    lines: [{ id: 'breeze-25', qty: 2, install: true, price: 1 }, { id: 'bracket', qty: 1, install: true }, { id: 'fake', qty: 1 }, { id: 'mobi-26', qty: -3 }],
    lang: 'fr',
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.match(body.id, /^BA-[0-9A-F]{8}$/);
  // 2 × 749 + 49 = 1547, installation 2 × 399 = 798, free shipping
  assert.equal(body.total, 2345);
  assert.equal(body.paymentUrl, null);
  assert.equal(body.bank.iban, 'NL00 TEST 0000 0000 00');
  const db = JSON.parse(fs.readFileSync(path.join(dataDir, 'db.json'), 'utf8'));
  const order = db.orders.find((o) => o.id === body.id);
  assert.equal(order.totals.vatRate, 21);
  assert.equal(order.totals.vat, 406.98);
  assert.equal(order.status, 'awaiting_payment');
  assert.deepEqual(order.items.map((i) => i.name), ['Bokitos Breeze 25', 'Outdoor unit wall bracket']);
});

test('rejects invalid orders', async () => {
  const lines = [{ id: 'breeze-25', qty: 1 }];
  assert.equal((await postJson('/api/orders', { customer: customer({ email: 'nope' }), lines })).status, 400);
  assert.equal((await postJson('/api/orders', { customer: customer({ country: 'US' }), lines })).status, 400);
  assert.equal((await postJson('/api/orders', { customer: customer({ terms: '' }), lines })).status, 400);
  assert.equal((await postJson('/api/orders', { customer: customer(), lines: [] })).status, 400);
  assert.equal((await call('/api/orders', { method: 'POST', body: '{bad' })).status, 400);
});

test('card order creates a Stripe Checkout Session and the webhook marks it paid', async () => {
  const res = await postJson('/api/orders', { customer: customer({ payment: 'card' }), lines: [{ id: 'mobi-26', qty: 1 }], lang: 'de' });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.paymentUrl, 'https://checkout.stripe.com/c/pay/cs_test_1');
  assert.equal(stripeRequest.get('line_items[0][price_data][unit_amount]'), '44900');
  assert.equal(stripeRequest.get('line_items[1][price_data][product_data][name]'), 'Shipping');
  assert.equal(stripeRequest.get('success_url'), `https://shop.example/?order=${body.id}&paid=1`);
  assert.equal(stripeRequest.get('locale'), 'de');

  const event = JSON.stringify({ type: 'checkout.session.completed', data: { object: { payment_status: 'paid', metadata: { order_id: body.id } } } });
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', 'whsec_test').update(`${ts}.${event}`).digest('hex');
  assert.equal((await call('/api/stripe/webhook', { method: 'POST', headers: { 'Stripe-Signature': `t=${ts},v1=${'0'.repeat(64)}` }, body: event })).status, 400);
  assert.equal((await call('/api/stripe/webhook', { method: 'POST', headers: { 'Stripe-Signature': `t=${ts},v1=${sig}` }, body: event })).status, 200);

  const data = await (await call('/api/admin/data', { headers: { Authorization: 'Bearer secret-pw' } })).json();
  assert.equal(data.orders.find((o) => o.id === body.id).status, 'paid');
});

test('quote requests are validated and stored', async () => {
  assert.equal((await postJson('/api/quotes', { name: 'Jo', email: 'jo@example.eu', country: 'DE', rooms: '3', message: 'Hi', consent: 'on' })).status, 201);
  assert.equal((await postJson('/api/quotes', { name: 'Jo', email: 'jo@example.eu', country: 'DE' })).status, 400);
});

test('admin needs the password and can change status', async () => {
  assert.equal((await call('/api/admin/data')).status, 401);
  assert.equal((await call('/api/admin/data', { headers: { Authorization: 'Bearer wrong' } })).status, 401);
  const auth = { Authorization: 'Bearer secret-pw' };
  const data = await (await call('/api/admin/data', { headers: auth })).json();
  assert.ok(data.orders.length >= 2 && data.quotes.length === 1);
  const id = data.orders[0].id;
  assert.equal((await postJson(`/api/admin/orders/${id}`, { status: 'bogus' }, auth)).status, 400);
  const updated = await (await postJson(`/api/admin/orders/${id}`, { status: 'scheduled' }, auth)).json();
  assert.equal(updated.status, 'scheduled');
  assert.equal(updated.history.at(-1).by, 'admin');
});
