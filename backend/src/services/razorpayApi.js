'use strict';
// Thin client for Razorpay's REST API (https://razorpay.com/docs/api/). Uses global fetch; no SDK needed.
const { HttpError } = require('../lib/util');
async function call(cfg, method, path, body) {
  if (!cfg.rzKeyId || !cfg.rzKeySecret) throw new HttpError(503, 'PAYMENT_NOT_CONFIGURED', 'Razorpay keys are not configured on the server');
  const r = await fetch('https://api.razorpay.com/v1' + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(`${cfg.rzKeyId}:${cfg.rzKeySecret}`).toString('base64') }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(502, 'GATEWAY_ERROR', (j.error && j.error.description) || 'Razorpay request failed');
  return j;
}
exports.createOrder = (cfg, { amountPaise, receipt, notes }) => call(cfg, 'POST', '/orders', { amount: amountPaise, currency: 'INR', receipt, notes });
exports.fetchPayment = (cfg, id) => call(cfg, 'GET', `/payments/${encodeURIComponent(id)}`);
exports.refund = (cfg, paymentId, amountPaise, notes) => call(cfg, 'POST', `/payments/${encodeURIComponent(paymentId)}/refund`, { amount: amountPaise, notes });
