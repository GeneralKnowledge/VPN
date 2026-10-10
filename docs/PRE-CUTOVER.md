# Pre-cutover checklist — before your server and paid APIs

Do this **while everything is still mock**. Goal: prove both products locally, then know exactly which accounts and env vars to create — without buying anything yet.

Companion docs: [MULTI-PRODUCT.md](./MULTI-PRODUCT.md), [LAUNCH-CHECKLIST.md](./LAUNCH-CHECKLIST.md), [esim-resellportal.md](./esim-resellportal.md), [vpnresellers.md](./vpnresellers.md).

## 0. Local dual-product smoke (no accounts)

```bash
pnpm install
pnpm db:reset && pnpm db:migrate && pnpm db:seed   # optional clean slate
pnpm dev
```

| Check | VPN (`http://localhost:3000`) | eSIM (`http://sim.localhost:3000`) |
| --- | --- | --- |
| Brand in header | Northstar VPN | Northstar SIM |
| Marketing | Pricing / features / download | Plans / how it works (no VPN download) |
| Login seed customer | `customer@northstar.local` / `CustomerDev123!` | Same email (separate cookie) |
| Happy path | Dashboard → devices / locations | Pricing → Buy → mock pay → QR on `/dashboard/esim` |
| Admin | `/admin` (VPN host only) | `/admin` redirects to `APP_URL` |

Automated coverage: `pnpm test:e2e` includes `e2e/esim-smoke.spec.ts` (SIM product via `x-forwarded-host: sim.localhost` → mock pay → QR; VPN homepage still VPN-branded). CI sets `TRUST_FORWARDED_HOST=true` for that; production should leave it `false` unless a reverse proxy overwrites `X-Forwarded-Host`.

Manual extras worth clicking once (browsers that resolve `*.localhost` to loopback):

- [ ] eSIM host cannot open `/dashboard/vpn` or `/download` (redirects away)
- [ ] VPN host `/sim` redirects to `/`
- [ ] Admin → **eSIM Orders** lists the mock purchase
- [ ] `GET /api/health` reports `vpn`, `esim`, `billing`, `email` operational under mock

## 1. Decide domains and deploy target (still free)

Pick hostnames before signing up for anything else:

| Role | Example | Env |
| --- | --- | --- |
| VPN site | `vpn.yourdomain.com` | `APP_URL`, `PRODUCT_HOST_VPN` |
| eSIM site | `sim.yourdomain.com` | `ESIM_APP_URL`, `PRODUCT_HOST_ESIM` |
| Deploy | Your test server + Cloudflare (or Vercel) + DB | `DATABASE_URL` |

- [ ] Both DNS names planned (same app deployment, two hostnames)
- [ ] `PRODUCT_HOST_VPN` / `PRODUCT_HOST_ESIM` lists match those names
- [ ] Production will use https URLs only (`APP_URL` / `ESIM_APP_URL`)

**Hands-on staging deploy** (Cloudflare subdomains → one server): [DEPLOY-TEST-SERVER.md](./DEPLOY-TEST-SERVER.md).

## 2. Account signup order (when you are ready)

Create in this order so nothing is blocked waiting on something else:

1. **Hosting + Postgres** — deploy target, empty DB, apply `packages/db/src/postgres.migrate.sql`
2. **Stripe** — one account for both products; VPN subscription prices first; eSIM one-time Checkout later (still stubbed in app)
3. **VPNresellers** — API token; keep `VPN_PROVIDER=mock` until a test provision works
4. **ResellPortal** — API key/secret + wallet top-up; keep `ESIM_PROVIDER=mock` until a test issue works
5. **SMTP / Resend / etc.** — only after signup emails matter; mock is fine until then
6. **Cron** — schedule `/api/reconcile` with `CRON_SECRET` (expires VPN subs **and** retries failed eSIM issues)

Do **not** flip `BILLING_PROVIDER`, `VPN_PROVIDER`, or `ESIM_PROVIDER` to live values until the matching step below is green.

## 3. Env inventory (copy from `.env.example`)

Minimum for a private staging deploy still on mock providers:

```env
APP_ENV=production          # or staging-like; see productionEnvProblems
APP_URL=https://vpn.yourdomain.com
ESIM_APP_URL=https://sim.yourdomain.com
PRODUCT_HOST_VPN=vpn.yourdomain.com
PRODUCT_HOST_ESIM=sim.yourdomain.com
DATABASE_URL=postgres://…
AUTH_SECRET=<openssl rand -base64 48>
CRON_SECRET=<strong secret>
ALLOW_MOCK_BILLING_IN_PRODUCTION=true   # only while Stripe is not live
VPN_PROVIDER=mock
ESIM_PROVIDER=mock
BILLING_PROVIDER=mock
EMAIL_PROVIDER=mock
```

When cutting each vendor live, add only that vendor’s keys and switch its `*_PROVIDER` flag. See `.env.example` for `VPNRESELLERS_*`, `RESELLPORTAL_*`, `STRIPE_*`, `SMTP_*`.

## 4. Staging gate (on your server, still can stay mock)

- [ ] App boots; `/api/health` is 200
- [ ] VPN hostname shows VPN marketing; eSIM hostname shows SIM marketing
- [ ] Seed/admin login works on VPN host; customer login on both hosts (separate sessions)
- [ ] Mock VPN checkout still provisions
- [ ] Mock eSIM checkout still issues a QR
- [ ] Reconcile cron authorized and succeeds (`vpn` + `esim` sections in JSON)
- [ ] Legal drafts replaced or still clearly marked draft

## 5. Flip live providers one at a time

| Step | Action | Verify |
| --- | --- | --- |
| A | `VPN_PROVIDER=vpnresellers` + token | Admin locations sync; one test account; config download |
| B | `ESIM_PROVIDER=resellportal` + key/secret + wallet | One cheap test package; QR/ICCID in dashboard |
| C | `BILLING_PROVIDER=stripe` + webhook secret + price IDs | VPN subscription checkout; then wire eSIM payment-mode Checkout |
| D | `EMAIL_PROVIDER=smtp` + transport | Welcome / eSIM-ready / reset mail deliver |
| E | `ALLOW_MOCK_BILLING_IN_PRODUCTION=false` | No free grants in prod |

Full VPN launch items remain in [LAUNCH-CHECKLIST.md](./LAUNCH-CHECKLIST.md).

## Explicitly not required yet

- Cross-subdomain SSO
- Bundled VPN + eSIM SKU
- Native apps
- Live Stripe eSIM Checkout (mock path is enough to validate product UX first)
