'use strict';
const { HttpError } = require('../lib/util');
const rz = require('../lib/razorpay'), api = require('../services/razorpayApi'), orders = require('../services/orders');
module.exports = ({ db, cfg }) => [
  // Step 1: server creates the Razorpay order from the STORED order amount (never from the browser).
  ['POST', '/payments/create-order', 'optionalUser', async ({ body, user }) => {
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(+body.orderId);
    if (!o || !((user && (user.role === 'admin' || user.id === o.user_id)) || (body.email && String(body.email).toLowerCase() === o.email))) throw new HttpError(404, 'ORDER_NOT_FOUND');
    if (o.status !== 'payment_pending' || o.payment_status !== 'unpaid') throw new HttpError(409, 'ORDER_NOT_PAYABLE', 'Order is not awaiting payment');
    if (o.payable_paise < 100) throw new HttpError(400, 'AMOUNT_TOO_LOW', 'Minimum payable amount is ₹1');
    const existing = db.prepare("SELECT * FROM payments WHERE order_id=? AND status='created'").get(o.id);
    const rp = existing ? { id: existing.rp_order_id } : await api.createOrder(cfg, { amountPaise: o.payable_paise, receipt: o.number, notes: { orderId: String(o.id) } });
    if (!existing) db.prepare("INSERT INTO payments(order_id,rp_order_id,amount_paise,status) VALUES(?,?,?,'created')").run(o.id, rp.id, o.payable_paise);
    return { body: { keyId: cfg.rzKeyId, mode: cfg.paymentMode, razorpayOrderId: rp.id, amountPaise: o.payable_paise, currency: 'INR', orderNumber: o.number } };
  }],
  // Step 2: verify the Checkout signature server-side, then confirm (idempotent).
  ['POST', '/payments/verify', null, ({ body }) => {
    const pay = db.prepare('SELECT * FROM payments WHERE rp_order_id=?').get(String(body.razorpay_order_id || ''));
    if (!pay) throw new HttpError(404, 'PAYMENT_NOT_FOUND');
    if (!rz.verifyPaymentSignature({ orderId: body.razorpay_order_id, paymentId: body.razorpay_payment_id, signature: body.razorpay_signature }, cfg.rzKeySecret)) throw new HttpError(400, 'BAD_SIGNATURE', 'Payment signature could not be verified');
    const first = orders.markPaid(db, pay.order_id, body.razorpay_payment_id, 'razorpay-verify');
    return { body: { ok: true, firstConfirmation: first, orderId: pay.order_id } };
  }],
  // Webhook: authoritative. Raw body signature, de-duplicated by event id.
  ['POST', '/payments/webhook', null, ({ raw, headers }) => {
    if (!rz.verifyWebhookSignature(raw, headers['x-razorpay-signature'], cfg.rzWebhookSecret)) throw new HttpError(400, 'BAD_SIGNATURE');
    const ev = JSON.parse(raw), eid = headers['x-razorpay-event-id'] || `${ev.event}:${(ev.payload.payment || ev.payload.refund || {}).entity?.id}`;
    if (db.prepare('SELECT 1 FROM payment_events WHERE event_id=?').get(eid)) return { body: { ok: true, duplicate: true } };
    db.prepare('INSERT INTO payment_events(event_id,type,payload) VALUES(?,?,?)').run(eid, ev.event, raw);
    const p = ev.payload.payment && ev.payload.payment.entity, pay = p && db.prepare('SELECT * FROM payments WHERE rp_order_id=?').get(p.order_id);
    if (ev.event === 'payment.captured' && pay) { if (p.amount !== pay.amount_paise) throw new HttpError(409, 'AMOUNT_MISMATCH'); orders.markPaid(db, pay.order_id, p.id, 'razorpay-webhook'); }
    if (ev.event === 'payment.failed' && pay && pay.status === 'created') db.prepare("UPDATE payments SET status='failed_attempt' WHERE id=?").run(pay.id); // order stays pending so the customer can retry
    if (ev.event === 'refund.processed') { const r = ev.payload.refund.entity; db.prepare("UPDATE refunds SET status='processed' WHERE rp_refund_id=?").run(r.id); }
    return { body: { ok: true } };
  }],
  ['GET', '/payments/:orderId/status', 'optionalUser', async ({ params, user, query }) => {
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(+params.orderId);
    if (!o || !((user && (user.role === 'admin' || user.id === o.user_id)) || (query.email && String(query.email).toLowerCase() === o.email))) throw new HttpError(404, 'ORDER_NOT_FOUND');
    let pay = db.prepare('SELECT * FROM payments WHERE order_id=? ORDER BY id DESC').get(o.id);
    // Browser closed after paying? Reconcile with the gateway.
    if (o.payment_status === 'unpaid' && pay && pay.rp_payment_id && cfg.rzKeyId) { const g = await api.fetchPayment(cfg, pay.rp_payment_id); if (g.status === 'captured' && g.amount === pay.amount_paise) orders.markPaid(db, o.id, g.id, 'reconcile'); }
    const fresh = db.prepare('SELECT status,payment_status FROM orders WHERE id=?').get(o.id);
    return { body: { orderStatus: fresh.status, paymentStatus: fresh.payment_status, gatewayOrderId: pay && pay.rp_order_id } };
  }],
  ['POST', '/payments/:orderId/refund', 'admin', async ({ params, body, user }) => {
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(+params.orderId), pay = o && db.prepare("SELECT * FROM payments WHERE order_id=? AND status='captured'").get(o.id);
    if (!pay || !pay.rp_payment_id) throw new HttpError(409, 'NOT_REFUNDABLE', 'No captured payment for this order');
    const done = db.prepare("SELECT COALESCE(SUM(amount_paise),0) s FROM refunds WHERE order_id=? AND status<>'failed'").get(o.id).s;
    const amt = body.amountPaise == null ? pay.amount_paise - done : +body.amountPaise;
    if (!Number.isInteger(amt) || amt < 100 || amt + done > pay.amount_paise) throw new HttpError(400, 'BAD_AMOUNT', 'Refund amount exceeds what is refundable');
    const r = await api.refund(cfg, pay.rp_payment_id, amt, { orderId: String(o.id), by: user.email }); // real API call; recorded only after the gateway accepts it
    db.prepare('INSERT INTO refunds(order_id,rp_refund_id,rp_payment_id,amount_paise,status,reason) VALUES(?,?,?,?,?,?)').run(o.id, r.id, pay.rp_payment_id, amt, r.status || 'pending', body.reason || null);
    return { status: 201, body: { refundId: r.id, status: r.status, amountPaise: amt } };
  }],
];
