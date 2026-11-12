# Razorpay setup
1. Razorpay Dashboard > Settings > API Keys: generate TEST keys. Put them in `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`.
2. Dashboard > Webhooks: add `https://YOUR-DOMAIN/api/v1/payments/webhook`, events `payment.captured`, `payment.failed`, `refund.processed`; copy its secret to `RAZORPAY_WEBHOOK_SECRET`.
3. Run a test payment end to end. Only then switch to live keys and `PAYMENT_MODE=live`.
# GST setup (with your accountant)
Admin > `PUT /admin/settings`: legal_name, address, state, state_code, gst_registered=1, gstin, invoice_prefix, shipping_rate_bp.
`PUT /admin/products/:slug`: hsn, gstRateBp (e.g. 500 = 5%), taxInclusive. Nothing is pre-filled; confirm HSN and rates officially.
