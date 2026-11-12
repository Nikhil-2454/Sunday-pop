'use strict';
const path = require('node:path');
const e = process.env;
module.exports = () => ({
  port: +e.PORT || 4000,
  dbPath: e.DB_PATH || path.join(__dirname, '..', 'data', 'sunday-pop.db'),
  jwtSecret: e.JWT_SECRET || 'dev-only-change-me',
  corsOrigin: e.CORS_ORIGIN || '*',
  paymentMode: e.PAYMENT_MODE || 'test',
  rzKeyId: e.RAZORPAY_KEY_ID || '', rzKeySecret: e.RAZORPAY_KEY_SECRET || '', rzWebhookSecret: e.RAZORPAY_WEBHOOK_SECRET || '',
  adminEmail: e.ADMIN_EMAIL || '', adminPassword: e.ADMIN_PASSWORD || '',
  pendingMinutes: +e.PENDING_ORDER_MINUTES || 30,
  frontendDir: path.join(__dirname, '..', '..', 'frontend'),
});
