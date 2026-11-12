'use strict';
const { HttpError, validPin, validMobile, validEmail, stateCode } = require('../lib/util');
const pricing = require('../services/pricing'), orders = require('../services/orders'), settingsSvc = require('../services/settings'), invoiceHtml = require('../services/invoice');
const canSee = (o, user, q) => (user && (user.role === 'admin' || user.id === o.user_id)) || (q && q.email && String(q.email).toLowerCase() === o.email);
const view = (db, o) => ({ id: o.id, number: o.number, status: o.status, paymentStatus: o.payment_status, email: o.email, address: JSON.parse(o.address), totals: JSON.parse(o.totals), createdAt: o.created_at,
  items: db.prepare('SELECT sku,name,hsn,qty,unit_paise unitPaise FROM order_items WHERE order_id=?').all(o.id),
  timeline: db.prepare('SELECT from_status fromStatus,to_status toStatus,actor,remarks,at FROM order_events WHERE order_id=? ORDER BY id').all(o.id),
  shipment: db.prepare('SELECT courier,awb,tracking_url trackingUrl,status,dispatched_at dispatchedAt,delivered_at deliveredAt FROM shipments WHERE order_id=?').get(o.id) || null });
module.exports = ({ db, cfg }) => [
  ['POST', '/orders', 'optionalUser', ({ body, user }) => {
    const a = body.address || {}, email = String(body.email || (user && user.email) || '').trim().toLowerCase();
    if (!validEmail(email)) throw new HttpError(400, 'BAD_EMAIL', 'Valid email required');
    if (!a.name || !a.line1 || !a.city || !stateCode(a.state) || !validPin(a.pin) || !validMobile(a.mobile)) throw new HttpError(400, 'BAD_ADDRESS', 'Name, address, city, state, 6-digit PIN and 10-digit mobile are required');
    const id = db.tx(() => {
      orders.expirePending(db, cfg.pendingMinutes);
      const q = pricing.quote(db, { items: body.items, coupon: body.coupon, address: a });
      const r = db.prepare('INSERT INTO orders(user_id,email,address,coupon,totals,payable_paise) VALUES(?,?,?,?,?,?)').run(user ? user.id : null, email, JSON.stringify(a), q.coupon, JSON.stringify(q.calc.totals), q.calc.totals.payablePaise);
      const oid = Number(r.lastInsertRowid);
      db.prepare('UPDATE orders SET number=? WHERE id=?').run(`SP${new Date().toISOString().slice(2, 10).replace(/-/g, '')}${String(oid).padStart(5, '0')}`, oid);
      q.lines.forEach((l, n) => {
        const u = db.prepare('UPDATE products SET stock=stock-? WHERE id=? AND stock>=?').run(l.qty, l.p.id, l.qty); // reserve; fails safely if sold out meanwhile
        if (u.changes !== 1) throw new HttpError(409, 'INSUFFICIENT_STOCK', `${l.p.name} just sold out`);
        const it = q.calc.items[n];
        db.prepare('INSERT INTO order_items(order_id,product_id,sku,name,hsn,qty,unit_paise,rate_bp,line) VALUES(?,?,?,?,?,?,?,?,?)').run(oid, l.p.id, l.p.sku, l.p.name, l.p.hsn, l.qty, l.p.price_paise, l.p.gst_rate_bp, JSON.stringify(it));
      });
      db.prepare('INSERT INTO order_events(order_id,from_status,to_status,actor) VALUES(?,?,?,?)').run(oid, null, 'payment_pending', user ? user.email : 'guest');
      return oid;
    });
    return { status: 201, body: view(db, db.prepare('SELECT * FROM orders WHERE id=?').get(id)) };
  }],
  ['GET', '/orders', 'user', ({ user }) => ({ body: { items: db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC').all(user.id).map(o => view(db, o)) } })],
  ['GET', '/orders/:id', 'optionalUser', ({ params, user, query }) => {
    const o = db.prepare('SELECT * FROM orders WHERE id=? OR number=?').get(+params.id || 0, params.id);
    if (!o || !canSee(o, user, query)) throw new HttpError(404, 'ORDER_NOT_FOUND'); return { body: view(db, o) };
  }],
  ['GET', '/orders/:id/invoice', 'optionalUser', ({ params, user, query }) => {
    const o = db.prepare('SELECT * FROM orders WHERE id=? OR number=?').get(+params.id || 0, params.id);
    if (!o || !canSee(o, user, query)) throw new HttpError(404, 'ORDER_NOT_FOUND');
    const inv = db.prepare('SELECT * FROM invoices WHERE order_id=?').get(o.id); if (!inv) throw new HttpError(409, 'NO_INVOICE', 'Invoice is issued after payment is verified');
    return { html: invoiceHtml(db, o, inv, settingsSvc.get(db)) };
  }],
  ['POST', '/orders/:id/cancel', 'optionalUser', ({ params, user, body }) => {
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(+params.id); if (!o || !canSee(o, user, body)) throw new HttpError(404, 'ORDER_NOT_FOUND');
    if (o.payment_status !== 'unpaid') throw new HttpError(409, 'ALREADY_PAID', 'Paid orders are cancelled by support so the refund can be processed');
    db.tx(() => { orders.setStatus(db, o.id, 'cancelled', user ? user.email : 'guest', 'cancelled by customer'); orders.releaseStock(db, o.id); }); return { body: { ok: true } };
  }],
  ['POST', '/orders/:id/returns', 'user', ({ params, user, body }) => {
    const o = db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').get(+params.id, user.id); if (!o) throw new HttpError(404, 'ORDER_NOT_FOUND');
    if (o.status !== 'delivered') throw new HttpError(409, 'NOT_ELIGIBLE', 'Returns can be requested only for delivered orders');
    if (!String(body.reason || '').trim()) throw new HttpError(400, 'REASON_REQUIRED', 'Please give a reason');
    db.tx(() => { db.prepare('INSERT INTO returns(order_id,user_id,reason) VALUES(?,?,?)').run(o.id, user.id, String(body.reason).slice(0, 500)); orders.setStatus(db, o.id, 'return_requested', user.email, body.reason); });
    return { status: 201, body: { ok: true } };
  }],
];
