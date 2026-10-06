# Development

## Prerequisites

- Node 20+
- pnpm 9+

No Docker, Stripe, VPNresellers, or email account required for mock mode.

## First run

```bash
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Database file defaults to `./data/northstar.db` at the monorepo root (`NORTHSTAR_ROOT`).

## Packages

Workspaces use TypeScript source exports (`"exports": { ".": "./src/index.ts" }`) transpiled by Next.js.

## Testing

```bash
pnpm test
pnpm --filter @northstar/web exec playwright install  # once for e2e
pnpm test:e2e
```

## Mock emails

`MockEmailProvider` prints structured logs to the console. Password reset returns a `devResetUrl` outside production.

## Reconciliation

If billing succeeds but VPN provisioning fails, retry:

```bash
# as admin session, or curl with admin cookie
curl -X POST http://localhost:3000/api/reconcile
```

## Branding

Edit `packages/config/src/index.ts` (`brand`, `plans`).
