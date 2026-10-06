# Subscription ↔ VPN state matrix

Billing state and VPN state are **intentionally decoupled**. A paid subscription does not guarantee an active provider account until provisioning succeeds; cancellation does not always mean immediate VPN disable.

## States

### Subscription (`subscriptions.status`)

`trialing` | `active` | `past_due` | `cancelling` | `cancelled` | `expired` | `incomplete`

### VPN account (`vpn_accounts.status`)

`pending` | `active` | `disabled` | `expired` | `error`

## Normal combinations

| Subscription | VPN | Meaning | Customer experience |
| --- | --- | --- | --- |
| `active` / `trialing` | `active` | Healthy | Ready to connect |
| `active` / `trialing` | `pending` | Provisioning in progress | “Setting up” |
| `active` / `trialing` | `error` | Provider failure | “Needs attention”; reconcile/retry |
| `cancelling` (cancel at period end) | `active` | Paid until `currentPeriodEnd` | Access continues |
| `cancelled` / `expired` | `disabled` | Access revoked | Cannot download configs |
| `cancelled` | `active` (brief) | Race before suspend job | Reconcile should disable |
| `past_due` | `active` or `disabled` | Payment failed | Grace/suspend via lifecycle |

## Transitions

```
Checkout success
  → subscription.active
  → provisionVpnForUser()
      → vpn.pending (local row first)
      → provider create/get
      → vpn.active | vpn.error

Cancel at period end
  → subscription.cancelling / cancelAtPeriodEnd=true
  → VPN stays active until expiry / admin suspend

Immediate cancel / period ended
  → subscription.cancelled|expired
  → suspendVpnForUser() → provider disable → vpn.disabled
  → local connections soft-revoked

Admin suspend
  → provider disable → vpn.disabled → connections revoked

Admin reactivate (with active sub)
  → provider enable → vpn.active

Reconcile
  → retry provision for active/trialing + missing/pending/error VPN
  → sync provider status for real providerAccountId
  → if provider disabled/expired → local status + revoke connections
```

## Rules enforced in code

1. **Idempotent provision** — stable username per user; never mint `${username}_${n}` on retry.
2. **`canProvisionVpn`** — provisioning requires billing `active|trialing` and a lifecycle that allows access.
3. **Customer APIs** never expose provider account ids, raw errors, or WireGuard keys in UI copy.
4. **Config download** requires `vpn.status === active` and a non-revoked connection owned by the caller.

## Mock billing

Mock checkout/cancel is sufficient to exercise the matrix. Stripe production integration is out of scope for this stage.
