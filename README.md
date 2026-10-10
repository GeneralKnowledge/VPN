# Northstar VPN

A **simple, honest, self-serve UK VPN** product: clear setup, billing honesty, and dashboard control on managed infrastructure — not a Nord-style feature clone.

Runs fully in **mock mode** locally; activate VPNresellers, Stripe, and email via environment variables when you have accounts.

Brand name, colours, and plans are centralized in `@northstar/config` — replace globally without hunting strings.

## What this is

A production-oriented Next.js application with:

- Marketing site (pricing, features, locations, `/trust`, legal drafts)
- Customer auth + self-serve dashboard (devices/VPN, locations, billing, account sessions, support, referrals)
- Onboarding checklist (dismissible) and download guides for WireGuard / OpenVPN
- Admin dashboard (customers, VPN, payments, audit, health)
- Provider abstractions: VPN, billing, email, analytics
- SQLite local database (Postgres-ready schema path documented)
- Seeds, unit tests, ESLint, CI, and Playwright smoke/e2e

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) and [docs/vpnresellers.md](./docs/vpnresellers.md).

```
apps/web                 Next.js (VPN + eSIM hosts, dashboard, admin, API)
packages/config          Brands, plans, product hosts, env
packages/db              Drizzle schema, migrate, seed
packages/vpn-provider    MockVPNProvider + VPNResellersProvider
packages/esim-provider   MockEsimProvider + ResellPortalEsimProvider
packages/billing         MockBillingProvider + Stripe stub
packages/email           MockEmailProvider + SMTP stub
```

## Local setup (mock mode)

```bash
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Seed credentials (development only)

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@northstar.local` | `AdminDev123!` |
| Customer (subscribed + VPN) | `customer@northstar.local` | `CustomerDev123!` |
| Lead (no subscription) | `lead@northstar.local` | `LeadDev123!` |

Never use these in production.

## Environment variables

See [.env.example](./.env.example). Grouped as Application, Database, Auth, VPN, Billing, Email, Analytics, Error reporting, Seed.

Mock defaults:

```env
APP_ENV=development
VPN_PROVIDER=mock
BILLING_PROVIDER=mock
EMAIL_PROVIDER=mock
ANALYTICS_PROVIDER=mock
DATABASE_URL=file:./data/northstar.db
```

## Scripts

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start Next.js |
| `pnpm db:migrate` | Apply SQLite schema |
| `pnpm db:seed` | Seed plans, locations, users |
| `pnpm db:reset` | Delete local DB files |
| `pnpm test` | Unit/integration (Vitest) |
| `pnpm test:e2e` | Playwright (install browsers first) |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript |

## Self-serve customer journey (mock)

1. Visit marketing site → Pricing or `/trust` → Register  
2. Choose a plan → Mock checkout → Pay  
3. VPN access provisions automatically  
4. Dashboard checklist → pick a location → name your device → download config / QR  
5. Manage devices on **Devices**, cancel/resume on **Billing**, review **Account** sessions  
6. Admin login → customers / subscriptions → suspend / restore → audit trail  

See [docs/LAUNCH-CHECKLIST.md](./docs/LAUNCH-CHECKLIST.md) for production cutover (real Stripe, SMTP, VPN credentials) — those need external accounts and are out of scope for mock self-serve work.

## Dual product (VPN + eSIM)

Same deploy, hostname selects product. Sessions stay host-scoped (no cross-subdomain SSO).

- VPN: `http://localhost:3000` or hosts in `PRODUCT_HOST_VPN`
- eSIM: hosts in `PRODUCT_HOST_ESIM` (default includes `sim.localhost`)

**Before deploying or buying APIs**, follow [docs/PRE-CUTOVER.md](./docs/PRE-CUTOVER.md). Also: [docs/MULTI-PRODUCT.md](./docs/MULTI-PRODUCT.md), [docs/esim-resellportal.md](./docs/esim-resellportal.md).

## Activating VPNresellers

1. Read [docs/vpnresellers.md](./docs/vpnresellers.md)  
2. Set `VPN_PROVIDER=vpnresellers` and `VPNRESELLERS_API_TOKEN`  
3. No application rewrite — adapter already implements documented v4.1 endpoints  

## Activating ResellPortal eSIM

1. Read [docs/esim-resellportal.md](./docs/esim-resellportal.md)  
2. Set `ESIM_PROVIDER=resellportal` plus `RESELLPORTAL_API_KEY` / `RESELLPORTAL_API_SECRET`  
3. Keep `ESIM_PROVIDER=mock` until the wallet/credentials are ready  

## Activating Stripe

1. Set `BILLING_PROVIDER=stripe` and Stripe keys / price IDs in `.env`  
2. Complete Stripe SDK wiring in `packages/billing` (stub guards missing credentials)  
3. Point Stripe webhooks to `/api/webhooks/stripe`  

## Activating email

1. Set `EMAIL_PROVIDER=smtp` and `SMTP_*` / `EMAIL_FROM`  
2. Wire a transport (Nodemailer/Resend/etc.) in `SmtpEmailProvider`  

## Security considerations

- Passwords hashed with bcrypt; login timing does not reveal whether an email exists  
- HttpOnly session cookies; only an HMAC of the session token is stored, and other sessions are revoked on password change/reset  
- Rate limiting per account/email (login, reset, resend, contact, checkout, credential reset); in-memory, so per instance  
- Server-side ownership checks on VPN/devices/tickets; plan device limits enforced on every path  
- Admin role gate on `/admin` (403 for non-admins)  
- Webhook signature verification; cron/webhook secrets compared in constant time  
- Production config validation at boot, security headers (HSTS, frame denial, nosniff)  
- Audit log without secrets  
- Mock VPN configs clearly marked non-production  

### Billing lifecycle

A user has at most one live subscription (enforced by a partial unique index). Cancelling at period end keeps access until
`currentPeriodEnd`; `/api/reconcile` then ends the subscription and suspends the VPN account. Failed payments move the
customer to a grace period and then suspension; a renewal restores access. Mock checkout (`/api/billing/complete`) only
works with `BILLING_PROVIDER=mock`, and each checkout session can be completed once.

### Known gaps

- The Stripe adapter and SMTP transport are still stubs (webhook verification fails closed until the Stripe SDK is wired).  
- Rate limits are per process; use a shared store (e.g. Redis) when running several instances.  
- No TOTP 2FA yet; account session list + “sign out other devices” is available.  
- Referral codes track signups; reward payouts are not enabled.  

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md). Prefer Vercel + managed Postgres + cron for reconciliation (`/api/reconcile` with `CRON_SECRET`; required in production because it expires lapsed subscriptions).

## Legal

Privacy, Terms, AUP, Refunds, and Cookies pages are **drafts**. Replace before launch. Do not ship unverifiable “no logs” or anonymity claims.
