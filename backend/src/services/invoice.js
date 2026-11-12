'use strict';
const { esc, rupees } = require('../lib/util');
// Printable HTML invoice built ONLY from stored order records. (PDF: use browser Print > Save as PDF, or add a PDF library later.)
module.exports = (db, order, inv, s) => {
  const items = db.prepare('SELECT * FROM order_items WHERE order_id=?').all(order.id), t = JSON.parse(order.totals), a = JSON.parse(order.address), tax = inv.kind === 'tax_invoice';
  const rows = items.map(i => { const l = JSON.parse(i.line); return `<tr><td>${esc(i.name)}<br><small>${esc(i.sku)}${i.hsn ? ' · HSN ' + esc(i.hsn) : ''}</small></td><td>${i.qty}</td><td>${rupees(i.unit_paise)}</td><td>${rupees(l.discountPaise)}</td><td>${rupees(l.taxable)}</td>${tax ? `<td>${rupees(l.cgst)}</td><td>${rupees(l.sgst)}</td><td>${rupees(l.igst)}</td>` : ''}</tr>`; }).join('');
  return `<!doctype html><meta charset="utf-8"><title>${esc(inv.number)}</title><style>body{font:14px system-ui;max-width:800px;margin:30px auto;padding:0 16px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #ddd;padding:8px;text-align:left}small{color:#666}.r{text-align:right}</style>
<h1>${tax ? 'TAX INVOICE' : 'ORDER RECEIPT'}</h1>${tax ? '' : '<p><b>This is not a GST tax invoice.</b> GST registration details are not configured.</p>'}
<p><b>${esc(s.legal_name || s.brand_name)}</b><br>${esc(s.address)}<br>${tax ? 'GSTIN: ' + esc(s.gstin) : ''}</p>
<p>No: <b>${esc(inv.number)}</b> · Date: ${esc(inv.issued_at)} · Order: ${esc(order.number)} · Payment: ${esc(order.payment_status)}${tax ? ` · Place of supply: ${esc(a.state)}` : ''}</p>
<p>Bill/Ship to: ${esc(a.name)}, ${esc([a.line1, a.area, a.city, a.state, a.pin].filter(Boolean).join(', '))}</p>
<table><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Discount</th><th>Taxable</th>${tax ? '<th>CGST</th><th>SGST</th><th>IGST</th>' : ''}</tr>${rows}</table>
<p class="r">Subtotal ${rupees(t.subtotalPaise)} · Discount −${rupees(t.discountPaise)} · Shipping ${rupees(t.shippingPaise)}${tax ? ` · Taxable ${rupees(t.taxablePaise)} · CGST ${rupees(t.cgstPaise)} · SGST ${rupees(t.sgstPaise)} · IGST ${rupees(t.igstPaise)}` : ''} · Rounding ${rupees(t.roundingPaise)}<br><b>Total ${rupees(t.payablePaise)}</b></p>`;
};
