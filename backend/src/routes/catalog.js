'use strict';
const { HttpError, validPin } = require('../lib/util');
const pricing = require('../services/pricing');
const pub = p => ({ id: p.id, slug: p.slug, sku: p.sku, name: p.name, category: p.category, flavour: p.flavour, colour: p.colour, shortDescription: p.short_desc, description: p.description,
  pricePaise: p.price_paise, mrpPaise: p.mrp_paise, weightG: p.weight_g, ingredients: p.ingredients, allergens: p.allergens, hsn: p.hsn, gstRateBp: p.gst_rate_bp,
  taxInclusive: !!p.tax_inclusive, stock: p.stock, inStock: p.stock > 0, tags: (p.tags || '').split(','), sample: !!p.sample });
module.exports = ({ db }) => [
  ['GET', '/health', null, () => ({ body: { ok: true } })],
  ['GET', '/products', null, ({ query }) => {
    const w = ['active=1'], a = [];
    if (query.q) { w.push('(name LIKE ? OR flavour LIKE ? OR tags LIKE ?)'); const q = `%${query.q}%`; a.push(q, q, q); }
    if (query.category) { w.push('category=?'); a.push(query.category); }
    if (query.flavour) { w.push('flavour=?'); a.push(query.flavour); }
    if (query.minPrice) { w.push('price_paise>=?'); a.push(+query.minPrice); }
    if (query.maxPrice) { w.push('price_paise<=?'); a.push(+query.maxPrice); }
    if (query.inStock === '1') w.push('stock>0');
    const order = { price_asc: 'price_paise ASC', price_desc: 'price_paise DESC', newest: 'id DESC', popular: 'popularity DESC' }[query.sort] || 'id ASC';
    const page = Math.max(1, +query.page || 1), size = Math.min(50, Math.max(1, +query.pageSize || 12));
    const total = db.prepare(`SELECT COUNT(*) c FROM products WHERE ${w.join(' AND ')}`).get(...a).c;
    const rows = db.prepare(`SELECT * FROM products WHERE ${w.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...a, size, (page - 1) * size);
    return { body: { total, page, pageSize: size, items: rows.map(pub) } };
  }],
  ['GET', '/products/:slug', null, ({ params }) => {
    const p = db.prepare('SELECT * FROM products WHERE slug=? AND active=1').get(params.slug); if (!p) throw new HttpError(404, 'PRODUCT_NOT_FOUND');
    const related = db.prepare('SELECT * FROM products WHERE category=? AND slug<>? AND active=1 LIMIT 4').all(p.category, p.slug).map(pub);
    return { body: { ...pub(p), related } };
  }],
  ['POST', '/cart/quote', null, ({ body }) => {
    const q = pricing.quote(db, body);
    return { body: { taxMode: q.taxMode, coupon: q.coupon, intraState: q.calc.intraState, totals: q.calc.totals, items: q.calc.items.map((i, n) => ({ slug: q.lines[n].p.slug, name: q.lines[n].p.name, ...i })) } };
  }],
  ['GET', '/shipping/pin/:pin', null, ({ params }) => {
    if (!validPin(params.pin)) throw new HttpError(400, 'BAD_PIN', 'PIN code must be 6 digits');
    return { body: { pin: params.pin, formatValid: true, serviceable: null, note: 'No courier provider is configured, so serviceability and delivery dates are not available yet.' } };
  }],
];
