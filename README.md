# SUNDAY POP

```
sunday-pop/
  frontend/            Storefront (HTML/CSS/JS, fully responsive 375px to 1920px)
    index.html  css/styles.css  js/app.js (UI)  js/live.js (connects UI to the API)
  backend/             REST API (Node 22+, zero npm dependencies, SQLite)
    server.js          entry point
    src/config.js db.js seed.js app.js
    src/routes/        auth, catalog, orders, payments, admin
    src/services/      pricing, orders (state machine, invoices), razorpayApi, settings, invoice
    src/lib/           gst.js (integer-paise GST engine), razorpay.js (signature checks), util.js
    test/              api.test.js (end-to-end), gst-razorpay.test.js
    .env.example
  docs/                API.md, PAYMENTS_AND_GST.md + original planning notes
```

## Run it
Requires Node 22.13 or newer. No `npm install` needed.
```
cd backend
cp .env.example .env     # then export the variables (or set them in your host)
npm start                # http://localhost:4000  (serves the frontend AND the API)
npm test                 # 10 passing tests
```
Set `ADMIN_EMAIL` / `ADMIN_PASSWORD` before first start to create the admin account.

## What works now (tested)
Catalogue (search, filter, sort, pagination) · register/login (scrypt + signed tokens) · server-side cart quote (coupons, shipping, per-product GST, CGST/SGST vs IGST)
· orders with stock reservation, expiry and cancellation · Razorpay create-order / verify / webhook / status / refund (server-side, idempotent)
· receipts and GST tax invoices (sequential numbers) · order state machine and timeline · manual shipments (real AWB entered by admin) · returns · admin stats, settings, products, coupons, GST management report (JSON/CSV).

## Honest limits
- **Razorpay:** the code follows the documented API and signature scheme, but the tests stub Razorpay's HTTP API. Run one real test-mode payment with your own test keys before trusting it.
- **Storefront:** products and sign-in use the API. Checkout, payment page, order history and admin screens in the UI are not wired yet; the API for each exists.
- **GST:** HSN, rates, GSTIN are blank by design. Until `gst_registered`, a valid GSTIN, state and legal name are saved, the system issues receipts, not tax invoices, and charges no GST.
- **Database:** SQLite (file). Move to PostgreSQL before heavy production use. Invoices are printable HTML (Print > Save as PDF).
- Email, WhatsApp, courier APIs (Shiprocket), image uploads, e-invoicing/e-way bill are not built.
- All catalogue text, prices, ingredients and allergens are **sample development data**.
