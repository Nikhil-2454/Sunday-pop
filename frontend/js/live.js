// Connects the storefront to the backend API when one is reachable (same origin, or set window.SP_API).
// If no backend answers, the bundled sample data in app.js keeps working as a preview.
const API = (window.SP_API || '') + '/api/v1';
const token = () => { try { return localStorage.getItem('sp_token'); } catch (e) { return null; } };
async function api(path, opts = {}) {
  const r = await fetch(API + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: 'Bearer ' + token() } : {}) }, body: opts.body && JSON.stringify(opts.body) });
  const j = await r.json(); if (!r.ok) throw new Error((j.error && j.error.message) || 'Request failed'); return j;
}
(async () => {
  try {
    const { items } = await api('/products?pageSize=50');
    if (!items.length) return;
    P.splice(0, P.length, ...items.map(x => ({ s: x.slug, n: x.name, t: x.flavour, c: x.colour, d: x.shortDescription, tx: x.shortDescription, p: x.pricePaise / 100, st: x.stock })));
    route();
  } catch (e) { /* no backend: keep sample data */ }
})();
document.addEventListener('submit', async e => {
  const f = e.target; if (f.id !== 'lf' && f.id !== 'rf') return;
  e.preventDefault(); e.stopPropagation();
  const email = (f.id === 'lf' ? $('#le') : $('#re')).value.trim(), password = (f.id === 'lf' ? $('#lp') : $('#rp')).value;
  try {
    const r = await api(f.id === 'lf' ? '/auth/login' : '/auth/register', { method: 'POST', body: { email, password } });
    localStorage.setItem('sp_token', r.token); user = { email: r.user.email }; sv('sp_user', user); toast(f.id === 'lf' ? 'Signed in' : 'Account created'); location.hash = 'sign-in'; route();
  } catch (err) { toast(err.message); }
}, true);
document.addEventListener('click', e => { if (e.target.id === 'so') try { localStorage.removeItem('sp_token'); } catch (x) {} }, true);
