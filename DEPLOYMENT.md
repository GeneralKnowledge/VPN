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
3. Set `APP_ENV=production`, strong `AUTH_SECRET` (32+ chars, not the dev default), `APP_URL=https://your.domain`
4. Activate VPN:
   ```
   VPN_PROVIDER=vpnresellers
   VPNRESELLERS_API_URL=https://api.vpnresellers.com/v4_1
   VPNRESELLERS_API_TOKEN=...
   VPNRESELLERS_PROJECT_ID=...   # optional
   ```
5. Set `CRON_SECRET` and schedule `POST /api/reconcile` with `Authorization: Bearer $CRON_SECRET` (e.g. every 5–15 minutes)
6. Set `STRIPE_WEBHOOK_SECRET` if `/api/webhooks/stripe` is reachable (required even for `BILLING_PROVIDER=mock`; empty secret rejects all webhook activations)
7. Optionally activate Stripe / SMTP later via `BILLING_PROVIDER` / `EMAIL_PROVIDER`
7. Replace legal drafts; complete privacy review
8. Enable monitoring (`ERROR_REPORTER=sentry` when DSN set)

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
