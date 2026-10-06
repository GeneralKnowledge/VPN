# VPNresellers API research

Source: official docs at [https://api.vpnresellers.com/docs/v4_1/](https://api.vpnresellers.com/docs/v4_1/) (API version **4.1**), reviewed for this project.

Help center: [API getting started](https://www.vpnresellers.com/help/integrations/api-getting-started).

OpenAPI: linked from the v4.1 documentation page.

## API version

**v4.1** — base path `/v4_1`. Older versions (`v3`, `v3_2`) exist but are not used by Northstar.

## Base URL

```
https://api.vpnresellers.com/v4_1
```

Override with `VPNRESELLERS_API_URL` if needed. Default matches the official docs.

## Authentication

| Surface | Scheme |
| --- | --- |
| Most endpoints | `Authorization: Bearer {token}` |
| `/un/accounts/*` | HTTP Basic (`Base64(username:password)`) |
| `/geoip` | None |

Obtain a token from the VPNresellers dashboard (API access / VPN Access page).

Northstar uses Bearer auth only. Username/password Basic endpoints are not required for our lifecycle.

## Conventions

- JSON request/response with `Accept: application/json` and `Content-Type: application/json`
- Responses usually include top-level `code` matching HTTP status
- Configuration endpoints: `Accept` must be exactly `application/json` (JSON) or `text/html; charset=UTF-8` (file download)
- List endpoints are paginated (`data`, `links`, `meta`; optional `page`, `per_page`, default **15**)

## Error responses (documented)

| HTTP | Meaning | Our `VpnProviderError.code` |
| --- | --- | --- |
| 400 | Bad Request | `validation` |
| 401 | Unauthorized | `unauthorized` |
| 402 | Insufficient Balance | `insufficient_balance` (retryable) |
| 403 | Forbidden | `unauthorized` |
| 404 | Not found | `not_found` |
| 405 | Method Not Allowed | `unknown` |
| 409 / username taken (422) | Conflict | `conflict` |
| 422 | Validation error | `validation` (or `conflict` if username taken) |
| 429 | Rate limited (not documented; handled) | `rate_limited` (retryable) |
| ≥500 | Server error | `unknown` (retryable) |

Malformed JSON on error responses maps to `unknown` (retryable). Timeouts map to `timeout` (retryable). Network failures map to `unavailable` (retryable).

## Accounts (VPN credentials)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/accounts/check_username?username=` | Check username availability |
| GET | `/accounts` | List accounts (paginated; may accept `username` filter) |
| POST | `/accounts` | Create account |
| GET | `/accounts/{account}` | Retrieve account |
| DELETE | `/accounts/{account}` | Delete account |
| PUT | `/accounts/{account}/enable` | Enable / reactivate |
| PUT | `/accounts/{account}/disable` | Disable / suspend |
| PUT | `/accounts/{account}/change_password` | Change password |
| PUT | `/accounts/{account}/expire` | Set expiry (`expire_at`: `Y-m-d` or null for auto-renewal) |
| POST | `/accounts/validate` | Validate credentials |

Username-based variants under `/un/accounts` use Basic auth (enable, disable, change_password, show).

### Create account body

- `username` (required): 3–50 chars, alphanumeric + dashes/underscores/dots/@
- `password` (required): validated by API (examples mention min 6)
- `customer` (optional): either `customer_id` **or** `first_name`, `last_name`, `email`, `project_id`

Northstar sends `customer` only when `VPNRESELLERS_PROJECT_ID` and customer email are configured.

### Account object (retrieve)

Includes `id`, `username`, `status` (`Active` / `Disabled`), WireGuard fields (`wg_ip`, `wg_private_key`, `wg_public_key`), `expired_at`, timestamps.

**Never log WireGuard private keys, passwords, or API tokens.**

### Account lookup for idempotency

1. Prefer `GET /accounts/{id}` when we already stored a provider account id
2. On create conflict / username taken: resolve via `GET /accounts?username=` (when supported) or paginated list scan
3. Never create a second account with a mutated username after a timeout

## Configurations

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/configuration/openvpn?server_id=&port_id=` | OpenVPN profile; `port_id` from `/ports` |
| GET | `/configuration/wireguard?server_id=&account_id=` | WireGuard config |
| GET | `/configuration/vless?server_id=&account_id=` | VLESS config |

Treat returned configuration bodies as **sensitive**. Do not persist them in analytics or logs. Northstar streams them to the authenticated owner only.

## Servers / locations

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/servers` | Servers for OpenVPN/WireGuard (`id`, `name`, `ip`, `country_code`, `city`, `capacity`) |
| GET | `/vless-servers` | VLESS server list |
| GET | `/ports` | Ports for OpenVPN (`id`, `protocol`, `number`, `default`) |
| GET | `/geoip` | Geo info (no auth) |

**Pagination is required** — default page size is 15. The adapter pages with `per_page=100` until `meta.last_page`.

## Customers & projects

Documented customer/project CRUD:

- Create/retrieve/edit/delete customer
- List customer accounts: `GET /customers/{customer}/accounts`
- Projects: list/create/retrieve/edit/delete; list project customers/accounts

Create-customer examples in the public docs show path quirks. Treat official parameter tables as source of truth. Do **not** invent endpoints.

Optional env: `VPNRESELLERS_PROJECT_ID` — when set, account create may attach a customer object.

## Connection model (important)

VPNresellers does **not** expose first-class “connections” or “devices”.

| Northstar concept | Provider reality |
| --- | --- |
| VPN account | `/accounts` |
| Location | `/servers` (+ `/vless-servers`) |
| Connection / device | Local DB only |
| Configuration download | `/configuration/*` |
| Suspend access | `PUT .../disable` |
| Revoke connection | Soft-delete local row (stop downloads) |

## Webhooks

No webhook system is documented in the v4.1 public API reference. Our `/api/webhooks/vpnresellers` route is prepared for future callbacks / manual replay and does **not** claim an official VPNresellers webhook contract.

## Rate limits

Not documented on the public v4.1 reference. Client behaviour:

- Timeout via `VPNRESELLERS_TIMEOUT_MS` (default 15000)
- Map HTTP 429 → `rate_limited` (retryable)
- Reconciliation / admin retry for retryable failures
- Do not blindly retry `createAccount` without idempotency checks

## Sandbox / test capabilities

No separate public sandbox URL is documented. Testing approaches:

1. **Development:** `VPN_PROVIDER=mock` (default) — full product simulation
2. **Adapter unit tests:** mocked HTTP against documented shapes
3. **Staging with real credentials:** use a VPNresellers account with low balance / test usernames; delete test accounts after

## Mapping to our `VPNProvider`

| Interface method | VPNresellers call |
| --- | --- |
| `createAccount` | `POST /accounts` (+ optional `PUT .../expire`) |
| `getAccount` | `GET /accounts/{id}` |
| `findAccountByUsername` | `GET /accounts?username=` / paginated scan |
| `suspendAccount` | `PUT /accounts/{id}/disable` |
| `reactivateAccount` | `PUT /accounts/{id}/enable` |
| `deleteAccount` | `DELETE /accounts/{id}` |
| `listLocations` | Paginated `GET /servers` + `GET /vless-servers` |
| `getConnectionConfig` | `/configuration/wireguard\|openvpn\|vless` (+ `/ports` for OpenVPN) |
| `getProviderStatus` | Lightweight `GET /servers?page=1&per_page=1` |

## Activation

```env
VPN_PROVIDER=vpnresellers
VPNRESELLERS_API_URL=https://api.vpnresellers.com/v4_1
VPNRESELLERS_API_TOKEN=your_token
VPNRESELLERS_TIMEOUT_MS=15000
# Optional — enables customer object on account create
VPNRESELLERS_PROJECT_ID=
```

Keep `VPN_PROVIDER=mock` until credentials are available. The adapter is unit-tested with mocked HTTP; live calls require a real token.
