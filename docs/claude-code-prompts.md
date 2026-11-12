# SUNDAY POP: Claude Code prompt pack

How to use: open your project folder in a terminal, run `claude`, and paste ONE prompt at a time. Do not move on until the previous step builds, runs and its tests pass. Commit to git after each step.

Rules to paste at the start of the session:
> Work in this existing project. Preserve working code and the SUNDAY POP brand. Never invent GSTIN, HSN codes, GST rates, FSSAI numbers, reviews, tracking numbers or payment/refund success. Mark all sample data as sample. Keep secrets in .env only (git-ignored). Run the build and tests after every step and tell me the real results.

## 1. Audit
Inspect the project (structure, dependencies, routes, existing API code, build errors). Write docs/architecture.md describing what exists and a short plan. Do not change code yet.

## 2. Design system and rounded buttons
Add shared components (Button, Input, Select, Modal, Drawer, Badge, Toast, Skeleton, EmptyState). Button radius 12px (secondary 10px), inputs 10px, cards 12px, modals 14px. No circular or pill buttons. Variants: primary, secondary, outline, danger, disabled, loading. Colours: #F5F0E6, #FFFFFF, #171717, #C9A66B, #77736D, #E5DED1.

## 3. Routing and pages
Use React Router with these routes: / /shop /flavours /concept /story /track-order /wishlist /login /register /forgot-password /cart /checkout /payment /order-success /my-account /my-orders /order-details/:id /product/:slug /contact /faq /returns /shipping-policy /privacy-policy /terms /collections/:slug /admin, plus a 404. Shared header and footer. Every nav item opens its own page.

## 4. Backend and database
Create backend/ (Node, Express, TypeScript, Prisma, PostgreSQL, Zod). Money as integer paise, UUID keys, transactions for orders and stock. Tables: users, products, categories, carts, cart_items, wishlists, addresses, orders, order_items, payments, payment_events, invoices, credit_notes, gst_configurations, coupons, inventory, shipments, returns, refunds, reviews, notifications. Add migrations and seed data (12 sample products, marked sample). Add docker-compose for Postgres and .env.example.

## 5. Auth
Register, login, logout, password reset, email verification. Hash passwords (argon2 or bcrypt), short-lived access tokens, role-based access (customer, admin). Tests for each.

## 6. Catalogue, cart, wishlist
Product and category APIs, search, filters, sort, pagination. Cart and wishlist stored server-side for logged-in users. Coupon validation on the server. Frontend uses the API, not hardcoded data.

## 7. GST engine
Pure TypeScript module in integer paise. Per-product HSN and rate from the database (no default rate). Inclusive and exclusive pricing, CGST+SGST vs IGST by place of supply, discount apportioning, rounding line. If the seller is not GST registered, show no GST. Write unit tests first, including mixed carts and odd amounts.

## 8. Razorpay (test mode)
Endpoints: POST /api/payments/create-order, POST /api/payments/verify, POST /api/payments/webhook, GET /api/payments/:orderId/status. Server calculates the amount. Verify the payment signature and the webhook signature with Razorpay's official method. Idempotent processing, store every webhook event. Mark an order paid only after verification. Use test keys from .env.

## 9. Orders, stock, shipping
Order and payment status as separate fields, with an allowed-transitions table and a status history log. Reserve stock at checkout, release on failure or expiry. Manual shipment entry (courier, real AWB, tracking URL) with a clear "manual" label; Shiprocket later.

## 10. Invoices
Sequential, concurrency-safe invoice numbers. PDF generated from stored order and payment records. Credit notes for refunds. Only after your accountant confirms GST settings.

## 11. Admin
Protected /admin with server-side authorisation: dashboard, products, inventory, orders, shipments, coupons, GST and business settings, reports (CSV export, labelled management summaries, not GST returns).

## 12. Tests and deploy
Automated tests for auth, cart, coupons, GST, checkout, webhook duplicates, status transitions and admin permissions. Then an end-to-end test of the purchase journey. Write docs/deployment-guide.md and docs/payment-setup.md.

## Before going live
- Accountant confirms GST registration, GSTIN, HSN and rates.
- Real product photos, ingredients, allergens and policies replace sample data.
- Switch Razorpay to live keys only after test-mode payments, refunds and webhooks all work.

## 13. Super Admin authentication (run after steps 4, 5 and 11)
Add a separate Super Admin login at /super-admin/login with real backend auth. Endpoints under /api/v1/super-admin/auth: login, logout, refresh, forgot-password, reset-password, me. Use Argon2id, HTTP-only Secure SameSite cookies, CSRF protection, login rate limiting, account lockout, refresh-token rotation, single-use expiring reset tokens (same response whether or not the email exists), and revoke all sessions on password reset. Models: SuperAdmin, AdminUser, Role, Permission, RolePermission, AdminSession, LoginAttempt, PasswordResetToken, TwoFactorConfiguration, AuditLog, each with migrations. No public registration and no default credentials: create the first Super Admin only with a one-time CLI command (npm run create:super-admin) that refuses to run twice and never logs the password. Enforce every permission in backend middleware; hiding buttons is not authorisation. Normal admins must get 403 on Super Admin APIs, and Super Admin privileges must not be assignable from ordinary admin forms. Optional TOTP 2FA with backup codes. Audit-log logins, failures, password changes, admin creation, permission changes and settings changes, never passwords, tokens or payment secrets. Tests: valid and invalid login, lockout, session expiry, logout, reset, unauthorised access, privilege escalation, duplicate bootstrap, 2FA, session revocation. Do not break customer or normal admin login.

## 14. Super Admin operations panel (run in small pieces, after steps 4 to 13)
Build the /super-admin panel as separate prompts, testing each before the next:
a) Layout: collapsible sidebar (groups: Overview, Catalogue, Inventory, Sales, Fulfilment, Finance, Customers, Marketing, System), header with breadcrumbs, backend-powered global search (order ID, customer, mobile, product, SKU, invoice, tracking number), notification centre. Reusable components: StatCard, DataTable, FilterBar, StatusBadge, ConfirmationModal, DetailDrawer, ActivityTimeline, EmptyState, LoadingSkeleton, Toast.
b) Dashboard: KPIs and charts computed from real database aggregates only. Show "no data yet" instead of invented comparisons.
c) Products and inventory: multi-section product form, immutable stock-movement ledger (every change records product, quantity, type, reason, reference, actor, time), reservation and commit rules.
d) Orders: tabbed list with real counts, filters, CSV export; order detail page with customer, items, payment, price breakdown, delivery, timeline and internal notes (never shown to customers).
e) State machine: implement docs/order-state-machine.md exactly. Payment, shipment and refund statuses are separate fields. All transitions go through one backend function that validates, writes OrderStatusHistory and the audit log in a transaction. Kanban drag-and-drop calls that function and updates the UI only after the server confirms; blocked moves show the reason.
f) Packing station: queue, checklist, verified vs packed quantity, package weight and dimensions, cannot complete until every item is verified.
g) Shipping and tracking: manual shipment entry labelled "manual" unless a courier API is configured; real AWB only; courier webhooks idempotent; delivery marked only with courier evidence or a documented manual confirmation; exceptions dashboard that never auto-closes.
h) Finance: payments, Razorpay reconciliation, COD collection and remittance, refunds only confirmed by the provider, returns with inspection, reports with CSV export.
i) Roles: permission matrix stored in the database, enforced by backend middleware on every route.
Run the full 34-step acceptance journey from the brief at the end and report real results.
