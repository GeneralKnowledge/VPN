# ResellPortal eSIM API research

Source: [eSIM API](https://resellportal.com/esim-api/) and [API overview](https://resellportal.com/api/).

## Role in Northstar

Northstar SIM sells **one-time** travel eSIM packages under our brand. Wholesale fulfilment uses ResellPortal when `ESIM_PROVIDER=resellportal`. Local development uses `ESIM_PROVIDER=mock`.

Commerce is **not** a VPN-style subscription: browse package → pay once → issue QR/ICCID.

## Base URL

```
https://panel.resellportal.com/wp-json/resellportal/v1
```

Override with `RESELLPORTAL_API_URL`.

## Authentication

| Header | Value |
| --- | --- |
| `X-API-Key` | API key from ResellPortal panel |
| `X-API-Secret` | API secret from ResellPortal panel |

## Endpoints used

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/esim-packages?location=US` | List packages (optional country filter) |
| POST | `/clients` | Create/reuse wholesale client (best effort) |
| POST | `/orders` | Issue eSIM (`product_key: "esim"`, `package_code`) |
| GET | `/orders/{id}` | Retrieve order (when supported) |

### Create order body

```json
{
  "client_id": 123,
  "product_key": "esim",
  "package_code": "CKH104"
}
```

### Response (relevant fields)

- `service_id` — provider order id
- `package.code` / `package.name`
- `esim_details.qr_code_url`
- `esim_details.activation_url`
- `esim_details.iccid`
- `esim_details.esim_status`

Treat QR URLs and ICCIDs as **sensitive**. Do not log them.

## Mapping to `EsimProvider`

| Interface | ResellPortal |
| --- | --- |
| `listPackages` | `GET /esim-packages` |
| `getPackage` | Filter from list |
| `createOrder` | `POST /clients` (best effort) + `POST /orders` |
| `getOrder` | `GET /orders/{id}` when available |
| `getProviderStatus` | Lightweight package list |

## Activation

```env
ESIM_PROVIDER=resellportal
RESELLPORTAL_API_URL=https://panel.resellportal.com/wp-json/resellportal/v1
RESELLPORTAL_API_KEY=
RESELLPORTAL_API_SECRET=
RESELLPORTAL_TIMEOUT_MS=15000
```

Keep `ESIM_PROVIDER=mock` until credentials are available. Wallet balance is required on ResellPortal for live orders.

## Retail pricing

Live wholesale amounts are converted to display GBP pence with a simple markup in the adapter (`retailMarkup`, default 1.4). Adjust or replace with an explicit price map before launch.
