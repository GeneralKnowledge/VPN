# Launch checklist — Northstar VPN

## Code

- [ ] Tests passing (`pnpm test`)
- [ ] Typecheck passing (`pnpm typecheck`)
- [ ] Build passing (`pnpm build`)
- [ ] Security review completed (IDOR, config downloads, secret redaction, webhook forgery)
- [ ] Billing webhooks fail closed (`STRIPE_WEBHOOK_SECRET` set if endpoint is exposed; unsigned mock webhooks rejected)
- [ ] Provider integration verified (`VPN_PROVIDER=vpnresellers` against real or staging credentials)
- [ ] Lint clean (`pnpm lint`)

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
- [ ] Scheduled reconcile → `POST /api/reconcile` with `Authorization: Bearer $CRON_SECRET`

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

## Explicitly deferred (OK for this stage)

- [ ] Stripe production integration
- [ ] Production SMTP / transactional email
- [ ] Mobile apps
- [ ] Advanced analytics
