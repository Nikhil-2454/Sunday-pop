'use strict';
const fs = require('node:fs'), path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, pw_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'customer', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, sku TEXT UNIQUE NOT NULL, name TEXT NOT NULL, category TEXT, flavour TEXT, colour TEXT, short_desc TEXT, description TEXT,
  price_paise INTEGER NOT NULL, mrp_paise INTEGER, weight_g INTEGER, ingredients TEXT, allergens TEXT, hsn TEXT, gst_rate_bp INTEGER, tax_inclusive INTEGER NOT NULL DEFAULT 1,
  stock INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, sample INTEGER NOT NULL DEFAULT 1, tags TEXT, popularity INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS coupons(code TEXT PRIMARY KEY, kind TEXT NOT NULL, value INTEGER NOT NULL, min_order_paise INTEGER DEFAULT 0, expires_at TEXT, max_uses INTEGER, used INTEGER DEFAULT 0, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY, number TEXT UNIQUE, user_id INTEGER, email TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'payment_pending', payment_status TEXT NOT NULL DEFAULT 'unpaid',
  address TEXT NOT NULL, coupon TEXT, totals TEXT NOT NULL, tax_detail TEXT, payable_paise INTEGER NOT NULL, stock_released INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS order_items(id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), product_id INTEGER, sku TEXT, name TEXT, hsn TEXT, qty INTEGER, unit_paise INTEGER, rate_bp INTEGER, line TEXT);
CREATE TABLE IF NOT EXISTS order_events(id INTEGER PRIMARY KEY, order_id INTEGER, from_status TEXT, to_status TEXT, actor TEXT, remarks TEXT, at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL, rp_order_id TEXT UNIQUE, rp_payment_id TEXT UNIQUE, amount_paise INTEGER, status TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS payment_events(event_id TEXT PRIMARY KEY, type TEXT, payload TEXT, at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS refunds(id INTEGER PRIMARY KEY, order_id INTEGER, rp_refund_id TEXT UNIQUE, rp_payment_id TEXT, amount_paise INTEGER, status TEXT, reason TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS invoices(id INTEGER PRIMARY KEY, order_id INTEGER UNIQUE, number TEXT UNIQUE NOT NULL, kind TEXT NOT NULL, issued_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS shipments(id INTEGER PRIMARY KEY, order_id INTEGER, courier TEXT, awb TEXT, tracking_url TEXT, status TEXT, weight_g INTEGER, dispatched_at TEXT, delivered_at TEXT, manual INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS returns(id INTEGER PRIMARY KEY, order_id INTEGER, user_id INTEGER, reason TEXT, status TEXT DEFAULT 'requested', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS early_access(id INTEGER PRIMARY KEY, email TEXT UNIQUE, name TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY, actor TEXT, action TEXT, detail TEXT, at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS ix_orders_user ON orders(user_id); CREATE INDEX IF NOT EXISTS ix_items_order ON order_items(order_id);`;
function open(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;'); db.exec(SCHEMA);
  let depth = 0; // re-entrant: nested calls join the outer transaction
  db.tx = fn => { if (depth) return fn(); db.exec('BEGIN IMMEDIATE'); depth++; try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } finally { depth--; } };
  return db;
}
module.exports = { open };
