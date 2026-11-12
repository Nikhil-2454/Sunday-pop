'use strict';
exports.get = db => Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(r => [r.key, r.value]));
exports.set = (db, obj) => { const s = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'); for (const [k, v] of Object.entries(obj)) s.run(k, String(v ?? '')); };
exports.taxReady = s => s.gst_registered === '1' && /^[0-9]{2}[A-Z0-9]{13}$/.test(s.gstin || '') && !!s.state_code && !!s.legal_name;
