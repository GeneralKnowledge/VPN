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

## What the public docs do not settle (checked 2026-11-17)

- **`activation_url` format** is shown only as `https://...`. It could be an LPA string, an Apple `esimsetup.apple.com` link or a web page. Find out with one test-mode order (below) and then one real cheap order; the native app's install flow depends on it.
- **No idempotency key** on `POST /orders`. A retry after a timeout can issue, and pay for, a second eSIM. The app therefore never retries an order whose outcome is unknown (see order states below).
- **Package price currency** is not stated; the balance endpoint reports USD. The adapter's `retailMarkup` treats the wholesale number as if it were GBP, which leaves only about 10% margin after conversion. Replace it with an explicit price map before launch.
- **Insufficient balance** has no documented status code; 402 is assumed.
- **Status values** differ between pages (`AVAILABLE`, `GOT_RESOURCE`); both map to `available`.
- **Clients**: `POST /clients` documents `name` and `email`. Whether a second client with the same email is refused is unknown; one client is created per order today.
- **Cancel/refund of an unused eSIM** at the wholesale side is not documented. A customer refund here does not return wallet money.

## Test mode

ResellPortal accepts `X-RP-Test-Mode: 1` on `POST /clients` and `POST /orders`: the request is validated, nothing is charged, and a sample reply (`test_cli_…`, `test_svc_…`) comes back. Set `RESELLPORTAL_TEST_MODE=true` to send it. Production refuses to boot with it on.

## Payments

eSIMs are one-time purchases through Stripe Checkout in payment mode. No Stripe SDK; `@northstar/billing` calls the REST API and verifies webhook signatures itself.

1. `POST /api/esim/checkout` creates an `esim_orders` row (`pending`) with the price from the provider package (never from the browser), then a Checkout Session with `metadata.kind=esim`, `metadata.orderId` and the order's idempotency key.
2. `checkout.session.completed` (or `async_payment_succeeded`) arrives at `/api/webhooks/stripe`, signed. The handler checks `payment_status=paid` and that amount and currency match the order, records one `payments` row, and issues.
3. Webhook events are claimed once (from PR #17); the order moves `pending → paid` with a conditional update, so duplicate deliveries issue once.

### Order states

| Status | Meaning | What happens next |
| --- | --- | --- |
| `pending` | Checkout open | Webhook, or reconcile asks Stripe after 15 minutes |
| `paid` → `issuing` → `issued` | Normal path | Email with link to the QR |
| `failed` | Provider refused before ordering (wallet empty, rate limit, auth) | Reconcile retries; after 5 attempts → `refund_due` |
| `needs_review` | Outcome unknown (timeout, 5xx, process died mid-call), or amount mismatch | **Never retried automatically.** Admin checks the ResellPortal panel, then Retry or Refund on Admin → eSIM orders |
| `refund_due` | Provider rejected the order (bad package) or retries ran out | Full Stripe refund (idempotency key `refund_<orderId>`); reconcile retries a failed refund |
| `refunded` | Refunded, by us or in the Stripe dashboard (`charge.refunded`) | Customer emailed |
| `expired` | Checkout abandoned or could not start | Nothing |

### Trying it in Stripe test mode

```env
BILLING_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...   # from `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
ESIM_PROVIDER=mock                # or resellportal + RESELLPORTAL_TEST_MODE=true
```

Buy a package on the eSIM host, pay with card `4242 4242 4242 4242`, and the order should reach `issued`. VPN subscriptions use the same Stripe account ([stripe-subscriptions.md](./stripe-subscriptions.md)). Live keys are refused until `STRIPE_ALLOW_LIVE_PAYMENTS=true`, which waits for the company and the decision to take public orders.

Webhook events to enable on the endpoint: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`.

## Activation

```env
ESIM_PROVIDER=resellportal
RESELLPORTAL_API_URL=https://panel.resellportal.com/wp-json/resellportal/v1
RESELLPORTAL_API_KEY=
RESELLPORTAL_API_SECRET=
RESELLPORTAL_TIMEOUT_MS=15000
RESELLPORTAL_TEST_MODE=false
```

Keep `ESIM_PROVIDER=mock` until credentials are available. Wallet balance is required on ResellPortal for live orders.

## Retail pricing

Live wholesale amounts are converted to display GBP pence with a simple markup in the adapter (`retailMarkup`, default 1.4). Adjust or replace with an explicit price map before launch.
