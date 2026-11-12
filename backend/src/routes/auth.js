'use strict';
const { HttpError, hashPassword, checkPassword, signToken, validEmail } = require('../lib/util');
module.exports = ({ db, cfg }) => [
  ['POST', '/auth/register', 'rate', ({ body }) => {
    const email = String(body.email || '').trim().toLowerCase();
    if (!validEmail(email)) throw new HttpError(400, 'BAD_EMAIL', 'Enter a valid email');
    if (String(body.password || '').length < 8) throw new HttpError(400, 'WEAK_PASSWORD', 'Password must be 8+ characters');
    if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) throw new HttpError(409, 'EMAIL_EXISTS', 'Account already exists');
    const r = db.prepare('INSERT INTO users(email,name,pw_hash) VALUES(?,?,?)').run(email, String(body.name || '').slice(0, 80), hashPassword(body.password));
    const user = { id: Number(r.lastInsertRowid), email, role: 'customer' };
    return { status: 201, body: { user, token: signToken({ uid: user.id, role: user.role }, cfg.jwtSecret) } };
  }],
  ['POST', '/auth/login', 'rate', ({ body }) => {
    const u = db.prepare('SELECT * FROM users WHERE email=?').get(String(body.email || '').trim().toLowerCase());
    if (!u || !checkPassword(String(body.password || ''), u.pw_hash)) throw new HttpError(401, 'BAD_CREDENTIALS', 'Incorrect email or password');
    return { body: { user: { id: u.id, email: u.email, role: u.role }, token: signToken({ uid: u.id, role: u.role }, cfg.jwtSecret) } };
  }],
  ['GET', '/auth/me', 'user', ({ user }) => ({ body: { user: { id: user.id, email: user.email, name: user.name, role: user.role } } })],
  ['POST', '/early-access', 'rate', ({ body }) => {
    const email = String(body.email || '').trim().toLowerCase(); if (!validEmail(email)) throw new HttpError(400, 'BAD_EMAIL', 'Enter a valid email');
    db.prepare('INSERT OR IGNORE INTO early_access(email,name) VALUES(?,?)').run(email, String(body.name || '').slice(0, 80)); return { status: 201, body: { ok: true } };
  }],
];
