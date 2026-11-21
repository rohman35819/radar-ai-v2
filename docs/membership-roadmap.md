# RADAR AI — Account & Membership Foundation

## Draft tiers (not yet billable)
- **Free — Rp0/month:** basic market dashboard, standard radar, limited AI quota and history.
- **VIP — Rp99,000/month:** Free features, larger AI quota, fuller AI Council, deeper Futures analysis and longer history.
- **VVIP — Rp249,000/month:** VIP features, highest AI quota, processing priority, advanced analysis and priority support.

Prices and entitlements are initial product hypotheses. They must be validated against model/API and hosting costs before launch.

## Current implementation
The `/membership.html` page is a visual prototype only. Login, registration, plan activation, billing, and payment are deliberately not simulated. The form does not transmit or persist submitted data.

## Required before public launch
1. Persistent database and schema migrations for users, sessions, subscriptions, invoices and audit events.
2. Password hashing with Argon2id or scrypt, secure HttpOnly/Secure/SameSite cookies, CSRF protection, email verification, rate limits and password reset.
3. Server-side authorization and entitlement checks on every paid API route; never trust plan names from browser storage.
4. Payment gateway integration with signed webhook verification, idempotency and subscription expiry/cancellation handling.
5. Per-user tenant isolation for watchlists, AI history and exchange connections.
6. Encrypt Binance API secrets server-side; no withdrawal permission; explicit trading consent, order confirmation, risk limits and audit logs.
7. Admin tools with role-based access and an auditable manual-comp/ban process.

## Rollout
Prototype UI → auth/database → server-enforced plan entitlements → payment sandbox → payment production → per-user exchange integration. Do not enable real-money trading until security review and testnet validation pass.
