# API (base: /api/v1). Money is integer paise. Auth: `Authorization: Bearer <token>`.
Errors: `{ "error": { "code": "...", "message": "..." } }`

| Method & path | Auth | Purpose |
|---|---|---|
| GET /health | – | liveness |
| GET /products?q&category&flavour&minPrice&maxPrice&inStock=1&sort=price_asc\|price_desc\|newest\|popular&page&pageSize | – | list |
| GET /products/:slug | – | detail + related |
| POST /cart/quote {items:[{slug,qty}],coupon,address:{state,pin}} | – | server totals incl. GST |
| GET /shipping/pin/:pin | – | PIN format check (serviceability unavailable until a courier is configured) |
| POST /auth/register, /auth/login · GET /auth/me | – / user | accounts |
| POST /early-access {email,name} | – | sign-up list |
| POST /orders {items,coupon,address,email} | optional | create pending order, reserve stock |
| GET /orders · GET /orders/:id(?email=) | user / owner | history, detail, timeline, shipment |
| GET /orders/:id/invoice | owner | receipt or tax invoice (after payment) |
| POST /orders/:id/cancel · POST /orders/:id/returns {reason} | owner | cancel unpaid / return delivered |
| POST /payments/create-order {orderId} | owner | Razorpay order from stored amount |
| POST /payments/verify {razorpay_order_id,razorpay_payment_id,razorpay_signature} | – | signature check, confirm |
| POST /payments/webhook | signature | authoritative events, de-duplicated |
| GET /payments/:orderId/status | owner | status + gateway reconciliation |
| POST /payments/:orderId/refund {amountPaise,reason} | admin | real Razorpay refund |
| GET /admin/stats · GET /admin/orders?status= | admin | dashboard |
| PATCH /admin/orders/:id/status · POST /admin/orders/:id/shipment | admin | fulfilment (state machine enforced) |
| GET/PUT /admin/settings · PUT /admin/products/:slug · POST /admin/coupons | admin | business, GST, catalogue |
| GET /admin/reports/gst(?format=csv) | admin | management summary, not a GST return |
