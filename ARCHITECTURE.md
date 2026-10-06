# Architecture — Northstar VPN

## Summary

Northstar VPN is a white-label consumer VPN business built on managed infrastructure. The application never talks to VPNresellers (or any other vendor) directly outside a provider adapter.

## Stack decisions

| Concern | Choice | Why |
| --- | --- | --- |
| App | Next.js App Router (single app) | One deploy target, shared auth/UI/DB for marketing, customer, and admin |
| Language | TypeScript strict | End-to-end type safety |
| Styling | Tailwind CSS + shared UI primitives | Fast, consistent |
| Database | Drizzle + SQLite (local) / Postgres (prod) | Zero external services locally; Postgres-ready for production |
| Auth | Custom session cookies (bcrypt + DB sessions) | Works fully offline; no Auth.js dependency |
| Package manager | pnpm workspaces | Clean shared packages |
| Tests | Vitest + Playwright | Unit/integration + smoke journeys |

**Why not separate `apps/admin`?** Admin and customer share session, schema, and components. A route group (`/admin`) is simpler.

**Why not Convex?** Billing webhooks, VPN provider HTTP APIs, and credentialed file downloads fit a conventional Next.js + SQL model. Provider abstractions keep vendors swappable.

## Repository layout

```
apps/web                 Next.js — marketing, dashboard, admin, API
packages/config          Brand, plans, env parsing (Zod)
packages/db              Drizzle schema, migrations, seed
packages/vpn-provider    VPNProvider interface + Mock + VPNResellers
packages/billing         BillingProvider + Mock + Stripe stub
packages/email           EmailProvider + Mock (+ production stub)
docs/                    Provider research, runbooks, launch checklist
```

## Provider abstractions

```
VPNProvider ── MockVPNProvider | VPNResellersProvider
BillingProvider ── MockBillingProvider | StripeBillingProvider
EmailProvider ── MockEmailProvider | SmtpEmailProvider
```

Application services call interfaces only. `VPN_PROVIDER`, `BILLING_PROVIDER`, etc. select implementations at boot.

## Domain model (high level)

- **User / Role** — customer or admin
- **Plan / Subscription** — commercial state (separate from VPN)
- **VpnAccount** — provisioned identity at the infrastructure provider (`pending` | `active` | `disabled` | `expired` | `error`)
- **VpnLocation / VpnConnection / Device** — where and how the user connects (connections are local; provider has accounts + configs)
- **Payment / Invoice / WebhookEvent** — billing audit trail
- **AuditEvent / ProviderEvent** — security and ops trail

See [`docs/SUBSCRIPTION-VPN-STATES.md`](docs/SUBSCRIPTION-VPN-STATES.md) for the subscription↔VPN matrix.

Provisioning is **idempotent**: a local `vpn_accounts` row is written first with a stable username; retries look up by provider id / username before creating.

## Environments

| Mode | Behaviour |
| --- | --- |
| `APP_ENV=development` + `VPN_PROVIDER=mock` | Full product simulation, SQLite, logged emails, mock configs |
| Production | Postgres, `VPN_PROVIDER=vpnresellers`, strong secrets; billing/email may remain mock until activated |

## Assumptions

1. Placeholder brand is **Northstar VPN** (centralized in `@northstar/config`).
2. Initial prices are £4.99/mo and £39.99/yr (config-driven).
3. Marketing copy avoids unverifiable privacy/logging claims.
4. Mock locations are fixtures; live inventory comes from the provider when `VPN_PROVIDER=vpnresellers`.
5. Config downloads in mock mode are clearly marked.
6. VPNresellers API v4.1 is the real adapter target (see `docs/vpnresellers.md`).
7. Custom native apps do not exist yet — download pages provide WireGuard/OpenVPN setup paths.
