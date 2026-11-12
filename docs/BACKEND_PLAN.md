# Backend plan (not built yet)
The current project is a static front-end preview. These parts need a server:
- Auth: register/login/reset with hashed passwords (Node + Express + PostgreSQL).
- Orders: server recalculates cart, stock, coupon and GST; stores money as integer paise.
- Razorpay: POST /api/payments/create-order, /verify, /webhook, GET /:orderId/status. Verify signatures server-side; mark paid only after verification. Keys only in .env.
- GST: per-product HSN and rate from your accountant; CGST+SGST vs IGST by place of supply; invoice numbering; PDF invoices.
- Shipping/tracking: courier API (e.g. Shiprocket); no invented tracking.
- Admin: role-based, server-side authorisation.
Tables: users, products, categories, carts, cart_items, wishlists, addresses, orders, order_items, payments, payment_events, invoices, credit_notes, gst_configurations, coupons, inventory, shipments, returns, refunds, reviews.
