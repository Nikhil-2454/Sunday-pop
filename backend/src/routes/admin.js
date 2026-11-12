'use strict';
const { HttpError, esc } = require('../lib/util');
const orders = require('../services/orders'), settingsSvc = require('../services/settings');
const csv = rows => rows.length ? [Object.keys(rows[0]).join(','), ...rows.map(r => Object.values(r).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\n') : '';
module.exports = ({ db }) => [
  ['GET', '/admin/stats', 'admin', () => ({ body: {
    orders: db.prepare('SELECT status,COUNT(*) n FROM orders GROUP BY status').all(), revenuePaise: db.prepare("SELECT COALESCE(SUM(payable_paise),0) s FROM orders WHERE payment_status='paid'").get().s,
    lowStock: db.prepare('SELECT slug,name,stock FROM products WHERE stock<=10 AND active=1').all(), refundsPaise: db.prepare('SELECT COALESCE(SUM(amount_paise),0) s FROM refunds').get().s } })],
  ['GET', '/admin/orders', 'admin', ({ query }) => ({ body: { items: db.prepare(`SELECT id,number,email,status,payment_status paymentStatus,payable_paise payablePaise,created_at createdAt FROM orders ${query.status ? 'WHERE status=?' : ''} ORDER BY id DESC LIMIT 200`).all(...(query.status ? [query.status] : [])) } })],
  ['PATCH', '/admin/orders/:id/status', 'admin', ({ params, body, user }) => {
    if (body.status === 'shipped') throw new HttpError(400, 'USE_SHIPMENT', 'Create a shipment to mark an order shipped');
    db.tx(() => { orders.setStatus(db, +params.id, body.status, user.email, body.remarks); if (body.status === 'cancelled') orders.releaseStock(db, +params.id); }); return { body: { ok: true } };
  }],
  // Manual shipment: the admin types the REAL courier/AWB. Nothing is generated or invented.
  ['POST', '/admin/orders/:id/shipment', 'admin', ({ params, body, user }) => {
    if (!body.courier || !body.awb) throw new HttpError(400, 'COURIER_AWB_REQUIRED', 'Enter the courier name and the real AWB/tracking number');
    db.tx(() => { orders.setStatus(db, +params.id, 'shipped', user.email, `${body.courier} ${body.awb}`);
      db.prepare("INSERT INTO shipments(order_id,courier,awb,tracking_url,status,weight_g,dispatched_at) VALUES(?,?,?,?,'shipped',?,CURRENT_TIMESTAMP)").run(+params.id, body.courier, body.awb, body.trackingUrl || null, body.weightG || null); });
    return { status: 201, body: { ok: true, manual: true } };
  }],
  ['GET', '/admin/settings', 'admin', () => ({ body: { ...settingsSvc.get(db), taxReady: settingsSvc.taxReady(settingsSvc.get(db)) } })],
  ['PUT', '/admin/settings', 'admin', ({ body, user }) => {
    const allowed = ['legal_name', 'brand_name', 'address', 'state', 'state_code', 'gst_registered', 'gstin', 'invoice_prefix', 'ship_flat_paise', 'ship_free_above_paise', 'shipping_rate_bp', 'round_to_rupee'], o = {};
    for (const k of allowed) if (k in body) o[k] = body[k];
    settingsSvc.set(db, o); db.prepare('INSERT INTO audit_logs(actor,action,detail) VALUES(?,?,?)').run(user.email, 'settings.update', Object.keys(o).join(','));
    return { body: { ok: true, taxReady: settingsSvc.taxReady(settingsSvc.get(db)) } };
  }],
  ['PUT', '/admin/products/:slug', 'admin', ({ params, body, user }) => {
    const map = { name: 'name', shortDescription: 'short_desc', description: 'description', pricePaise: 'price_paise', mrpPaise: 'mrp_paise', hsn: 'hsn', gstRateBp: 'gst_rate_bp', taxInclusive: 'tax_inclusive', stock: 'stock', active: 'active', ingredients: 'ingredients', allergens: 'allergens', weightG: 'weight_g' };
    const sets = [], vals = []; for (const [k, col] of Object.entries(map)) if (k in body) { sets.push(`${col}=?`); vals.push(typeof body[k] === 'boolean' ? +body[k] : body[k]); }
    if (!sets.length) throw new HttpError(400, 'NOTHING_TO_UPDATE'); if ('pricePaise' in body && !(Number.isInteger(body.pricePaise) && body.pricePaise > 0)) throw new HttpError(400, 'BAD_PRICE', 'Price must be integer paise');
    if ('stock' in body && !(Number.isInteger(body.stock) && body.stock >= 0)) throw new HttpError(400, 'BAD_STOCK');
    const r = db.prepare(`UPDATE products SET ${sets.join(',')},sample=0 WHERE slug=?`).run(...vals, params.slug); if (!r.changes) throw new HttpError(404, 'PRODUCT_NOT_FOUND');
    db.prepare('INSERT INTO audit_logs(actor,action,detail) VALUES(?,?,?)').run(user.email, 'product.update', params.slug); return { body: { ok: true } };
  }],
  ['POST', '/admin/coupons', 'admin', ({ body }) => {
    if (!/^[A-Z0-9]{3,20}$/.test(String(body.code || '').toUpperCase()) || !['percent', 'fixed'].includes(body.kind) || !Number.isInteger(body.value) || body.value < 1 || (body.kind === 'percent' && body.value > 100)) throw new HttpError(400, 'BAD_COUPON');
    db.prepare('INSERT INTO coupons(code,kind,value,min_order_paise,expires_at,max_uses) VALUES(?,?,?,?,?,?)').run(String(body.code).toUpperCase(), body.kind, body.value, body.minOrderPaise || 0, body.expiresAt || null, body.maxUses ?? null); return { status: 201, body: { ok: true } };
  }],
  // Management summary only. NOT a filed GST return.
  ['GET', '/admin/reports/gst', 'admin', ({ query }) => {
    const rows = db.prepare(`SELECT o.number orderNumber, i.number invoiceNumber, i.kind, o.created_at date, o.payable_paise totalPaise, o.totals FROM orders o JOIN invoices i ON i.order_id=o.id WHERE o.payment_status='paid' ORDER BY o.id`).all()
      .map(r => { const t = JSON.parse(r.totals); const { totals, ...rest } = r; return { ...rest, taxablePaise: t.taxablePaise, cgstPaise: t.cgstPaise, sgstPaise: t.sgstPaise, igstPaise: t.igstPaise, taxPaise: t.taxPaise }; });
    if (query.format === 'csv') return { csv: csv(rows) };
    const sum = k => rows.reduce((a, r) => a + r[k], 0);
    return { body: { disclaimer: 'Management summary only. This is not a filed GST return.', count: rows.length, taxablePaise: sum('taxablePaise'), cgstPaise: sum('cgstPaise'), sgstPaise: sum('sgstPaise'), igstPaise: sum('igstPaise'), rows } };
  }],
];
