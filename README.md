# Northstar VPN

White-label consumer VPN business built to run fully in **mock mode** locally, then activate VPNresellers, Stripe, and email via environment variables.

Brand name, colours, and plans are centralized in `@northstar/config` — replace globally without hunting strings.

## What this is

A production-oriented Next.js application with:

- Marketing site (pricing, features, locations, legal drafts)
- Customer auth + dashboard (VPN, devices, billing, support, referrals)
- Admin dashboard (customers, VPN, payments, audit, health)
- Provider abstractions: VPN, billing, email, analytics
- SQLite local database (Postgres-ready schema path documented)
- Seeds, tests, and reconciliation for failed provisioning

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) and [docs/vpnresellers.md](./docs/vpnresellers.md).

```
apps/web                 Next.js (marketing + dashboard + admin + API)
packages/config          Brand, plans, env
packages/db              Drizzle schema, migrate, seed
packages/vpn-provider    MockVPNProvider + VPNResellersProvider
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

## End-to-end local journey

1. Visit marketing site → Pricing → Register  
2. Choose plan → Mock checkout → Pay  
3. VPN account auto-provisions  
4. Dashboard → pick location → download mock config  
5. Manage devices / billing / support  
6. Admin login → find customer → suspend / restore → audit trail  

## Activating VPNresellers

1. Read [docs/vpnresellers.md](./docs/vpnresellers.md)  
2. Set `VPN_PROVIDER=vpnresellers` and `VPNRESELLERS_API_TOKEN`  
3. No application rewrite — adapter already implements documented v4.1 endpoints  

## Activating Stripe

1. Set `BILLING_PROVIDER=stripe` and Stripe keys / price IDs in `.env`  
2. Complete Stripe SDK wiring in `packages/billing` (stub guards missing credentials)  
3. Point Stripe webhooks to `/api/webhooks/stripe`  

## Activating email

1. Set `EMAIL_PROVIDER=smtp` and `SMTP_*` / `EMAIL_FROM`  
2. Wire a transport (Nodemailer/Resend/etc.) in `SmtpEmailProvider`  

## Security considerations

- Passwords hashed with bcrypt  
- HttpOnly session cookies  
- Login rate limiting  
- Server-side ownership checks on VPN/devices/tickets  
- Admin role gate on `/admin`  
- Webhook signature verification hooks  
- Audit log without secrets  
- Mock VPN configs clearly marked non-production  

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md). Prefer Vercel + managed Postgres + cron for reconciliation (`POST /api/reconcile` as admin or secured cron).

## Legal

Privacy, Terms, AUP, Refunds, and Cookies pages are **drafts**. Replace before launch. Do not ship unverifiable “no logs” or anonymity claims.
