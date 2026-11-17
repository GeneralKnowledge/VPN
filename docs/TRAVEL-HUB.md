# Travel Hub plan

Status: phase 1 in progress (the Travel host, destination pages and saved trips on the web are built; the iPhone tabs are next). No affiliate programme has been applied to or contacted. Agreed direction from Reuben, 2026-11-17; names are provisional.

## In one paragraph

Travel Hub is a travel discovery experience that sits in front of our two products. People explore a destination, compare what can honestly be compared, and leave for established providers (airlines, hotels, car hire, parking) through tracked referral links. Our own eSIM is the first thing in Travel Hub that we sell and fulfil ourselves, and the VPN is offered where it fits. We take KAYAK's best ideas (destination pages, side-by-side options, saved trips) without becoming a travel agency: we never take a booking, hold a fare or handle a traveller's payment for a third party.

## The shape of it

Travel Hub is the travel discovery and planning layer, in four parts:

| Part | What it covers |
|---|---|
| **Explore** | Destinations, travel inspiration, flights, hotels and travel services |
| **My Trips** | Saved destinations, itineraries, estimated budgets and booking references |
| **Connectivity** | Our own eSIM and VPN products, each with its own independent purchasing |
| **Travel Partners** | Affiliate referrals, live inventory where a partner provides it, and transparent commission disclosure |

## Ground rules

1. **eSIM and VPN stay separate products.** Each keeps its own catalogue, checkout, Stripe objects, provider, webhooks, order tables and support flow ([MULTI-PRODUCT.md](./MULTI-PRODUCT.md)). Travel Hub never sells either one itself: it links into the product's own checkout. Travel Hub has no checkout and no billing of its own.
2. **The eSIM launch comes first.** Stripe test-mode orders, verified-payment provisioning and the eSIM tab in the iPhone app are a separate launch-critical stream. No Travel Hub phase may change eSIM checkout, webhooks or provisioning; where Travel Hub needs eSIM data it reads the public package list (`GET /api/esim/packages`).
3. **A link is not an offer.** Travel Hub shows a price only when a partner gave it to us in a live result, with the time it was fetched. A referral link ("Search Japan hotels on Partner X") never carries a price, a "from £" figure we made up, or a ranking that implies we compared it. No "price comparison" wording until we actually have live comparable results.
4. **Disclosure is visible, and commission never ranks results.** Every page with referral links says, near the links, that we may earn a commission. Sort orders are price, duration, rating or distance, never commission rate. Our own eSIM is labelled as ours.
5. **Insurance is a referral only, after review.** See [Insurance](#insurance).
6. **No new app slot.** The free Apple team allows 3 sideloaded apps and all 3 are used. Travel Hub goes into the existing iPhone app in `apps/ios` as tabs (see below), and into the existing Next.js app on the web.

### Shared shell, separate products

Confirmed by Reuben, 2026-11-17: one iPhone app shell (and one web deploy) is fine, and purchasing, subscriptions and infrastructure stay per product, because eSIM and VPN are each resold from a different supplier. So the app has Travel, eSIM and VPN areas and independent back ends behind it.

**Identity and sessions.** One shared account is not single sign-on, so the plan keeps them apart:

- **One identity across products.** This works today: one `users` table, and the same email can sign in on either host.
- **Separate web sessions per product host.** [MULTI-PRODUCT.md](./MULTI-PRODUCT.md) makes cookies host-only by design, so signing in on the VPN host does not sign you in on the eSIM or Travel host. Travel Hub keeps that. Seamless web sign-in across hosts would be a deliberate SSO project with its own plan, not part of this one.
- **One authenticated shell in the native app.** The app holds one bearer token ([app-api.md](./app-api.md)), which may call routes on any host, so inside the app a person signs in once.

## Where it lives in this repository

| Piece | Where | Why |
|---|---|---|
| Web Travel Hub | `apps/web`, served on a third product host (`PRODUCT_HOST_TRAVEL`, `travel.example.com`, on the existing deployment; decided 2026-11-17). The host routing knows only `vpn` and `esim` today and must be extended, see [A third product host](#a-third-product-host) | Affiliate programmes judge us on a public website and its traffic; the web is where most referral clicks will happen |
| Partner adapters | new `packages/travel-partners`: a `TravelPartner` interface, a `MockTravelPartner`, then one adapter per network | Same pattern as `vpn-provider` and `esim-provider`; the app never builds a partner URL by hand |
| Destination content | new `packages/destinations`: curated country/city data (JSON in the repo, reviewed by a person) | Small, checkable, no scraping |
| Tables | `packages/db`: `travel_partners`, `outbound_links`, `partner_events`, `trips`, `trip_items` | `referrals` already exists (customer refer-a-friend), so partner tracking uses different names |
| iPhone | `apps/ios`: Explore, Trips, and a Connectivity area that is the eSIM tab already planned | Rust core owns trips and the API calls; SwiftUI presents (Forge rules) |

No new crate or package depends on the billing package. `travel-partners` depends on `config` only.

### A third product host

Routing today knows two products (`vpn`, `esim`), and an unmatched host falls back to VPN. Phase 1 must not assume a third product just works. It extends, and tests, each of these:

- **Host identification and middleware:** `travel` in the product type and config (`PRODUCT_HOST_TRAVEL`), host matching, the `x-northstar-product` header, and the existing rule that a client-supplied header or `X-Forwarded-Host` is never trusted.
- **Routes and redirects:** which routes the Travel host serves and rewrites (marketing at `/travel/*`, say), and the redirects in both directions: VPN-only and eSIM-only pages away from the Travel host, Travel pages away from the other two, and admin to the VPN host as today.
- **Cookies and sessions:** host-only session cookies on the Travel host, its own sign-in, and a test that a VPN or eSIM session does not sign you in there.
- **Canonical URLs and deployment:** canonical links, sitemap and robots per host, links from Travel into eSIM and VPN checkout using each product's own URL (`ESIM_APP_URL`, `APP_URL`), and the deployment config (DNS, TLS, env inventory in [PRE-CUTOVER.md](./PRE-CUTOVER.md)).

The tests extend `packages/config/src/product.test.ts` (host resolution) and add a Playwright smoke test for the Travel host alongside `apps/web/e2e/esim-smoke.spec.ts`.

## Core concepts

These follow Reuben's list, with the live/link split made part of the types so the UI cannot blur it.

| Concept | What it holds | Notes |
|---|---|---|
| `TravelPartner` | id, display name, network (direct, Travelpayouts, Awin, ...), categories, markets, integration type (`link` or `live`), disclosure text, status (`draft`, `approved`, `paused`) | Seeded from config; a partner is `approved` only once its programme has accepted us and its terms were read |
| `TravelOffer` | partner, category, title, price and currency, `fetchedAt`, `expiresAt`, deep link | Only from a `live` adapter. Shown with "found at 14:05, the partner's price may change". Never cached past `expiresAt` |
| `ReferralLink` | partner, category, destination, campaign id, tracking parameters, attribution metadata (our sub-id, placement) | Built only by the adapter. Never shows a price |
| `Trip` | owner, destination, dates (optional), notes, items | Saved destinations and plans. Items point to an eSIM order, a saved `TravelOffer` snapshot, or a free-text booking the person typed in |
| `PartnerEvent` | `outbound_click` (ours), `conversion`/`commission` (from a network report, where offered) | Click records hold partner, placement, category, destination and a random click id. No search text, no names, no trip contents. See [Referral tracking and privacy](#referral-tracking-and-privacy) |

Outbound clicks go through `/go/<linkId>` on our server, which records the click and redirects. That keeps every partner URL in one place, lets a partner be paused instantly, and gives one place for the disclosure and consent checks.

### Referral tracking and privacy

A click id is not anonymous once it sits next to a timestamp, an IP address or a server access log: it is pseudonymous personal data, and the plan treats it that way.

- **Click ids are random** and say nothing about the person: never derived from an account id, email, device id or trip.
- **Partner sub-ids carry no personal data.** Only the click id and a placement name go to a partner; never an account id, a name, a destination tied to a person, or anything from a trip.
- **Retention is set before launch.** Raw click records are kept for a fixed period (proposed: 90 days, long enough for networks to report conversions), then deleted or reduced to counts. Conversion and commission records are kept as long as accounting needs, without the click's request details. The periods go in the privacy page.
- **IP addresses are minimised.** The `/go/` route doesn't store the IP; access logs for it are truncated or dropped, with the log retention stated.
- **One consent decision per tracking mechanism**, written down: our own first-party click record, each partner's cookie or pixel, and any network script. Each says whether it needs consent under PECR and what happens when someone says no (the link still works, without the partner's tracking where the partner allows it).
- **No open redirect.** `/go/<linkId>` only ever redirects to a URL that an approved partner adapter built and stored under that id. It takes no destination URL from the request, an unknown or paused id goes to a plain "this link isn't available" page, and a test proves an arbitrary URL can't be passed through.

## The destination page

The centre of Travel Hub. For Japan, in this order:

1. **Before you go:** short curated facts (currency, plugs, visa reminder with a link to the official UK government travel advice page, emergency number). Curated in `packages/destinations`, each with a "last checked" date.
2. **Stay connected:** our Japan eSIM packages from the existing package list, a "will this phone work" check (planned in the eSIM stream), and a link into eSIM checkout. Clearly ours.
3. **Flights** and **Places to stay:** referral links to approved partners, with the search pre-filled where the partner supports it (destination, dates). Live results only once an adapter offers them.
4. **Getting around:** transfers, trains, car hire, as partners are approved.
5. **Stay safe online:** a short note on public Wi-Fi with a link to the VPN product. Clearly ours.
6. **Travel insurance:** absent until the insurance review is done.
7. **Rough budget:** a person-entered estimate (nights x a nightly figure they choose, plus eSIM price we know). Labelled "your estimate", never presented as a quote.
8. **Save to a trip.**

## Partners: how we'd start

No sign-ups yet; this is the order to consider them in, once Reuben says go.

| Partner / network | Use | What gates it |
|---|---|---|
| Travelpayouts | One integration for several brands (flights, hotels, transfers, car hire, activities) | Each brand programme accepts separately; read every programme's terms |
| Awin | UK and European merchants, including airport services | Per-merchant approval |
| Holiday Extras | UK airport parking, hotels, lounges | Its own programme |
| Trip.com | Flights, hotels, trains, activities; advertises hotel data feeds and API | Programme approval. Joining the affiliate programme does not by itself grant feed or API access |
| Skyscanner | Flight, hotel, car search referrals | Reuben's research: a website with more than 5,000 unique monthly visitors for affiliate links, about 100,000 monthly active users for the Travel API. So: later, and nothing depends on its API |

Recommendation: start with **Travelpayouts** (widest coverage from one account) plus **Holiday Extras** (UK airport services), all as `link` partners. Look at Trip.com's feed as a candidate first `live` adapter.

**The first live adapter is conditional.** Build it only once we have, in writing: actual feed or API access, commercial permission to show its prices, the markets it covers, and its rules on how prices are displayed and how long they may be cached. Until then, everything else in Travel Hub works on `link` partners alone, and nothing in phases 1 to 5 depends on live inventory. Re-check every programme's criteria before applying; the numbers above are from Reuben's research and change.

## Insurance

In the UK, introducing customers to an insurer can itself be a regulated insurance distribution activity, depending on what the app does (FCA Handbook, PERG 5). So:

- No insurance code, copy, or partner until a UK compliance review says what we may do and under what arrangement. That review is a person's job, not the plan's.
- The first version, if approved, is a plain referral to one reviewed partner, built to the reviewer's wording. We do not compare cover levels, summarise exclusions, recommend a policy or take any insurance payment ourselves.
- Cover/exclusion comparison stays out of scope until the review explicitly allows it.

## Other things to get right

- **Consent for tracking.** Partner tracking usually sets cookies or carries ids across sites. Under UK GDPR and PECR, non-essential tracking needs consent; the cookies page today says only essential cookies are used. Phase 2 adds a consent choice and updates the privacy and cookies pages before the first live partner link.
- **Advertising rules.** Affiliate links are marketing: disclosure must be clear and up front (ASA/CAP and CMA guidance). The disclosure text lives on each `TravelPartner` and in one shared component.
- **Personal data in trips.** Start with destinations, dates, notes and links only. Travel documents (passports, tickets) are out of scope until there's a security plan: they'd be on-device first, never in server logs.
- **Apple.** Travel bookings and eSIM data are goods and services used outside the app, so paying for them outside In-App Purchase is allowed (App Review 3.1.3(e)); re-check at App Store time, together with the rule that a VPN subscription sold on the web must also be offered through In-App Purchase to be usable in the app (3.1.3(b)).
- **Logging.** Never log search text, trip contents or a person's destination with their identity.

## Phases

Each phase is one or a few PRs, with its own tests, and ends with a working state. Phase numbers match Reuben's roadmap.

| Phase | Delivers | Done when | Needs from Reuben |
|---|---|---|---|
| 0 | This plan | Merged | Review the open questions |
| 1 | Travel host on the web, destination pages for the first ten countries from curated data, saved trips (web + API), Explore and Trips tabs in the iPhone app. Mock partner only | A signed-in person can open Japan, see our eSIM packages, save the trip on the web and see it on the phone | Nothing (destinations decided) |
| 2 | `travel-partners` package, `/go/` redirect and click records, disclosure component, consent and policy page updates, first `link` partners (flights, hotels) | A real partner link works end to end in test, with a recorded click and visible disclosure | Programme sign-ups (he applies, or says go) |
| 3 | eSIM in journeys: trip-aware package suggestions, "connectivity" item on a trip, activation guidance; reads the eSIM product, changes nothing in its checkout | Starting from a trip, a person reaches eSIM checkout in one tap | eSIM launch stream finished first |
| 4 | Travel essentials: parking, transfers, car hire, activities as `link` partners | Two essentials categories live | Partner approvals |
| 5 | Insurance as a reviewed referral | Built to the reviewer's wording only | Compliance review result |
| 6 | Live comparison where a partner gives real inventory (`live` adapters, under the conditions above), alerts, richer trip planning | Live results show their fetch time and source, within the partner's display and cache rules | Feed/API access and permissions |
| Later | Trip-aware recommendations (below) | | |

Phase 1 can start alongside the eSIM stream because it touches neither payments nor provisioning. Phases 3 onward wait for the eSIM launch. Phases are taken one at a time; phase 1 is the next milestone and needs no affiliate sign-ups or paid APIs.

### Longer term: trip-aware recommendations

Once someone saves a trip (Japan, three weeks in April), Travel Hub should use that context instead of making them search for the same destination again: the eSIM packages that fit the length of the stay, accommodation searches pre-filled with the dates, airport transfers for the arrival airport, and the destination information that matters for those dates. Phase 3 is the first small piece of this (trip-aware eSIM suggestions). The rest follows once trips and partners exist. Recommendations follow the same rules as everything else: our own products labelled as ours, and commission never decides what is shown.

## Revenue

- Affiliate commission on referred bookings (reported by each network, often weeks later and only for some partners).
- Direct eSIM sales, our own margin.
- Later, maybe: premium trip tools (alerts, shared trips). Not planned in detail; nothing gets paywalled in phases 1 to 4.

## Decisions

Reuben, 2026-11-17:

1. **Travel's own host:** `travel.example.com`, on the existing deployment, with its own marketing and cookies.
2. **First ten destinations:** Japan, USA, Spain, France, Italy, Greece, Portugal, Turkey, Thailand and UAE.

## Still open

- Who will run the insurance compliance review, and when. A later dependency for phase 5 only.
