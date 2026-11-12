'use strict';
const assert = require('node:assert/strict');
const { computeOrder, lr } = require('../src/lib/gst');
const rz = require('../src/lib/razorpay');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok -', name); };
const base = { sellerStateCode: '24', placeOfSupplyStateCode: '24', sellerGstRegistered: true };

t('largest-remainder split sums exactly', () => assert.equal(lr([1, 1, 1], 100).reduce((a, b) => a + b), 100));
t('inclusive 5%: 105.00 -> taxable 100.00 + tax 5.00 (CGST 2.50 + SGST 2.50)', () => {
  const r = computeOrder([{ sku: 'A', hsn: 'X', qty: 1, unitPaise: 10500, rateBp: 500, taxInclusive: true }], base);
  assert.deepEqual([r.totals.taxablePaise, r.totals.cgstPaise, r.totals.sgstPaise, r.totals.igstPaise, r.totals.payablePaise], [10000, 250, 250, 0, 10500]);
});
t('exclusive 12%: 100.00 -> tax 12.00, payable 112.00', () => {
  const r = computeOrder([{ sku: 'A', qty: 1, unitPaise: 10000, rateBp: 1200, taxInclusive: false }], base);
  assert.deepEqual([r.totals.taxPaise, r.totals.payablePaise], [1200, 11200]);
});
t('inter-state uses IGST only', () => {
  const r = computeOrder([{ sku: 'A', qty: 1, unitPaise: 10500, rateBp: 500, taxInclusive: true }], { ...base, placeOfSupplyStateCode: '27' });
  assert.deepEqual([r.totals.cgstPaise, r.totals.sgstPaise, r.totals.igstPaise], [0, 0, 500]);
});
t('odd paise tax: CGST+SGST always equals total tax', () => {
  const r = computeOrder([{ sku: 'A', qty: 3, unitPaise: 9901, rateBp: 1800, taxInclusive: true }], base);
  assert.equal(r.totals.cgstPaise + r.totals.sgstPaise, r.totals.taxPaise);
});
t('discount allocated across mixed rates; totals reconcile', () => {
  const r = computeOrder([
    { sku: 'A', qty: 2, unitPaise: 9900, rateBp: 500, taxInclusive: true },
    { sku: 'B', qty: 1, unitPaise: 59900, rateBp: 1200, taxInclusive: true }], { ...base, discountPaise: 7799 });
  assert.equal(r.items.reduce((a, x) => a + x.discountPaise, 0), 7799);
  assert.equal(r.totals.payablePaise, 19800 + 59900 - 7799);
  assert.equal(r.totals.taxablePaise + r.totals.taxPaise, r.totals.payablePaise);
});
t('unregistered seller or unset rate: no tax shown (dev mode)', () => {
  assert.equal(computeOrder([{ sku: 'A', qty: 1, unitPaise: 10000, rateBp: 500, taxInclusive: true }], { ...base, sellerGstRegistered: false }).totals.taxPaise, 0);
  assert.equal(computeOrder([{ sku: 'A', qty: 1, unitPaise: 10000, rateBp: null, taxInclusive: true }], base).totals.taxPaise, 0);
});
t('rounding adjustment is explicit and payable ends in whole rupees', () => {
  const r = computeOrder([{ sku: 'A', qty: 1, unitPaise: 10049, rateBp: 0, taxInclusive: true }], { ...base, roundToRupee: true });
  assert.deepEqual([r.totals.roundingPaise, r.totals.payablePaise], [-49, 10000]);
});
t('rejects float / invalid money', () => {
  assert.throws(() => computeOrder([{ sku: 'A', qty: 1, unitPaise: 99.5, rateBp: 500, taxInclusive: true }], base));
  assert.throws(() => computeOrder([{ sku: 'A', qty: 1, unitPaise: 100 }], { ...base, discountPaise: 500 }));
});
t('razorpay checkout signature: valid, tampered, wrong secret', () => {
  const sig = rz.hmac('order_X|pay_Y', 'sekret');
  assert.ok(rz.verifyPaymentSignature({ orderId: 'order_X', paymentId: 'pay_Y', signature: sig }, 'sekret'));
  assert.ok(!rz.verifyPaymentSignature({ orderId: 'order_X', paymentId: 'pay_Z', signature: sig }, 'sekret'));
  assert.ok(!rz.verifyPaymentSignature({ orderId: 'order_X', paymentId: 'pay_Y', signature: sig }, 'other'));
});
t('razorpay webhook signature uses raw body', () => {
  const body = '{"event":"payment.captured"}', sig = rz.hmac(body, 'whsec');
  assert.ok(rz.verifyWebhookSignature(body, sig, 'whsec'));
  assert.ok(!rz.verifyWebhookSignature(body + ' ', sig, 'whsec'));
  assert.ok(!rz.verifyWebhookSignature(body, '', 'whsec'));
});
console.log(`\n${n} tests passed`);
