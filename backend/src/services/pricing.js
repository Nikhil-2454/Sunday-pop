'use strict';
// Server-side pricing: the browser never decides the amount.
const { computeOrder } = require('../lib/gst');
const { HttpError, stateCode, validPin } = require('../lib/util');
const settingsSvc = require('./settings');
function loadLines(db, items) {
  if (!Array.isArray(items) || !items.length || items.length > 50) throw new HttpError(400, 'EMPTY_CART', 'Cart is empty or too large');
  const seen = new Set();
  return items.map(i => {
    const qty = Number(i.qty); if (!Number.isInteger(qty) || qty < 1 || qty > 20) throw new HttpError(400, 'BAD_QTY', 'Quantity must be 1-20');
    if (seen.has(i.slug)) throw new HttpError(400, 'DUP_ITEM', 'Duplicate product in cart'); seen.add(i.slug);
    const p = db.prepare('SELECT * FROM products WHERE slug=? AND active=1').get(String(i.slug));
    if (!p) throw new HttpError(404, 'PRODUCT_NOT_FOUND', `Unknown product ${i.slug}`);
    if (p.stock < qty) throw new HttpError(409, 'INSUFFICIENT_STOCK', `Only ${p.stock} of ${p.name} available`, { slug: p.slug, available: p.stock });
    return { p, qty };
  });
}
function applyCoupon(db, code, subtotal) {
  if (!code) return { discount: 0, coupon: null };
  const c = db.prepare('SELECT * FROM coupons WHERE code=? AND active=1').get(String(code).trim().toUpperCase());
  if (!c) throw new HttpError(400, 'INVALID_COUPON', 'Invalid coupon');
  if (c.expires_at && Date.parse(c.expires_at) < Date.now()) throw new HttpError(400, 'COUPON_EXPIRED', 'Coupon expired');
  if (c.max_uses != null && c.used >= c.max_uses) throw new HttpError(400, 'COUPON_EXHAUSTED', 'Coupon usage limit reached');
  if (subtotal < c.min_order_paise) throw new HttpError(400, 'COUPON_MIN_ORDER', 'Order below coupon minimum');
  const d = c.kind === 'percent' ? Math.floor(subtotal * c.value / 100) : c.value;
  return { discount: Math.min(d, subtotal), coupon: c.code };
}
function quote(db, { items, coupon, address }) {
  const s = settingsSvc.get(db), lines = loadLines(db, items);
  const subtotal = lines.reduce((a, l) => a + l.p.price_paise * l.qty, 0);
  const { discount, coupon: code } = applyCoupon(db, coupon, subtotal);
  const afterDisc = subtotal - discount;
  const shipping = afterDisc === 0 || (s.ship_free_above_paise && afterDisc >= +s.ship_free_above_paise) ? 0 : +s.ship_flat_paise || 0;
  const pos = address && address.state ? stateCode(address.state) : null;
  if (address && address.state && !pos) throw new HttpError(400, 'BAD_STATE', 'Unknown state');
  if (address && address.pin && !validPin(address.pin)) throw new HttpError(400, 'BAD_PIN', 'Invalid PIN code');
  const calc = computeOrder(lines.map(l => ({ sku: l.p.sku, hsn: l.p.hsn, qty: l.qty, unitPaise: l.p.price_paise, rateBp: l.p.gst_rate_bp, taxInclusive: !!l.p.tax_inclusive })), {
    sellerStateCode: s.state_code || null, placeOfSupplyStateCode: pos, sellerGstRegistered: settingsSvc.taxReady(s), discountPaise: discount, shippingPaise: shipping,
    shippingRateBp: s.shipping_rate_bp === '' ? null : +s.shipping_rate_bp, roundToRupee: s.round_to_rupee === '1' });
  return { lines, calc, coupon: code, taxMode: settingsSvc.taxReady(s) ? 'gst' : 'no_gst_configured' };
}
module.exports = { quote };
