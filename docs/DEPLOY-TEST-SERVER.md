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

### 5a. Login and create the tunnel

```bash
cloudflared tunnel login
# Browser: pick the avedeus.ovh zone and authorize

cloudflared tunnel create northstar
cloudflared tunnel list
```

Note the tunnel **UUID** from `tunnel list` / `tunnel create`.

### 5b. DNS routes (creates the subdomains in Cloudflare)

```bash
cloudflared tunnel route dns northstar vpn.avedeus.ovh
cloudflared tunnel route dns northstar sim.avedeus.ovh
```

That adds CNAME records for `vpn` and `sim` under `avedeus.ovh` pointing at the tunnel. No manual A records needed.

### 5c. Tunnel config

```bash
TUNNEL_ID="$(cloudflared tunnel list | awk '/northstar/{print $1; exit}')"
echo "TUNNEL_ID=$TUNNEL_ID"
mkdir -p ~/.cloudflared

tee ~/.cloudflared/config.yml >/dev/null <<EOF
tunnel: ${TUNNEL_ID}
credentials-file: /home/${USER}/.cloudflared/${TUNNEL_ID}.json

ingress:
  - hostname: vpn.avedeus.ovh
    service: http://127.0.0.1:3000
  - hostname: sim.avedeus.ovh
    service: http://127.0.0.1:3000
  - service: http_status:404
EOF

cloudflared tunnel ingress validate
```

### 5d. Run the tunnel as a service

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
sudo systemctl status cloudflared --no-pager
```

If `service install` looks for config in `/etc/cloudflared/`, copy it:

```bash
sudo mkdir -p /etc/cloudflared
sudo cp ~/.cloudflared/config.yml /etc/cloudflared/config.yml
sudo cp ~/.cloudflared/"$TUNNEL_ID".json /etc/cloudflared/
# Fix credentials-file path inside /etc/cloudflared/config.yml if needed:
sudo nano /etc/cloudflared/config.yml
sudo systemctl restart cloudflared
```

Quick foreground test instead of the service:

```bash
cloudflared tunnel run northstar
```

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
| Tunnel up but 502 | `northstar` service down — `sudo systemctl status northstar` |
| DNS not resolving | `tunnel route dns` not run, or wrong Cloudflare account/zone at `tunnel login` |
| Login cookie lost | `APP_URL` / `ESIM_APP_URL` don’t match the browser URL |

Related: [PRE-CUTOVER.md](./PRE-CUTOVER.md), [MULTI-PRODUCT.md](./MULTI-PRODUCT.md).
