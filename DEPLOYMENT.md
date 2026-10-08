# Deployment

## Recommended shape

```
Vercel (Next.js) or similar
   │
Postgres (Neon/Supabase/etc.)
   │
External APIs
   ├── VPNresellers (required for real VPN)
   ├── Stripe (optional — mock billing OK initially)
   └── Email (optional — mock email OK initially)
```

## Steps

1. Provision Postgres and set `DATABASE_URL=postgres://...`
2. Apply [`packages/db/src/postgres.migrate.sql`](packages/db/src/postgres.migrate.sql)
3. Set `APP_ENV=production` (also implied by `NODE_ENV=production`), strong `AUTH_SECRET` (32+ chars, not the dev default), `APP_URL=https://your.domain`.
   The app **refuses to start** in production if: `AUTH_SECRET` is weak/default, `APP_URL` is not https or is localhost,
   `VPN_PROVIDER=vpnresellers` has no token, `BILLING_PROVIDER=mock` (free subscriptions; override only for staging with
   `ALLOW_MOCK_BILLING_IN_PRODUCTION=true`), or `BILLING_PROVIDER=stripe` has no `STRIPE_WEBHOOK_SECRET`.
4. Activate VPN:
   ```
   VPN_PROVIDER=vpnresellers
   VPNRESELLERS_API_URL=https://api.vpnresellers.com/v4_1
   VPNRESELLERS_API_TOKEN=...
   VPNRESELLERS_PROJECT_ID=...   # optional
   ```
5. Set `CRON_SECRET` and schedule `POST` (or `GET`, for schedulers such as Vercel Cron) `/api/reconcile` with `Authorization: Bearer $CRON_SECRET`
   (e.g. every 5–15 minutes). **This is not optional:** reconcile ends cancelled/lapsed subscriptions (cutting VPN access),
   retries failed provisioning and provider-side account deletions, and purges expired sessions.
6. Set `STRIPE_WEBHOOK_SECRET` if `/api/webhooks/stripe` is reachable (required even for `BILLING_PROVIDER=mock`; empty secret rejects all webhook activations)
7. Set `VPNRESELLERS_WEBHOOK_SECRET` only if you expose `/api/webhooks/vpnresellers` (it no longer falls back to `CRON_SECRET`)
8. Optionally activate Stripe / SMTP later via `BILLING_PROVIDER` / `EMAIL_PROVIDER`. With a real email provider, customers must verify
   their email before subscribing; with `EMAIL_PROVIDER=mock` verification is not enforced (no one could click the link)
9. Behind a proxy, make sure it sets `X-Forwarded-For` (login/contact limits also key on the account/email, so spoofing does not bypass them)
10. Replace legal drafts; complete privacy review
11. Enable monitoring (`ERROR_REPORTER=sentry` when DSN set)

## Postgres notes

- Apply `postgres.migrate.sql` to an empty database; it defines the timestamp defaults and the partial unique index that
  guarantees one live subscription per user.
- The seed/reset scripts refuse to run when `APP_ENV=production` (override: `NORTHSTAR_ALLOW_DESTRUCTIVE_DB=true`).
- The Postgres client parses `bigint` columns as numbers (all timestamps are epoch milliseconds).

## Billing webhooks

`/api/webhooks/stripe` handles checkout completion, `invoice.payment_failed` (grace period, then suspension on repeat failure),
`invoice.paid` (renewal, extends the period and restores access), and `customer.subscription.deleted`. Events are de-duplicated
by event id. The Stripe adapter itself is still a stub (see README), so until the SDK is wired, signature verification fails closed.

## Local vs production

| | Local | Production |
| --- | --- | --- |
| `VPN_PROVIDER` | `mock` | `vpnresellers` |
| `DATABASE_URL` | `file:./data/northstar.db` | `postgres://...` |
| `BILLING_PROVIDER` | `mock` | `mock` or `stripe` |
| `EMAIL_PROVIDER` | `mock` | `mock` or `smtp` |

## Cost posture

Single Next.js deploy, managed Postgres, no always-on VPN servers of your own — infrastructure is the reseller provider.

## Backups

Enable provider automated backups for Postgres. Export audit/webhook tables periodically if required for compliance.

## Launch

Follow [`docs/LAUNCH-CHECKLIST.md`](docs/LAUNCH-CHECKLIST.md).
