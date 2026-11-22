# App API

The native iPhone app uses the same JSON API as the website. The only difference is how it signs in: it gets a session token in the response body and sends it as `Authorization: Bearer <token>` on every call, instead of a cookie. Base URL is the VPN host (for example `https://vpn.example.com`).

A bearer header is never added by a browser on its own, so these calls need no CSRF protection; the app sends no `Origin` header, which the cross-site check lets through to normal auth.

## Sign in and out

`POST /api/app/session` with `{"login": "<email or username>", "password": "..."}`

```json
{ "token": "<64 hex chars>", "expiresAt": "2026-12-01T12:00:00.000Z", "user": { "username": "alice", "email": "alice@example.com", "name": null } }
```

- Same rate limits and timing as the website login. Wrong details give `401`; admin accounts give `403` and use the website.
- The session lasts 14 days and appears in the customer's session list on the website, where it can be signed out. Changing the password signs out every other session, including the app.
- Store the token in the Keychain. On `401` from any call, sign in again.

`DELETE /api/app/session` signs the app out; the token stops working at once.

## Home screen

`GET /api/app/summary`

```json
{
  "user": { "username": "alice", "email": "alice@example.com", "name": null },
  "subscription": { "planId": "platinum-monthly", "planName": "Platinum Monthly", "status": "active", "billingMode": "subscription", "renews": true, "currentPeriodEnd": "2026-12-17T11:00:00.000Z" },
  "vpn": { "status": "active", "ready": true },
  "devices": { "active": 1, "limit": 5 }
}
```

`subscription` is `null` with no live plan. The app sends people to the website to buy or change a plan; it doesn't take payments.

## Adding this iPhone and getting a WireGuard config

These existing routes accept the bearer token as they are:

| Call | Does |
|---|---|
| `GET /api/vpn/locations` | Server locations: `{ locations: [{ id, country, countryCode, city, ... }] }` |
| `GET /api/vpn/connections` | This customer's saved connections |
| `POST /api/vpn/connections` `{ name, locationId, protocol: "wireguard", platform: "ios" }` | Adds a connection and a device (checks the plan's device limit): `{ id }` |
| `POST /api/vpn/config` `{ connectionId }` | The WireGuard config as a `.conf` file (`Cache-Control: no-store`) |
| `DELETE /api/vpn/connections?id=...` | Removes a connection |

Until the app has its own tunnel (that needs a paid Apple organisation team), it hands the `.conf` to the official WireGuard app. Don't keep the config after handing it over: it holds the device's private key.

## eSIM

The eSIM routes answer on the eSIM host for the website. A request with the app's bearer token may call them on any host, so the app keeps one server address. A bearer header that doesn't match a live session gets `401`, not a pass through the host check.

| Call | Does |
|---|---|
| `GET /api/esim/packages?country=GB` | Packages for sale: `{ packages: [{ code, name, countryCode, dataVolume, validity, price, currency }] }` (price in pence) |
| `POST /api/esim/checkout` `{ packageCode }` | Starts a purchase: `{ url, sessionId, orderId, amount, currency }`. Open `url` in a browser (Stripe Checkout); the price is set by the server |
| `GET /api/esim/orders` | This customer's orders, newest first, each with `status` and, once issued, `profile: { iccid, qrCodeUrl, activationUrl, status }` |
| `POST /api/esim/complete` `{ sessionId }` | Mock billing only (development): completes the mock payment. With Stripe, payment is confirmed by Stripe's webhook, so poll `GET /api/esim/orders` after the browser closes |

Order statuses are described in [esim-resellportal.md](./esim-resellportal.md#order-states). Treat `qrCodeUrl`, `activationUrl` and `iccid` as secrets: don't log or cache them outside the Keychain.

## Travel

The Travel routes answer on the Travel host for the website, and, like eSIM, on any host for the app's bearer token. Travel sells nothing: eSIM packages here are read from the eSIM catalogue, and buying one uses the eSIM routes above.

| Call | Does |
|---|---|
| `GET /api/travel/destinations` | `{ destinations: [{ slug, name, countryCode, summary }] }` |
| `GET /api/travel/destinations/:slug` | `{ destination: { ...facts, entryRequirementsUrl, reviewed }, esim: { available, packages, plansUrl }, partners: { notice, groups: [{ category, title, links: [{ id, partnerName, label, url, test, disclosure }] }] } }`. `reviewed: false` means the facts are a draft: say so. `available: false` means the eSIM catalogue didn't answer. `partners` are referral links (phase 2): show `notice` next to them, open `url` (the Travel host's `/go/<id>`) in the browser, mark `test` links as a test partner, and never add a price. `groups` is empty when no partner is switched on |
| `GET /api/travel/trips` | This customer's saved trips, newest first: `{ trips: [{ id, destination: { slug, name, countryCode }, startDate, endDate, notes, createdAt, updatedAt }] }`. Dates are `YYYY-MM-DD` or `null` |
| `POST /api/travel/trips` `{ destinationSlug, startDate?, endDate?, notes? }` | Saves a trip: `201 { trip }`. `400` for an unknown destination, a bad date, an end before the start, notes over 2,000 characters, or more than 100 trips |
| `GET /api/travel/trips/:id` | `{ trip }`; `404` if it isn't this customer's |
| `PATCH /api/travel/trips/:id` `{ startDate?, endDate?, notes? }` | Changes the fields sent (`null` clears one): `{ trip }` |
| `DELETE /api/travel/trips/:id` | `{ ok: true }` |

Trips are personal data: never log their contents.

### Search with estimates

Simulated estimates from our own model (TRAVEL-HUB.md, phase 1b), not partner prices. Every answer carries `{ estimate: true, currency: "GBP", note }`: show the note, and label every figure as an estimate. Money is in pence. A search the model can't estimate (a past date, an unknown airport, check-out before check-in) is a `400` whose `error` is a sentence to show.

| Call | Does |
|---|---|
| `GET /api/travel/airports` | `{ origins: [airport], destinations: [airport] }`, each `{ code, city, name, countryCode, destinationSlug, lat, lon }` |
| `GET /api/travel/search/flights?from&to&depart&return?&adults=1&cabin=economy&sort=best` | `{ options: [{ id, outbound: leg, inbound: leg \| null, pricePerPersonMinor, totalMinor, tags }] }`; a leg is `{ from, to, departs, arrives, arrivesDayOffset, durationMinutes, via }` in local times. `cabin`: economy, premium, business, first. `sort` and `tags`: best, cheapest, fastest |
| `GET /api/travel/search/stays?city&checkIn&checkOut&guests=2&sort=cheapest` | `{ options: [{ id, kind, label, area, city, nightlyMinor, nights, rooms, totalMinor }] }`. `city` is a destination airport code. `sort`: cheapest, comfort |
| `GET /api/travel/search/cars?city&pickUp&dropOff` | `{ options: [{ id, carClass, label, seats, bags, automatic, dailyMinor, days, totalMinor, pickUp }] }` |
| `GET /api/travel/search/packages?from&to&depart&return&adults=2` | `{ flight, options: [{ id, stay, totalMinor }] }`: the cheapest estimated flight with each place to stay |
| `GET /api/travel/price-map?from&month=YYYY-MM` | `{ from, month, pins: [{ code, city, countryCode, destinationSlug, lat, lon, pricePerPersonMinor }] }`: the cheapest estimated economy return per person in that month |
| `GET /api/travel/random-trip?from&seed&region?&month?&budget?&nights?&adults?&rollWhere?&rollWhen?&rollFlight?&rollStay?&lockWhere?&lockWhen?&lockFlight?&lockStay?` | `{ trip: { destination: { code, city, countryCode, destinationSlug }, depart, returnDate, nights, adults, flight, stay, perPersonMinor, totalMinor, overBudgetByMinor, current: { where, when, flight, stay }, upgrades: [{ kind, title, deltaPerPersonMinor, locks }] }, thingsToDo: { notice, links: [{ label, url, test, disclosure }] } }`: the random trip planner (TRAVEL-HUB.md phase 1c). `budget` is whole pounds per person for flights and the stay. Keep `seed` for one "Surprise me"; add one to a `roll*` to re-roll that part; send a `current` value as its `lock*` to keep it (`lockFlight` only counts with `lockWhere` and `lockWhen`). An upgrade's `locks` are applied the same way. When nothing fits, a 400 says the cheapest trip found |

