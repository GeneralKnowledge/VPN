# Launch checklist — Northstar VPN

## Self-serve (mock — no external accounts)

Done in-repo for the self-serve angle (keep green on `main`):

- [x] CI (lint, typecheck, unit, build, Playwright)
- [x] Package ESLint + theme toggle + SEO basics
- [x] Dashboard onboarding checklist (dismissible) + `/trust` + download guides
- [x] Devices = named VPN connections (create / rename / revoke + QR)
- [x] Account active sessions + sign out other devices
- [x] Last-used / preferred location in Quick Connect
- [x] Legal drafts `noindex` + omitted from sitemap (draft banners remain)

## Code (production cutover)

- [ ] Tests passing (`pnpm test`)
- [ ] Typecheck passing (`pnpm typecheck`)
- [ ] Build passing (`pnpm build`)
- [ ] CI green on `main` (GitHub Actions: lint, typecheck, unit, build, Playwright)
- [ ] Security review completed (IDOR, config downloads, secret redaction, webhook forgery)
- [ ] Billing webhooks fail closed (`STRIPE_WEBHOOK_SECRET` set if endpoint is exposed; unsigned mock webhooks rejected)
- [ ] Provider integration verified (`VPN_PROVIDER=vpnresellers` against real or staging credentials)
- [ ] Lint clean (`pnpm lint`)
- [ ] Production boot check passes (app refuses weak `AUTH_SECRET`, mock billing, non-https `APP_URL`)

## VPNresellers

- [ ] Account created at vpnresellers.com
- [ ] API access enabled / token issued
- [ ] Credentials configured (`VPNRESELLERS_API_TOKEN`, optional `VPNRESELLERS_PROJECT_ID`)
- [ ] Locations verified (paginated server list populated in admin/customer UI)
- [ ] Test account provisioned
- [ ] Test connection created
- [ ] Test configuration downloaded
- [ ] Suspension tested
- [ ] Revocation tested (local connection revoke + account disable)

## Infrastructure

- [ ] Production database (Postgres + `packages/db/src/postgres.migrate.sql`)
- [ ] Domain pointed at deploy target
- [ ] HTTPS enabled
- [ ] Secrets set (strong `AUTH_SECRET`, provider tokens, `CRON_SECRET`)
- [ ] Backups enabled for Postgres
- [ ] Monitoring (`ERROR_REPORTER` / uptime checks)
- [ ] Scheduled reconcile → `POST`/`GET /api/reconcile` with `Authorization: Bearer $CRON_SECRET` (required: it expires lapsed subscriptions)
- [ ] Security headers present (`curl -I`), including HSTS over https

## Business

- [ ] Pricing confirmed in `@northstar/config` plans
- [ ] Terms of service reviewed (replace draft)
- [ ] Privacy policy reviewed (replace draft)
- [ ] Acceptable-use policy
- [ ] Refund policy

## Launch

- [ ] Real VPN account tested end-to-end
- [ ] Customer signup tested
- [ ] VPN provisioning tested
- [ ] Admin controls tested (provision/retry, suspend, reactivate, reconcile)
- [ ] Failure/recovery tested (forced provider error → reconcile repair)
- [ ] Cancel at period end → access ends after `currentPeriodEnd` once reconcile runs
- [ ] Payment failure webhook → grace period → suspension; renewal restores access
- [ ] Account deletion removes the provider VPN account and stops billing
- [ ] Password change/reset signs out other sessions

## Explicitly deferred (OK for this stage)

- [ ] Stripe production integration
- [ ] Production SMTP / transactional email
- [ ] Native App Store / Play Store apps (PWA installable shell ships in-web)
- [ ] Advanced analytics
