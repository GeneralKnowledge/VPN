# Stripe subscriptions for the VPN plans

The VPN plans take card payments through Stripe Checkout, called over Stripe's REST API with no SDK (the same client the eSIM checkout uses). Use **test mode** until the company exists and public orders are approved: live keys are refused until `STRIPE_ALLOW_LIVE_PAYMENTS=true`.

| Tier | Checkout mode | Stripe price | What happens after |
|---|---|---|---|
| Platinum, Diamond | `subscription` | recurring, monthly or yearly | Stripe renews; `invoice.paid` extends the period |
| Gold | `payment` | one-time | Access runs to the period end, then stops |
| Bronze, Iron | crypto rail | none | Not Stripe (see the crypto provider) |

## Set up in test mode

1. In the Stripe dashboard (test mode), create one product per tier and its prices in **GBP**: recurring monthly and yearly prices for Platinum and Diamond, and one-time prices for Gold. Match the amounts in `packages/config` (499 and 3999 pence today); a different amount still works but leaves a `billing.amount_mismatch` audit entry.
2. Put the price ids in `.env`: `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL` (Platinum), `STRIPE_PRICE_DIAMOND_MONTHLY`, `STRIPE_PRICE_DIAMOND_ANNUAL`, `STRIPE_PRICE_GOLD_MONTHLY`, `STRIPE_PRICE_GOLD_ANNUAL`. A plan without a price id refuses checkout with a clear error.
3. Set `BILLING_PROVIDER=stripe` and `STRIPE_SECRET_KEY=sk_test_...`. Keep `STRIPE_ALLOW_LIVE_PAYMENTS=false`.
4. Add a webhook endpoint for `https://<vpn host>/api/webhooks/stripe` and put its signing secret in `STRIPE_WEBHOOK_SECRET`. Locally, `stripe listen --forward-to localhost:3000/api/webhooks/stripe` prints one. Send these events:
   - `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`
   - `invoice.paid`, `invoice.payment_failed`
   - `customer.subscription.updated`, `customer.subscription.deleted`
   - `charge.refunded`

The eSIM product shares the endpoint and the account; its events are told apart by `metadata.kind`.

## Try it

Sign up on the VPN host, pick Platinum monthly and pay with `4242 4242 4242 4242` (any future date, any CVC). The dashboard shows the plan once the webhook arrives, usually within seconds, and the VPN account is created then. Useful Stripe test cards:

| Card | Shows |
|---|---|
| `4000 0000 0000 9995` | Declined at checkout: nothing is granted |

To see a failed renewal, attach `4000 0000 0000 0341` as the customer's card in the Stripe dashboard and advance a test clock past the period end: the plan goes to a grace period, then suspension.

Cancel from the dashboard (access continues to the period end), resume before it ends, or refund from the Stripe dashboard (access ends).

## Safeguards

- **Signed webhooks only.** `Stripe-Signature` is checked (HMAC-SHA256, constant time, 5-minute tolerance) before anything is read. Each event id is processed once, and concurrent deliveries are claimed atomically.
- **Access only after payment.** A completed session grants a plan only if `payment_status` is `paid`, it matches a checkout this site started (`checkout_sessions`), and the user and plan agree with that checkout. Unpaid completions (bank debits) wait for `async_payment_succeeded`. Unknown or mismatched sessions grant nothing and leave an audit entry.
- **No double charges kept.** One live plan per user is enforced by the database. If a second checkout is paid anyway (two tabs), its subscription is cancelled at once and its payment refunded with a fixed idempotency key, so a retried webhook reuses the same refund.
- **Server-side prices.** The browser only names a plan; the Stripe price id comes from server config.
- **Refunds.** A full refund made in Stripe ends the plan's access and stops it renewing; a partial refund is recorded only.
- **Launch gate.** `sk_live_` and `rk_live_` keys are refused for subscriptions and eSIM payments until `STRIPE_ALLOW_LIVE_PAYMENTS=true`.
- **Idempotent creates.** Checkout creation sends an `Idempotency-Key`.

## API versions

Stripe changed some fields in 2025 (an invoice's subscription moved under `parent`, `current_period_end` moved onto subscription items, and an invoice's payment intent moved under `payments`). The code reads both shapes, so the webhook endpoint's API version doesn't matter.

## Not done yet

- Plan changes (upgrade or downgrade) are not offered: cancel and subscribe again.
- No Stripe customer portal; cancel and resume are in the dashboard.
- Reconcile doesn't yet ask Stripe about VPN checkouts whose webhook never arrived (Stripe retries deliveries for three days).
