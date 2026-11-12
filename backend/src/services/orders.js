'use strict';
const { HttpError } = require('../lib/util');
const settingsSvc = require('./settings');
// Order lifecycle. Payment status is tracked separately in orders.payment_status.
const NEXT = { payment_pending: ['confirmed', 'cancelled'], confirmed: ['processing', 'cancelled'], processing: ['packed', 'cancelled'], packed: ['shipped'],
  shipped: ['out_for_delivery', 'delivered'], out_for_delivery: ['delivered'], delivered: ['return_requested'], return_requested: ['returned', 'delivered'], returned: ['refunded'], cancelled: [], refunded: [] };
function setStatus(db, orderId, to, actor, remarks) {
  const o = db.prepare('SELECT id,status FROM orders WHERE id=?').get(orderId); if (!o) throw new HttpError(404, 'ORDER_NOT_FOUND');
  if (o.status === to) return;
  if (!(NEXT[o.status] || []).includes(to)) throw new HttpError(409, 'INVALID_TRANSITION', `Cannot move order from ${o.status} to ${to}`);
  db.prepare("UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(to, orderId);
  db.prepare('INSERT INTO order_events(order_id,from_status,to_status,actor,remarks) VALUES(?,?,?,?,?)').run(orderId, o.status, to, actor, remarks || null);
}
function releaseStock(db, orderId) {
  const o = db.prepare('SELECT stock_released FROM orders WHERE id=?').get(orderId); if (!o || o.stock_released) return;
  for (const it of db.prepare('SELECT product_id,qty FROM order_items WHERE order_id=?').all(orderId)) db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(it.qty, it.product_id);
  db.prepare('UPDATE orders SET stock_released=1 WHERE id=?').run(orderId);
}
function expirePending(db, minutes) {
  const old = db.prepare("SELECT id FROM orders WHERE status='payment_pending' AND payment_status='unpaid' AND created_at < datetime('now', ?)").all(`-${minutes} minutes`);
  for (const { id } of old) db.tx(() => { setStatus(db, id, 'cancelled', 'system', 'payment window expired'); releaseStock(db, id); });
}
// Idempotent: safe to call from verify AND webhook. Returns true only the first time.
function markPaid(db, orderId, rpPaymentId, actor) {
  return db.tx(() => {
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(orderId);
    if (o.payment_status === 'paid') return false;
    if (o.status === 'cancelled') { db.prepare("UPDATE orders SET payment_status='paid_after_cancel' WHERE id=?").run(orderId); return false; }
    db.prepare("UPDATE orders SET payment_status='paid' WHERE id=?").run(orderId);
    db.prepare("UPDATE payments SET status='captured', rp_payment_id=COALESCE(rp_payment_id,?) WHERE order_id=?").run(rpPaymentId, orderId);
    setStatus(db, orderId, 'confirmed', actor, 'payment verified');
    if (o.coupon) db.prepare('UPDATE coupons SET used=used+1 WHERE code=?').run(o.coupon);
    issueInvoice(db, orderId);
    return true;
  });
}
// Sequential, concurrency-safe numbering (inside the caller's transaction + UNIQUE constraint).
function issueInvoice(db, orderId) {
  if (db.prepare('SELECT 1 FROM invoices WHERE order_id=?').get(orderId)) return;
  const s = settingsSvc.get(db), taxInv = settingsSvc.taxReady(s), seq = (+s.invoice_seq || 0) + 1;
  settingsSvc.set(db, { invoice_seq: seq });
  db.prepare('INSERT INTO invoices(order_id,number,kind) VALUES(?,?,?)').run(orderId, `${taxInv ? s.invoice_prefix : 'RCPT-'}${String(seq).padStart(6, '0')}`, taxInv ? 'tax_invoice' : 'receipt');
}
module.exports = { setStatus, releaseStock, expirePending, markPaid, issueInvoice, NEXT };
