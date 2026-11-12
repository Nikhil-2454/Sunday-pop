'use strict';
// End-to-end API tests. Razorpay's HTTP API is stubbed (no network); signature maths uses the real algorithm.
process.env.RAZORPAY_KEY_ID = 'rzp_test_x'; process.env.RAZORPAY_KEY_SECRET = 'secret123'; process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec'; process.env.JWT_SECRET = 'test';
const { test, before, after } = require('node:test'), assert = require('node:assert/strict');
const cfg = require('../src/config')(), db = require('../src/db').open(':memory:'); require('../src/seed').seed(db);
const { hashPassword } = require('../src/lib/util'), { hmac } = require('../src/lib/razorpay');
db.prepare("INSERT INTO users(email,pw_hash,role) VALUES('admin@t.dev',?, 'admin')").run(hashPassword('adminpass1'));
let srv, base, rpCalls = [];
const realFetch = global.fetch;
global.fetch = async (u, o) => { if (!String(u).startsWith('https://api.razorpay.com')) return realFetch(u, o); rpCalls.push([u, o && o.method]);
  const j = u.endsWith('/orders') ? { id: 'order_' + rpCalls.length } : u.endsWith('/refund') ? { id: 'rfnd_1', status: 'pending' } : {}; return { ok: true, json: async () => j }; };
before(async () => { srv = require('../src/app').createApp(db, cfg); await new Promise(r => srv.listen(0, r)); base = `http://localhost:${srv.address().port}/api/v1`; });
after(() => srv.close());
const call = async (m, p, body, tok, headers = {}) => { const r = await realFetch(base + p, { method: m, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}), ...headers }, body: body && (typeof body === 'string' ? body : JSON.stringify(body)) }); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { s: r.status, j }; };
const addr = { name: 'Asha', mobile: '9876543210', line1: '12 MG Road', city: 'Rajkot', state: 'Gujarat', pin: '360001' };
const cart = [{ slug: 'classic-sea-salt', qty: 2 }, { slug: 'golden-butter', qty: 1 }];
let admin, cust, order;

test('catalogue: list, search, sort, filter, detail', async () => {
  assert.equal((await call('GET', '/products')).j.total, 12);
  assert.equal((await call('GET', '/products?q=wasabi')).j.items[0].slug, 'wasabi-inspired');
  assert.equal((await call('GET', '/products?sort=price_desc')).j.items[0].slug, 'ultimate-discovery-box');
  assert.equal((await call('GET', '/products?category=japanese')).j.total, 4);
  assert.equal((await call('GET', '/products/honey-sesame')).j.related.length > 0, true);
  assert.equal((await call('GET', '/products/nope')).s, 404);
});
test('auth: register, duplicate, weak password, login, me, bad login', async () => {
  const r = await call('POST', '/auth/register', { email: 'a@b.com', password: 'longenough1' }); assert.equal(r.s, 201); cust = r.j.token;
  assert.equal((await call('POST', '/auth/register', { email: 'a@b.com', password: 'longenough1' })).s, 409);
  assert.equal((await call('POST', '/auth/register', { email: 'c@d.com', password: 'short' })).s, 400);
  assert.equal((await call('GET', '/auth/me', null, cust)).j.user.email, 'a@b.com');
  assert.equal((await call('POST', '/auth/login', { email: 'a@b.com', password: 'wrong-pass' })).s, 401);
  admin = (await call('POST', '/auth/login', { email: 'admin@t.dev', password: 'adminpass1' })).j.token; assert.ok(admin);
});
test('quote: coupon + shipping decided by server; invalid coupon/pin rejected', async () => {
  const q = await call('POST', '/cart/quote', { items: cart, coupon: 'preview10', address: { state: 'Gujarat', pin: '360001' } });
  assert.equal(q.j.totals.subtotalPaise, 30700); assert.equal(q.j.totals.discountPaise, 3070); assert.equal(q.j.totals.shippingPaise, 4900); assert.equal(q.j.totals.payablePaise, 30700 - 3070 + 4900); assert.equal(q.j.taxMode, 'no_gst_configured');
  assert.equal((await call('POST', '/cart/quote', { items: cart, coupon: 'FAKE' })).j.error.code, 'INVALID_COUPON');
  assert.equal((await call('POST', '/cart/quote', { items: cart, address: { pin: '12' } })).j.error.code, 'BAD_PIN');
  assert.equal((await call('POST', '/cart/quote', { items: [{ slug: 'classic-sea-salt', qty: 999 }] })).s, 400);
});
test('order: validation, stock reservation, insufficient stock', async () => {
  assert.equal((await call('POST', '/orders', { email: 'a@b.com', items: cart, address: { ...addr, pin: '123' } }, cust)).j.error.code, 'BAD_ADDRESS');
  const r = await call('POST', '/orders', { items: cart, address: addr, coupon: 'PREVIEW10' }, cust); assert.equal(r.s, 201); order = r.j;
  assert.equal(order.status, 'payment_pending'); assert.equal(order.totals.payablePaise, 32530);
  assert.equal(db.prepare("SELECT stock FROM products WHERE slug='classic-sea-salt'").get().stock, 98);
  await call('PUT', '/admin/products/ultimate-discovery-box', { stock: 1 }, admin);
  assert.equal((await call('POST', '/orders', { email: 'x@y.com', items: [{ slug: 'ultimate-discovery-box', qty: 2 }], address: addr })).j.error.code, 'INSUFFICIENT_STOCK');
});
test('payment: create-order uses stored amount; bad signature rejected; verify idempotent; invoice only after payment', async () => {
  assert.equal((await call('GET', `/orders/${order.id}/invoice`, null, cust)).j.error.code, 'NO_INVOICE');
  const c = await call('POST', '/payments/create-order', { orderId: order.id, amount: 1 }, cust); assert.equal(c.s, 200); assert.equal(c.j.amountPaise, 32530); const rpo = c.j.razorpayOrderId;
  assert.equal((await call('POST', '/payments/create-order', { orderId: order.id }, cust)).j.razorpayOrderId, rpo); assert.equal(rpCalls.length, 1);
  assert.equal((await call('POST', '/payments/verify', { razorpay_order_id: rpo, razorpay_payment_id: 'pay_1', razorpay_signature: 'forged' })).j.error.code, 'BAD_SIGNATURE');
  assert.equal((await call('GET', `/payments/${order.id}/status`, null, cust)).j.paymentStatus, 'unpaid');
  const sig = hmac(`${rpo}|pay_1`, 'secret123');
  assert.equal((await call('POST', '/payments/verify', { razorpay_order_id: rpo, razorpay_payment_id: 'pay_1', razorpay_signature: sig })).j.firstConfirmation, true);
  assert.equal((await call('POST', '/payments/verify', { razorpay_order_id: rpo, razorpay_payment_id: 'pay_1', razorpay_signature: sig })).j.firstConfirmation, false);
  assert.equal((await call('GET', `/orders/${order.id}`, null, cust)).j.status, 'confirmed');
  const inv = await call('GET', `/orders/${order.id}/invoice`, null, cust); assert.match(inv.j, /ORDER RECEIPT/); assert.match(inv.j, /not a GST tax invoice/);
  assert.equal((await call('POST', '/payments/create-order', { orderId: order.id }, cust)).j.error.code, 'ORDER_NOT_PAYABLE');
});
test('webhook: signature required, duplicate ignored, amount mismatch blocked', async () => {
  const o2 = (await call('POST', '/orders', { email: 'w@w.com', items: [{ slug: 'smoked-chilli', qty: 1 }], address: addr })).j;
  const rpo = (await call('POST', '/payments/create-order', { orderId: o2.id, email: 'w@w.com' })).j.razorpayOrderId;
  const ev = amt => JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_9', order_id: rpo, amount: amt } } } });
  assert.equal((await call('POST', '/payments/webhook', ev(o2.totals.payablePaise), null, { 'x-razorpay-signature': 'bad', 'x-razorpay-event-id': 'e1' })).s, 400);
  assert.equal((await call('POST', '/payments/webhook', ev(1), null, { 'x-razorpay-signature': hmac(ev(1), 'whsec'), 'x-razorpay-event-id': 'e0' })).j.error.code, 'AMOUNT_MISMATCH');
  const good = ev(o2.totals.payablePaise), h = { 'x-razorpay-signature': hmac(good, 'whsec'), 'x-razorpay-event-id': 'e2' };
  assert.equal((await call('POST', '/payments/webhook', good, null, h)).j.ok, true); assert.equal((await call('POST', '/payments/webhook', good, null, h)).j.duplicate, true);
  assert.equal((await call('GET', `/orders/${o2.id}?email=w@w.com`)).j.paymentStatus, 'paid');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM invoices WHERE order_id=?').get(o2.id).c, 1);
});
test('admin: authorization enforced; GST config produces tax invoice with CGST/SGST', async () => {
  assert.equal((await call('GET', '/admin/stats')).s, 401); assert.equal((await call('GET', '/admin/stats', null, cust)).s, 403);
  await call('PUT', '/admin/settings', { legal_name: 'Test Foods', gst_registered: '1', gstin: '24AAAAA0000A1Z5', state: 'Gujarat', state_code: '24', address: 'Rajkot' }, admin);
  await call('PUT', '/admin/products/honey-sesame', { hsn: '00000000', gstRateBp: 500 }, admin); // test values only
  const q = await call('POST', '/cart/quote', { items: [{ slug: 'honey-sesame', qty: 1 }], address: { state: 'Gujarat', pin: '360001' } });
  assert.equal(q.j.taxMode, 'gst'); assert.equal(q.j.totals.cgstPaise + q.j.totals.sgstPaise, q.j.totals.taxPaise); assert.ok(q.j.totals.cgstPaise > 0);
  const inter = await call('POST', '/cart/quote', { items: [{ slug: 'honey-sesame', qty: 1 }], address: { state: 'Maharashtra', pin: '400001' } }); assert.ok(inter.j.totals.igstPaise > 0 && inter.j.totals.cgstPaise === 0);
  const o = (await call('POST', '/orders', { email: 'g@g.com', items: [{ slug: 'honey-sesame', qty: 1 }], address: addr })).j;
  const rpo = (await call('POST', '/payments/create-order', { orderId: o.id, email: 'g@g.com' })).j.razorpayOrderId;
  await call('POST', '/payments/verify', { razorpay_order_id: rpo, razorpay_payment_id: 'pay_g', razorpay_signature: hmac(`${rpo}|pay_g`, 'secret123') });
  const inv = (await call('GET', `/orders/${o.id}/invoice?email=g@g.com`)).j; assert.match(inv, /TAX INVOICE/); assert.match(inv, /INV-0000\d\d/);
  const rep = await call('GET', '/admin/reports/gst', null, admin); assert.match(rep.j.disclaimer, /not a filed GST return/); assert.equal(rep.j.count, 3);
  assert.match((await call('GET', '/admin/reports/gst?format=csv', null, admin)).j, /invoiceNumber/);
});
test('fulfilment: invalid transition blocked; manual shipment needs real AWB; delivery; return request; refund via gateway', async () => {
  assert.equal((await call('PATCH', `/admin/orders/${order.id}/status`, { status: 'delivered' }, admin)).j.error.code, 'INVALID_TRANSITION');
  assert.equal((await call('POST', `/admin/orders/${order.id}/shipment`, { courier: 'X' }, admin)).s, 400);
  for (const s of ['processing', 'packed']) assert.equal((await call('PATCH', `/admin/orders/${order.id}/status`, { status: s }, admin)).s, 200);
  assert.equal((await call('POST', `/admin/orders/${order.id}/shipment`, { courier: 'TestCourier', awb: 'AWB123' }, admin)).s, 201);
  assert.equal((await call('POST', `/orders/${order.id}/returns`, { reason: 'x' }, cust)).j.error.code, 'NOT_ELIGIBLE');
  await call('PATCH', `/admin/orders/${order.id}/status`, { status: 'delivered' }, admin);
  assert.equal((await call('POST', `/orders/${order.id}/returns`, { reason: 'damaged' }, cust)).s, 201);
  assert.equal((await call('POST', `/payments/${order.id}/refund`, { amountPaise: 99999999 }, admin)).j.error.code, 'BAD_AMOUNT');
  const rf = await call('POST', `/payments/${order.id}/refund`, { amountPaise: 1000 }, admin); assert.equal(rf.s, 201); assert.equal(rf.j.refundId, 'rfnd_1');
  assert.equal((await call('GET', `/orders/${order.id}`, null, cust)).j.timeline.length >= 6, true);
});
test('cancel releases stock; expiry sweeper releases stale reservations', async () => {
  const before = db.prepare("SELECT stock FROM products WHERE slug='dark-chocolate'").get().stock;
  const o = (await call('POST', '/orders', { email: 'k@k.com', items: [{ slug: 'dark-chocolate', qty: 3 }], address: addr })).j;
  assert.equal(db.prepare("SELECT stock FROM products WHERE slug='dark-chocolate'").get().stock, before - 3);
  await call('POST', `/orders/${o.id}/cancel`, { email: 'k@k.com' }); assert.equal(db.prepare("SELECT stock FROM products WHERE slug='dark-chocolate'").get().stock, before);
  const o2 = (await call('POST', '/orders', { email: 'k@k.com', items: [{ slug: 'dark-chocolate', qty: 2 }], address: addr })).j;
  db.prepare("UPDATE orders SET created_at=datetime('now','-2 hours') WHERE id=?").run(o2.id);
  await call('POST', '/orders', { email: 'k@k.com', items: [{ slug: 'dark-chocolate', qty: 1 }], address: addr });
  assert.equal(db.prepare('SELECT status FROM orders WHERE id=?').get(o2.id).status, 'cancelled');
});
