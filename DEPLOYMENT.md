# Deployment

## Recommended shape

```
Vercel (Next.js)
   │
Postgres (Neon/Supabase/etc.)
   │
External APIs
   ├── VPNresellers
   ├── Stripe
   └── Email (SMTP/API)
```

## Steps

1. Provision Postgres and set `DATABASE_URL=postgres://...`
2. Port Drizzle schema to `pg` dialect (SQLite is for local mock). Keep the same tables/indexes.
3. Set `APP_ENV=production`, strong `AUTH_SECRET`, `APP_URL=https://your.domain`
4. Activate providers via env (`VPN_PROVIDER`, `BILLING_PROVIDER`, `EMAIL_PROVIDER`)
5. Configure Stripe webhook → `/api/webhooks/stripe`
6. Schedule reconciliation (Vercel cron → secured `/api/reconcile`)
7. Replace legal drafts; complete privacy review
8. Enable monitoring (`ERROR_REPORTER=sentry` when DSN set)

## Cost posture

Single Next.js deploy, managed Postgres, no always-on VPN servers of your own — infrastructure is the reseller provider.

## Backups

Enable provider automated backups for Postgres. Export audit/webhook tables periodically if required for compliance.
