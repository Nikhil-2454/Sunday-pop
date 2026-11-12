'use strict';
const cfg = require('./src/config')(), db = require('./src/db').open(cfg.dbPath);
require('./src/seed').seed(db);
const { hashPassword } = require('./src/lib/util');
if (cfg.adminEmail && cfg.adminPassword && !db.prepare('SELECT 1 FROM users WHERE email=?').get(cfg.adminEmail.toLowerCase()))
  db.prepare("INSERT INTO users(email,name,pw_hash,role) VALUES(?,?,?,'admin')").run(cfg.adminEmail.toLowerCase(), 'Admin', hashPassword(cfg.adminPassword));
if (cfg.jwtSecret === 'dev-only-change-me') console.warn('WARNING: set JWT_SECRET before deploying.');
require('./src/app').createApp(db, cfg).listen(cfg.port, () => console.log(`SUNDAY POP running on http://localhost:${cfg.port}  (payments: ${cfg.rzKeyId ? cfg.paymentMode + ' keys set' : 'Razorpay NOT configured'})`));
