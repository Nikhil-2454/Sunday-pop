'use strict';
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { HttpError, readToken } = require('./lib/util');
const MIME = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
function createApp(db, cfg) {
  const ctx = { db, cfg };
  const routes = ['auth', 'catalog', 'orders', 'payments', 'admin'].flatMap(n => require(`./routes/${n}`)(ctx)).map(([m, p, guard, fn]) => ({ m, guard, fn, keys: [...p.matchAll(/:(\w+)/g)].map(x => x[1]), re: new RegExp('^' + p.replace(/:\w+/g, '([^/]+)') + '$') }));
  const hits = new Map();
  const limited = ip => { const now = Date.now(), a = (hits.get(ip) || []).filter(t => now - t < 60000); a.push(now); hits.set(ip, a); return a.length > 30; };
  const send = (res, status, type, data, extra = {}) => { res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN', 'Referrer-Policy': 'same-origin',
    'Access-Control-Allow-Origin': cfg.corsOrigin, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', ...extra }); res.end(data); };
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (req.method === 'OPTIONS') return send(res, 204, 'text/plain', '');
      if (!url.pathname.startsWith('/api/v1/')) { // static frontend
        let f = path.join(cfg.frontendDir, url.pathname === '/' ? 'index.html' : url.pathname); if (!f.startsWith(cfg.frontendDir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(cfg.frontendDir, 'index.html');
        return send(res, 200, MIME[path.extname(f)] || 'application/octet-stream', fs.readFileSync(f));
      }
      const p = url.pathname.slice(7), chunks = []; let size = 0;
      for await (const c of req) { size += c.length; if (size > 1e6) throw new HttpError(413, 'TOO_LARGE'); chunks.push(c); }
      const raw = Buffer.concat(chunks).toString('utf8'); let body = {};
      if (raw) { try { body = JSON.parse(raw); } catch { throw new HttpError(400, 'BAD_JSON', 'Body must be valid JSON'); } }
      const r = routes.find(x => x.m === req.method && x.re.test(p)); if (!r) throw new HttpError(404, 'NOT_FOUND', 'No such endpoint');
      if (r.guard === 'rate' && limited(req.socket.remoteAddress)) throw new HttpError(429, 'RATE_LIMITED', 'Too many requests');
      const tok = readToken((req.headers.authorization || '').replace(/^Bearer /, ''), cfg.jwtSecret);
      const user = tok && db.prepare('SELECT id,email,name,role FROM users WHERE id=?').get(tok.uid) || null;
      if (r.guard === 'user' && !user) throw new HttpError(401, 'AUTH_REQUIRED', 'Please sign in');
      if (r.guard === 'admin') { if (!user) throw new HttpError(401, 'AUTH_REQUIRED', 'Please sign in'); if (user.role !== 'admin') throw new HttpError(403, 'FORBIDDEN', 'Admin access required'); }
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(p.match(r.re)[i + 1])]));
      const out = await r.fn({ params, query: Object.fromEntries(url.searchParams), body, raw, headers: req.headers, user });
      if (out.html) return send(res, 200, 'text/html; charset=utf-8', out.html);
      if (out.csv != null) return send(res, 200, 'text/csv', out.csv, { 'Content-Disposition': 'attachment; filename="report.csv"' });
      return send(res, out.status || 200, 'application/json', JSON.stringify(out.body));
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, 'application/json', JSON.stringify({ error: { code: e.code, message: e.message, ...(e.extra || {}) } }));
      console.error(e); send(res, 500, 'application/json', JSON.stringify({ error: { code: 'INTERNAL', message: 'Something went wrong' } }));
    }
  });
}
module.exports = { createApp };
