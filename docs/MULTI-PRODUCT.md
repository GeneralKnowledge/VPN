# Multi-product hosts (VPN + eSIM)

One Next.js deploy serves two products by **hostname**. Marketing copy stays separate; accounts are shared in the database but **sessions do not cross hosts** (host-only cookies).

## Hosts

| Product | Example hosts | Env |
| --- | --- | --- |
| VPN | `vpn.example.com`, `vpn.localhost` | `PRODUCT_HOST_VPN` |
| eSIM | `sim.example.com`, `sim.localhost` | `PRODUCT_HOST_ESIM` |

Unmatched hosts (including plain `localhost:3000`) default to **VPN**.

Set `ESIM_APP_URL` for eSIM checkout return links and emails when it differs from `APP_URL`.

## Local development

Point both hosts at the same port (e.g. `sim.localhost` / `vpn.localhost` → `127.0.0.1`). Modern browsers resolve `*.localhost` to loopback.

```bash
pnpm dev
# VPN:  http://localhost:3000  or http://vpn.localhost:3000
# eSIM: http://sim.localhost:3000
```

## Behaviour

- Middleware sets `x-northstar-product` and rewrites eSIM marketing routes to `/sim/*`.
- VPN-only dashboard routes redirect to `/dashboard` on the eSIM host.
- `/sim/*` redirects to `/` on the VPN host.
- Admin lives on the VPN host; eSIM host `/admin` redirects to `APP_URL/admin`.
- VPN: recurring subscription → provision account → configs.
- eSIM: one-time package checkout → issue profile → QR in `/dashboard/esim`.

## Auth

Separate logins per host by design. The same email can exist once in `users` and sign in on either host; cookies are not shared across subdomains.
