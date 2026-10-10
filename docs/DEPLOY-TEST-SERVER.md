# Deploy test server — avedeus.ovh + Cloudflare Tunnel

Private staging on your VPS: one Node app, two hostnames, **`cloudflared`** (no nginx). Providers stay on **mock**.

| URL | Product |
| --- | --- |
| `https://vpn.avedeus.ovh` | Northstar VPN |
| `https://sim.avedeus.ovh` | Northstar SIM |

Same process and DB. Logins are **separate per hostname**.

---

## Step 1 — Server runtime

SSH into the server, then:

```bash
sudo apt update
sudo apt install -y git curl

# Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo corepack enable
sudo corepack prepare pnpm@9.15.0 --activate
node -v && pnpm -v
```

Install `cloudflared`:

```bash
curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb
sudo dpkg -i /tmp/cloudflared.deb
cloudflared --version
```

(Use the arm64 `.deb` if your VPS is ARM.)

---

## Step 2 — Clone and install the app

```bash
sudo mkdir -p /opt/northstar
sudo chown "$USER":"$USER" /opt/northstar
cd /opt/northstar
git clone https://github.com/GeneralKnowledge/VPN.git .
git checkout main
pnpm install
```

---

## Step 3 — `.env` for avedeus.ovh

```bash
cd /opt/northstar
cp .env.example .env
echo "AUTH_SECRET=$(openssl rand -base64 48)"
echo "CRON_SECRET=$(openssl rand -base64 32)"
nano .env
```

Paste the printed secrets into `.env`, and set:

```env
APP_ENV=production
APP_NAME=Northstar VPN
APP_URL=https://vpn.avedeus.ovh
ESIM_APP_URL=https://sim.avedeus.ovh
AUTH_URL=https://vpn.avedeus.ovh

PRODUCT_HOST_VPN=vpn.avedeus.ovh
PRODUCT_HOST_ESIM=sim.avedeus.ovh
TRUST_FORWARDED_HOST=false

DATABASE_URL=file:./data/northstar.db

AUTH_SECRET=paste-from-openssl
CRON_SECRET=paste-from-openssl

ALLOW_MOCK_BILLING_IN_PRODUCTION=true
VPN_PROVIDER=mock
ESIM_PROVIDER=mock
BILLING_PROVIDER=mock
EMAIL_PROVIDER=mock
ANALYTICS_PROVIDER=mock
ERROR_REPORTER=console

SEED_ADMIN_EMAIL=admin@northstar.local
SEED_ADMIN_PASSWORD=AdminDev123!
SEED_CUSTOMER_EMAIL=customer@northstar.local
SEED_CUSTOMER_PASSWORD=CustomerDev123!
```

Leave `TRUST_FORWARDED_HOST=false`. Tunnel preserves the public `Host`.

---

## Step 4 — Database, build, systemd for the app

```bash
cd /opt/northstar
mkdir -p data
pnpm db:migrate
pnpm db:seed
pnpm build

PNPM_BIN="$(which pnpm)"
sudo tee /etc/systemd/system/northstar.service >/dev/null <<EOF
[Unit]
Description=Northstar VPN/eSIM (Next.js)
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/opt/northstar
EnvironmentFile=/opt/northstar/.env
ExecStart=$PNPM_BIN --filter @northstar/web start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now northstar
sudo systemctl status northstar --no-pager
```

Local check (still only on the VPS loopback):

```bash
curl -sS -H 'Host: vpn.avedeus.ovh' http://127.0.0.1:3000/api/health
curl -sS -H 'Host: sim.avedeus.ovh' http://127.0.0.1:3000/api/health
```

You do **not** need to open ports 80/443 for the app when using a tunnel.

---

## Step 5 — Cloudflare Tunnel (`cloudflared`)

You already serve **`hetzner.avedeus.ovh`** on this box. Do **not** replace that ingress.
Either **extend the existing tunnel config** (recommended) or create a **second tunnel** only for Northstar.

Northstar uses new hostnames only:

- `vpn.avedeus.ovh`
- `sim.avedeus.ovh`

Leave `hetzner.avedeus.ovh` pointing at whatever it already uses.

### Option A — Add vpn/sim to your existing tunnel (recommended)

```bash
# See what you already have
cloudflared tunnel list
sudo systemctl status cloudflared --no-pager || true
ls -la ~/.cloudflared/ /etc/cloudflared/ 2>/dev/null

# Edit the live config (usually one of these):
sudo nano /etc/cloudflared/config.yml
# or: nano ~/.cloudflared/config.yml
```

In `ingress`, **keep** the `hetzner.avedeus.ovh` rule. Add the two Northstar hostnames
**above** the catch-all `http_status:404` (order matters):

```yaml
ingress:
  - hostname: hetzner.avedeus.ovh
    service: http://127.0.0.1:XXXX   # leave your existing target unchanged
  - hostname: vpn.avedeus.ovh
    service: http://127.0.0.1:3000
  - hostname: sim.avedeus.ovh
    service: http://127.0.0.1:3000
  - service: http_status:404
```

Point DNS for the new names at **that same tunnel** (use your existing tunnel name, not necessarily `northstar`):

```bash
# Replace EXISTING_TUNNEL_NAME with the name from `cloudflared tunnel list`
cloudflared tunnel route dns EXISTING_TUNNEL_NAME vpn.avedeus.ovh
cloudflared tunnel route dns EXISTING_TUNNEL_NAME sim.avedeus.ovh

cloudflared tunnel ingress validate
sudo systemctl restart cloudflared
sudo systemctl status cloudflared --no-pager
```

That only adds CNAMEs for `vpn` and `sim`. It does not change `hetzner.avedeus.ovh`.

### Option B — Separate tunnel just for Northstar

Use this if you prefer not to edit the existing tunnel. Both tunnels can run on the same VPS.

```bash
cloudflared tunnel login   # only if this machine is not already authorized
cloudflared tunnel create northstar
cloudflared tunnel route dns northstar vpn.avedeus.ovh
cloudflared tunnel route dns northstar sim.avedeus.ovh

TUNNEL_ID="$(cloudflared tunnel list | awk '/northstar/{print $1; exit}')"
mkdir -p ~/.cloudflared

# Dedicated config — do NOT overwrite the hetzner tunnel's config.yml
tee ~/.cloudflared/northstar.yml >/dev/null <<EOF
tunnel: ${TUNNEL_ID}
credentials-file: /home/${USER}/.cloudflared/${TUNNEL_ID}.json

ingress:
  - hostname: vpn.avedeus.ovh
    service: http://127.0.0.1:3000
  - hostname: sim.avedeus.ovh
    service: http://127.0.0.1:3000
  - service: http_status:404
EOF

cloudflared tunnel --config ~/.cloudflared/northstar.yml ingress validate
```

Systemd unit for the second tunnel only:

```bash
sudo tee /etc/systemd/system/cloudflared-northstar.service >/dev/null <<EOF
[Unit]
Description=Cloudflare Tunnel (northstar vpn/sim)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
ExecStart=/usr/bin/cloudflared --config /home/$USER/.cloudflared/northstar.yml tunnel run
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now cloudflared-northstar
sudo systemctl status cloudflared-northstar --no-pager
```

Your existing `cloudflared` service for `hetzner.avedeus.ovh` stays as-is.

---

## Step 6 — Smoke test

In a browser:

1. [https://vpn.avedeus.ovh](https://vpn.avedeus.ovh) → **Northstar VPN**
2. [https://sim.avedeus.ovh](https://sim.avedeus.ovh) → **Northstar SIM**
3. Customer login (either host): `customer@northstar.local` / `CustomerDev123!`
4. On SIM host: buy mock package → QR on `/dashboard/esim`
5. Admin on VPN host: `admin@northstar.local` / `AdminDev123!` → `/admin`
6. [https://vpn.avedeus.ovh/api/health](https://vpn.avedeus.ovh/api/health) → 200

From the server:

```bash
curl -sS https://vpn.avedeus.ovh/api/health
curl -sS -I https://sim.avedeus.ovh/ | head
```

---

## Optional — reconcile cron

```bash
crontab -e
```

Add (use the real `CRON_SECRET` from `.env`):

```cron
*/15 * * * * curl -fsS -X POST -H "Authorization: Bearer YOUR_CRON_SECRET" https://vpn.avedeus.ovh/api/reconcile >/dev/null
```

---

## Updating the app later

```bash
cd /opt/northstar
git pull origin main
pnpm install
pnpm db:migrate
pnpm build
sudo systemctl restart northstar
```

Tunnel service can keep running; restart it only if you change hostnames/config:

```bash
sudo systemctl restart cloudflared
```

---

## Common problems

| Symptom | Likely cause |
| --- | --- |
| App won’t boot | Weak `AUTH_SECRET`, non-https `APP_URL`, or mock billing without `ALLOW_MOCK_BILLING_IN_PRODUCTION=true` |
| Both hosts look like VPN | Typo in `PRODUCT_HOST_ESIM` / URL |
| Tunnel up but 502 | `northstar` app service down — `sudo systemctl status northstar` |
| `hetzner.avedeus.ovh` broke | Existing ingress rule was overwritten — restore its hostname/service line |
| DNS not resolving | `tunnel route dns` not run for `vpn`/`sim`, or wrong zone at `tunnel login` |
| Login cookie lost | `APP_URL` / `ESIM_APP_URL` don’t match the browser URL |

Related: [PRE-CUTOVER.md](./PRE-CUTOVER.md), [MULTI-PRODUCT.md](./MULTI-PRODUCT.md).
