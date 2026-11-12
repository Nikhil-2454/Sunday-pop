'use strict';
// GST engine. All money is INTEGER PAISE. No floating point on money.
// Rates are in basis points of a percent (5% = 500) so 2.5% = 250 is exact.
// A rate of null means "not configured": no tax is computed (development mode).
const lr = (parts, total) => { // largest-remainder split: sums exactly to total
  const sum = parts.reduce((a, b) => a + b, 0);
  if (sum === 0) return parts.map(() => 0);
  const raw = parts.map(p => (total * p) / sum);
  const out = raw.map(Math.floor);
  let rem = total - out.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1])
    .forEach(([, i]) => { if (rem > 0) { out[i]++; rem--; } });
  return out;
};
const divRound = (n, d) => Math.floor((2 * n + d) / (2 * d)); // half-up, non-negative ints

function isIntraState(sellerStateCode, placeOfSupplyStateCode) {
  return !!sellerStateCode && sellerStateCode === placeOfSupplyStateCode;
}

/**
 * lines: [{ sku, hsn, qty, unitPaise, rateBp|null, taxInclusive:boolean }]
 * opts : { sellerStateCode, placeOfSupplyStateCode, sellerGstRegistered,
 *          discountPaise, shippingPaise, shippingRateBp, roundToRupee }
 * Discount is allocated across lines in proportion to line value.
 * Shipping is taxed at shippingRateBp (accountant-configured; null = untaxed).
 */
function computeOrder(lines, opts) {
  const o = Object.assign({ discountPaise: 0, shippingPaise: 0, shippingRateBp: null, roundToRupee: false }, opts);
  if (!Number.isInteger(o.discountPaise) || o.discountPaise < 0) throw new Error('bad discount');
  const gross = lines.map(l => {
    if (!Number.isInteger(l.qty) || l.qty < 1) throw new Error('bad qty');
    if (!Number.isInteger(l.unitPaise) || l.unitPaise < 0) throw new Error('bad price');
    return l.unitPaise * l.qty;
  });
  const subtotal = gross.reduce((a, b) => a + b, 0);
  if (o.discountPaise > subtotal) throw new Error('discount exceeds subtotal');
  const disc = lr(gross, o.discountPaise);
  const intra = isIntraState(o.sellerStateCode, o.placeOfSupplyStateCode);
  const taxOn = !!o.sellerGstRegistered;

  const mk = (value, rateBp, inclusive) => {
    // value = amount after discount, as entered (incl. or excl. of tax)
    if (!taxOn || rateBp == null || rateBp === 0)
      return { taxable: value, cgst: 0, sgst: 0, igst: 0, tax: 0, payable: value };
    let taxable, tax;
    if (inclusive) { taxable = divRound(value * 10000, 10000 + rateBp); tax = value - taxable; }
    else { taxable = value; tax = divRound(value * rateBp, 10000); }
    const cgst = intra ? Math.floor(tax / 2) : 0;
    const sgst = intra ? tax - cgst : 0;
    const igst = intra ? 0 : tax;
    return { taxable, cgst, sgst, igst, tax, payable: inclusive ? value : value + tax };
  };

  const items = lines.map((l, i) => {
    const net = gross[i] - disc[i];
    return Object.assign({ sku: l.sku, hsn: l.hsn || null, qty: l.qty, rateBp: l.rateBp ?? null,
      grossPaise: gross[i], discountPaise: disc[i] }, mk(net, l.rateBp, l.taxInclusive));
  });
  // Shipping: assumed entered tax-inclusive when a rate is set (configurable decision for the accountant).
  const ship = mk(o.shippingPaise, o.shippingRateBp, true);

  const sum = k => items.reduce((a, x) => a + x[k], 0) + ship[k];
  const t = { subtotalPaise: subtotal, discountPaise: o.discountPaise, shippingPaise: o.shippingPaise,
    taxablePaise: sum('taxable'), cgstPaise: sum('cgst'), sgstPaise: sum('sgst'), igstPaise: sum('igst'),
    taxPaise: sum('tax') };
  const exact = items.reduce((a, x) => a + x.payable, 0) + ship.payable;
  let rounding = 0;
  if (o.roundToRupee) rounding = divRound(exact, 100) * 100 - exact;
  return { intraState: intra, items, shipping: ship, totals: Object.assign(t, { roundingPaise: rounding, payablePaise: exact + rounding }) };
}
module.exports = { computeOrder, isIntraState, lr, divRound };
