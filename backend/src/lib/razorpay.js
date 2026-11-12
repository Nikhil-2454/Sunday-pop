'use strict';
// Razorpay verification using only node:crypto, per Razorpay's documented scheme:
//  - Checkout payment: HMAC_SHA256(order_id + "|" + payment_id, KEY_SECRET) == razorpay_signature
//  - Webhook: HMAC_SHA256(raw request body, WEBHOOK_SECRET) == X-Razorpay-Signature header
// Always verify against the RAW body bytes, not re-serialised JSON.
const crypto = require('node:crypto');
const hmac = (data, secret) => crypto.createHmac('sha256', secret).update(data).digest('hex');
function safeEq(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8'), y = Buffer.from(String(b || ''), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function verifyPaymentSignature({ orderId, paymentId, signature }, keySecret) {
  if (!orderId || !paymentId || !signature || !keySecret) return false;
  return safeEq(hmac(`${orderId}|${paymentId}`, keySecret), signature);
}
function verifyWebhookSignature(rawBody, signature, webhookSecret) {
  if (!rawBody || !signature || !webhookSecret) return false;
  return safeEq(hmac(rawBody, webhookSecret), signature);
}
module.exports = { verifyPaymentSignature, verifyWebhookSignature, hmac };
