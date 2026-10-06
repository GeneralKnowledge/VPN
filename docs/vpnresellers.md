# VPNresellers API research

Source: official docs at [https://api.vpnresellers.com/docs/v4_1/](https://api.vpnresellers.com/docs/v4_1/) (API version **4.1**), reviewed for this project.

Help center: [API getting started](https://www.vpnresellers.com/help/integrations/api-getting-started).

## Base URL

```
https://api.vpnresellers.com/v4_1
```

## Authentication

- Most endpoints: `Authorization: Bearer {token}`
- Endpoints under `/un/accounts`: HTTP Basic (`username:password` base64)
- `/geoip`: unauthenticated

Obtain a token from the VPNresellers dashboard (API access / VPN Access page).

## Conventions

- JSON request/response with `Accept: application/json` and `Content-Type: application/json`
- Responses usually include top-level `code` matching HTTP status
- Configuration endpoints: `Accept` must be exactly `application/json` (JSON) or `text/html; charset=UTF-8` (file download)
- List endpoints are paginated (`data`, `links`, `meta`; optional `page`, `per_page`, default 15)

## Error codes (documented)

| HTTP | Meaning |
| --- | --- |
| 400 | Bad Request |
| 401 | Unauthorized |
| 402 | Insufficient Balance |
| 403 | Forbidden |
| 404 | Not found |
| 405 | Method Not Allowed |
| 422 | Validation error |

## Accounts (VPN credentials)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/accounts/check_username?username=` | Check username availability |
| GET | `/accounts` | List accounts (paginated) |
| POST | `/accounts` | Create account (`username`, `password`, optional `customer` object) |
| GET | `/accounts/{account}` | Retrieve account |
| DELETE | `/accounts/{account}` | Delete account |
| PUT | `/accounts/{account}/enable` | Enable account |
| PUT | `/accounts/{account}/disable` | Disable account |
| PUT | `/accounts/{account}/change_password` | Change password |
| PUT | `/accounts/{account}/expire` | Expire account |
| POST | `/accounts/validate` | Validate account credentials |

Username-based variants (Basic auth under `/un/accounts`): enable, disable, change_password, show.

### Create account body

- `username` (required): 3–50 chars, alphanumeric + dashes/underscores/dots/@
- `password` (required): documented min length varies in examples (treat as validated by API)
- `customer` (optional): `customer_id` **or** `first_name`, `last_name`, `email`, `project_id`

### Account object (retrieve)

Includes `id`, `username`, `status` (e.g. Active), WireGuard fields (`wg_ip`, `wg_private_key`, `wg_public_key`), `expired_at`, timestamps.

**Never log WireGuard private keys.**

## Configurations

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/configuration/openvpn?server_id=&port_id=` | OpenVPN profile |
| GET | `/configuration/wireguard?server_id=&account_id=` | WireGuard config |
| GET | `/configuration/vless?server_id=&account_id=` | VLESS config |

## Servers / locations

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/servers` | Servers for OpenVPN/WireGuard (`id`, `name`, `ip`, `country_code`, `city`, `capacity`) |
| GET | `/vless-servers` | VLESS server list |
| GET | `/ports` | Ports for OpenVPN |
| GET | `/geoip` | Geo info (no auth) |

## Customers & projects

Documented customer/project CRUD:

- Create/retrieve/edit/delete customer
- List customer accounts: `GET /customers/{customer}/accounts`
- Projects: list/create/retrieve/edit/delete; list project customers/accounts

Create-customer examples in the public docs show path quirks (`/customers/{customer}` on POST). Treat official parameter tables as source of truth and verify against live OpenAPI/dashboard when activating. Do **not** invent endpoints.

## Webhooks

No webhook system is documented in the v4.1 public API reference reviewed for this project. Our `/api/webhooks/vpnresellers` route is prepared for future callbacks / manual replay and is **not** claiming an official VPNresellers webhook contract.

## Rate limits

Not documented on the public v4.1 reference page reviewed. Implement client timeouts (see `VPNRESELLERS_TIMEOUT_MS`) and retries with backoff for 5xx/402 where appropriate.

## Mapping to our `VPNProvider`

| Interface method | VPNresellers call |
| --- | --- |
| `createAccount` | `POST /accounts` |
| `getAccount` | `GET /accounts/{id}` |
| `suspendAccount` | `PUT /accounts/{id}/disable` |
| `reactivateAccount` | `PUT /accounts/{id}/enable` |
| `deleteAccount` | `DELETE /accounts/{id}` |
| `listLocations` | `GET /servers` + `GET /vless-servers` |
| `getConnectionConfig` | `/configuration/wireguard\|openvpn\|vless` |
| `getProviderStatus` | lightweight `GET /servers` |

## Activation

```env
VPN_PROVIDER=vpnresellers
VPNRESELLERS_API_URL=https://api.vpnresellers.com/v4_1
VPNRESELLERS_API_TOKEN=your_token
```

Keep `VPN_PROVIDER=mock` until credentials are available. The adapter compiles and is unit-tested with mocked HTTP.
