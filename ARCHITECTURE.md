# Architecture — Northstar VPN

## Summary

Northstar VPN is a white-label consumer VPN business built on managed infrastructure. The application never talks to VPNresellers (or any other vendor) directly outside a provider adapter.

## Stack decisions

| Concern | Choice | Why |
| --- | --- | --- |
| App | Next.js App Router (single app) | One deploy target (Vercel), shared auth/UI/DB for marketing, customer, and admin |
| Language | TypeScript strict | End-to-end type safety |
| Styling | Tailwind CSS + shared UI primitives | Fast, consistent, no heavy design system |
| Database | Drizzle + SQLite (local) / Postgres (prod) | `pnpm dev` with zero external services; Postgres-ready for production |
| Auth | Auth.js (NextAuth v5) credentials | Works fully offline; production can keep credentials or add OAuth later |
| Package manager | pnpm workspaces | Clean shared packages without over-splitting apps |
| Tests | Vitest + Playwright | Unit/integration + full customer journeys |

**Why not separate `apps/admin`?** Admin and customer share session, schema, and components. A route group (`/admin`) is simpler and cheaper to operate than a second deployable.

**Why not Convex?** Billing webhooks, VPN provider HTTP APIs, and credentialed file downloads fit a conventional Next.js + SQL model well. Provider abstractions keep vendors swappable without a realtime-first backend.

## Repository layout

```
apps/web                 Next.js — marketing, dashboard, admin, API
packages/config          Brand, plans, env parsing (Zod)
packages/db              Drizzle schema, migrations, seed
packages/vpn-provider    VPNProvider interface + Mock + VPNResellers
packages/billing         BillingProvider + Mock + Stripe stub
packages/email           EmailProvider + Mock (+ production stub)
docs/                    Provider research, runbooks
scripts/                 Seed helpers, reconciliation CLI
```

## Provider abstractions

```
VPNProvider ── MockVPNProvider | VPNResellersProvider
BillingProvider ── MockBillingProvider | StripeBillingProvider
EmailProvider ── MockEmailProvider | SmtpEmailProvider
AnalyticsProvider ── MockAnalyticsProvider | PostHogAnalyticsProvider (stub)
ErrorReporter ── ConsoleErrorReporter | SentryErrorReporter (stub)
```

Application services call interfaces only. `VPN_PROVIDER`, `BILLING_PROVIDER`, etc. select implementations at boot.

## Domain model (high level)

- **User / Role** — customer or admin
- **Plan / Subscription** — commercial state (separate from VPN)
- **VpnAccount** — provisioned identity at the infrastructure provider
- **VpnLocation / VpnConnection / Device** — where and how the user connects
- **Payment / Invoice / WebhookEvent** — billing audit trail
- **SupportTicket / SupportMessage** — internal support
- **Referral** — attribution (rewards later)
- **AuditEvent / ProviderEvent** — security and ops trail

Billing state and VPN state are reconciled by background jobs / API reconciliation routes. A successful Stripe payment that fails at the VPN provider leaves a repairable `provisioning_pending` state, not a stuck customer.

## Environments

| Mode | Behaviour |
| --- | --- |
| `APP_ENV=development` + all `*_PROVIDER=mock` | Full product simulation, SQLite, logged emails, fake configs |
| Production | Real Postgres, Stripe, email, VPNresellers via env vars |

## Assumptions

1. Placeholder brand is **Northstar VPN** (centralized in `@northstar/config`).
2. Initial prices are £4.99/mo and £39.99/yr (config-driven).
3. Marketing copy avoids unverifiable privacy/logging claims.
4. Mock locations are fixtures, not production inventory.
5. Config downloads in mock mode are clearly marked `MOCK — NOT FOR PRODUCTION USE`.
6. VPNresellers API v4.1 is the target for the real adapter (see `docs/vpnresellers.md`).
7. Custom native apps do not exist yet — download pages say so and provide WireGuard/OpenVPN setup paths.
