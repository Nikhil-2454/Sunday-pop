'use strict';
const crypto = require('node:crypto');
class HttpError extends Error { constructor(status, code, message, extra) { super(message || code); this.status = status; this.code = code; this.extra = extra; } }
const b64 = b => Buffer.from(b).toString('base64url');
function hashPassword(pw) { const s = crypto.randomBytes(16); return `scrypt$${s.toString('hex')}$${crypto.scryptSync(pw, s, 64).toString('hex')}`; }
function checkPassword(pw, h) { const [, s, k] = String(h).split('$'); if (!s) return false; const a = crypto.scryptSync(pw, Buffer.from(s, 'hex'), 64), b = Buffer.from(k, 'hex'); return a.length === b.length && crypto.timingSafeEqual(a, b); }
function signToken(payload, secret, ttlSec = 7 * 86400) { const body = b64(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSec })); return `${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`; }
function readToken(t, secret) {
  const [body, sig] = String(t || '').split('.'); if (!body || !sig) return null;
  const good = crypto.createHmac('sha256', secret).update(body).digest('base64url'); const x = Buffer.from(sig), y = Buffer.from(good);
  if (x.length !== y.length || !crypto.timingSafeEqual(x, y)) return null;
  try { const p = JSON.parse(Buffer.from(body, 'base64url')); return p.exp > Date.now() / 1000 ? p : null; } catch { return null; }
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rupees = p => '₹' + (p / 100).toFixed(2);
const STATE_CODES = { 'jammu and kashmir': '01', 'himachal pradesh': '02', punjab: '03', chandigarh: '04', uttarakhand: '05', haryana: '06', delhi: '07', rajasthan: '08', 'uttar pradesh': '09', bihar: '10', sikkim: '11',
  'arunachal pradesh': '12', nagaland: '13', manipur: '14', mizoram: '15', tripura: '16', meghalaya: '17', assam: '18', 'west bengal': '19', jharkhand: '20', odisha: '21', chhattisgarh: '22', 'madhya pradesh': '23',
  gujarat: '24', 'dadra and nagar haveli and daman and diu': '26', maharashtra: '27', karnataka: '29', goa: '30', lakshadweep: '31', kerala: '32', 'tamil nadu': '33', puducherry: '34', 'andaman and nicobar islands': '35',
  telangana: '36', 'andhra pradesh': '37', ladakh: '38' };
const stateCode = n => STATE_CODES[String(n || '').trim().toLowerCase()] || null;
const validPin = p => /^[1-9][0-9]{5}$/.test(String(p || ''));
const validMobile = m => /^[6-9][0-9]{9}$/.test(String(m || ''));
const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || ''));
module.exports = { HttpError, hashPassword, checkPassword, signToken, readToken, esc, rupees, stateCode, validPin, validMobile, validEmail };
