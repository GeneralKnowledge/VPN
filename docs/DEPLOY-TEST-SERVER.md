# Deploy to a test server (Cloudflare subdomains)

Step-by-step for a **private staging** deploy: one Node app, two hostnames (`vpn` + `sim`), Cloudflare for DNS/HTTPS, providers still on **mock**.

Replace `yourdomain.com` and `YOUR_SERVER_IP` with yours.

---

## What you will end up with

| URL | Product |
| --- | --- |
| `https://vpn.yourdomain.com` | Northstar VPN |
| `https://sim.yourdomain.com` | Northstar SIM |

Same process, same database. Logins are **separate per hostname** (cookies are host-scoped).

---

## Step 1 — Pick hostnames

Decide on:

- VPN: `vpn.yourdomain.com`
- eSIM: `sim.yourdomain.com`

You need a domain already on Cloudflare. The test server needs a public IP (or a tunnel — this guide assumes a public IP).

---

## Step 2 — Cloudflare DNS

In Cloudflare → your zone → **DNS** → **Records**:

1. Add **A** (or **AAAA**) record:
   - **Name:** `vpn`
   - **IPv4/IPv6:** `YOUR_SERVER_IP`
   - **Proxy status:** Proxied (orange cloud)
2. Add a second **A** (or **AAAA**) record:
   - **Name:** `sim`
   - **IPv4/IPv6:** `YOUR_SERVER_IP` (same IP)
   - **Proxy status:** Proxied (orange cloud)

Optional but useful for a private test:

- **SSL/TLS** → mode **Full (strict)** once the origin has a valid cert, or **Full** if the origin uses a self-signed cert behind Cloudflare.
- While testing, you can put the hostnames behind **Cloudflare Access** or IP allowlists so the world cannot sign up freely.

Wait until both names resolve (often a few minutes).

```bash
dig +short vpn.yourdomain.com
dig +short sim.yourdomain.com
# Should show Cloudflare anycast IPs when proxied (not necessarily YOUR_SERVER_IP)
```

---

## Step 3 — Open the origin to Cloudflare

On the server firewall, allow:

- **22** (SSH) from your IP
- **80** and **443** from the internet (Cloudflare connects to your origin on these)

If you run Node only on port `3000` without a reverse proxy, either:

- put nginx/Caddy on 80/443 (recommended), or
- temporarily open `3000` and point Cloudflare to that port via an origin rule (less common).

---

## Step 4 — Install runtime on the server

SSH in, then:

```bash
# Node 20+
node -v   # should be v20 or newer

# pnpm
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm -v
```

Install git if needed. Clone the repo (use your fork/remote URL):

```bash
sudo mkdir -p /opt/northstar
sudo chown "$USER":"$USER" /opt/northstar
cd /opt/northstar
git clone https://github.com/GeneralKnowledge/VPN.git .
git checkout main
pnpm install
```

---

## Step 5 — Create `.env`

```bash
cd /opt/northstar
cp .env.example .env
openssl rand -base64 48   # AUTH_SECRET
openssl rand -base64 32   # CRON_SECRET
```

Edit `.env` so it looks like this (SQLite is fine for a private test):

```env
APP_ENV=production
APP_NAME=Northstar VPN
APP_URL=https://vpn.yourdomain.com
ESIM_APP_URL=https://sim.yourdomain.com
AUTH_URL=https://vpn.yourdomain.com

PRODUCT_HOST_VPN=vpn.yourdomain.com
PRODUCT_HOST_ESIM=sim.yourdomain.com
# Keep false: Cloudflare and a normal reverse proxy preserve Host.
TRUST_FORWARDED_HOST=false

DATABASE_URL=file:./data/northstar.db

AUTH_SECRET=paste-the-48-byte-secret-here
CRON_SECRET=paste-the-32-byte-secret-here

ALLOW_MOCK_BILLING_IN_PRODUCTION=true
VPN_PROVIDER=mock
ESIM_PROVIDER=mock
BILLING_PROVIDER=mock
EMAIL_PROVIDER=mock
ANALYTICS_PROVIDER=mock
ERROR_REPORTER=console

# Optional: keep seed users for login testing on staging only.
# Change these passwords if the host is reachable beyond you.
SEED_ADMIN_EMAIL=admin@northstar.local
SEED_ADMIN_PASSWORD=AdminDev123!
SEED_CUSTOMER_EMAIL=customer@northstar.local
SEED_CUSTOMER_PASSWORD=CustomerDev123!
```

**Do not** set `TRUST_FORWARDED_HOST=true` on a public Node bind. Only enable it if a reverse proxy **overwrites** `Host` and sets a trusted `X-Forwarded-Host`.

---

## Step 6 — Database, build, first start

```bash
cd /opt/northstar
mkdir -p data
pnpm db:migrate
pnpm db:seed
pnpm build
pnpm --filter @northstar/web start
```

Leave that running for a quick check, or stop it (`Ctrl+C`) after the smoke tests below and use systemd (Step 8).

Default listen: `http://127.0.0.1:3000`. Confirm locally on the server:

```bash
curl -sS -H 'Host: vpn.yourdomain.com' http://127.0.0.1:3000/api/health
curl -sS -H 'Host: sim.yourdomain.com' http://127.0.0.1:3000/ | head
```

---

## Step 7 — Reverse proxy (nginx example)

Install nginx, then a site config that forwards **both** hostnames and keeps `Host`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name vpn.yourdomain.com sim.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

With Cloudflare proxied (orange cloud), visitors use Cloudflare HTTPS. Origin can stay HTTP on port 80 if SSL mode is **Flexible** (not ideal) or **Full** with an origin cert.

Better: install a Cloudflare Origin Certificate (SSL/TLS → Origin Server) on nginx and listen on 443, then set SSL mode to **Full (strict)**.

Caddy alternative (auto HTTPS on the origin if you skip orange-cloud, or terminate TLS yourself):

```caddy
vpn.yourdomain.com, sim.yourdomain.com {
    reverse_proxy 127.0.0.1:3000
}
```

---

## Step 8 — Keep the app running (systemd)

`/etc/systemd/system/northstar.service`:

```ini
[Unit]
Description=Northstar VPN/eSIM (Next.js)
After=network.target

[Service]
Type=simple
User=YOUR_LINUX_USER
WorkingDirectory=/opt/northstar
EnvironmentFile=/opt/northstar/.env
ExecStart=/usr/bin/pnpm --filter @northstar/web start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Adjust `User` and the `pnpm` path (`which pnpm`). Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now northstar
sudo systemctl status northstar
```

---

## Step 9 — Smoke test in the browser

1. Open `https://vpn.yourdomain.com` → header should say **Northstar VPN**.
2. Open `https://sim.yourdomain.com` → header should say **Northstar SIM**.
3. On VPN host, log in as admin (`admin@northstar.local` / seed password) → `/admin` works.
4. On eSIM host, log in as customer → buy a mock package → QR on `/dashboard/esim`.
5. Confirm eSIM host `/admin` redirects to the VPN admin URL.
6. `https://vpn.yourdomain.com/api/health` returns 200 with providers operational.

If both hosts show VPN branding, `PRODUCT_HOST_ESIM` does not match the hostname you typed (typo, missing subdomain, or wrong `Host` at the app).

---

## Step 10 — Optional cron (reconcile)

Even on mock staging, schedule reconcile:

```bash
# every 15 minutes
*/15 * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://vpn.yourdomain.com/api/reconcile >/dev/null
```

Use the same `CRON_SECRET` as in `.env`.

---

## Updating after a git pull

```bash
cd /opt/northstar
git pull origin main
pnpm install
pnpm db:migrate
pnpm build
sudo systemctl restart northstar
```

---

## Common problems

| Symptom | Likely cause |
| --- | --- |
| App refuses to boot | Weak `AUTH_SECRET`, non-https `APP_URL`, or mock billing without `ALLOW_MOCK_BILLING_IN_PRODUCTION=true` |
| Both hosts look like VPN | Hostname not listed in `PRODUCT_HOST_ESIM`, or proxy sending wrong `Host` |
| Login cookie lost | `APP_URL` / `ESIM_APP_URL` scheme/host mismatch with the URL in the browser |
| 522 / 521 from Cloudflare | Origin down, firewall blocking Cloudflare, or wrong IP in DNS |
| “Unsecured” / redirect loops | SSL mode vs origin TLS mismatch (try Full with origin cert) |

---

## When you leave mock mode

Follow [PRE-CUTOVER.md](./PRE-CUTOVER.md) §5: flip `VPN_PROVIDER`, `ESIM_PROVIDER`, `BILLING_PROVIDER`, and email one at a time. For a longer-lived staging DB, switch `DATABASE_URL` to Postgres and apply `packages/db/src/postgres.migrate.sql`.

Related: [MULTI-PRODUCT.md](./MULTI-PRODUCT.md), [LAUNCH-CHECKLIST.md](./LAUNCH-CHECKLIST.md).
