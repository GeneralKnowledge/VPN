# Travel Hub plan

Status: plan only. Nothing here is built, and no affiliate programme has been applied to or contacted. Agreed direction from Reuben, 2026-11-17; names are provisional.

## In one paragraph

Travel Hub is a travel discovery experience that sits in front of our two products. People explore a destination, compare what can honestly be compared, and leave for established providers (airlines, hotels, car hire, parking) through tracked referral links. Our own eSIM is the first thing in Travel Hub that we sell and fulfil ourselves, and the VPN is offered where it fits. We take KAYAK's best ideas (destination pages, side-by-side options, saved trips) without becoming a travel agency: we never take a booking, hold a fare or handle a traveller's payment for a third party.

## Ground rules

1. **eSIM and VPN stay separate products.** Each keeps its own catalogue, checkout, Stripe objects, provider, webhooks, order tables and support flow ([MULTI-PRODUCT.md](./MULTI-PRODUCT.md)). Travel Hub never sells either one itself: it links into the product's own checkout. Travel Hub has no checkout and no billing of its own.
2. **The eSIM launch comes first.** Stripe test-mode orders, verified-payment provisioning and the eSIM tab in the iPhone app are a separate launch-critical stream. No Travel Hub phase may change eSIM checkout, webhooks or provisioning; where Travel Hub needs eSIM data it reads the public package list (`GET /api/esim/packages`).
3. **A link is not an offer.** Travel Hub shows a price only when a partner gave it to us in a live result, with the time it was fetched. A referral link ("Search Japan hotels on Partner X") never carries a price, a "from £" figure we made up, or a ranking that implies we compared it. No "price comparison" wording until we actually have live comparable results.
4. **Disclosure is visible, and commission never ranks results.** Every page with referral links says, near the links, that we may earn a commission. Sort orders are price, duration, rating or distance, never commission rate. Our own eSIM is labelled as ours.
5. **Insurance is a referral only, after review.** See [Insurance](#insurance).
6. **No new app slot.** The free Apple team allows 3 sideloaded apps and all 3 are used. Travel Hub goes into the existing iPhone app in `apps/ios` as tabs (see below), and into the existing Next.js app on the web.

### Shared shell, separate products

Confirmed by Reuben, 2026-11-17: one iPhone app shell (and one web deploy) is fine, and purchasing, subscriptions and infrastructure stay per product, because eSIM and VPN are each resold from a different supplier. So the app has Travel, eSIM and VPN areas, one sign-in, and independent back ends behind it. One account across products already works today (one `users` table, sessions per host).

## Where it lives in this repository

| Piece | Where | Why |
|---|---|---|
| Web Travel Hub | `apps/web`, served on a third product host (`PRODUCT_HOST_TRAVEL`, e.g. `travel.example.com`) through the existing host routing | Affiliate programmes judge us on a public website and its traffic; the web is where most referral clicks will happen |
| Partner adapters | new `packages/travel-partners`: a `TravelPartner` interface, a `MockTravelPartner`, then one adapter per network | Same pattern as `vpn-provider` and `esim-provider`; the app never builds a partner URL by hand |
| Destination content | new `packages/destinations`: curated country/city data (JSON in the repo, reviewed by a person) | Small, checkable, no scraping |
| Tables | `packages/db`: `travel_partners`, `outbound_links`, `partner_events`, `trips`, `trip_items` | `referrals` already exists (customer refer-a-friend), so partner tracking uses different names |
| iPhone | `apps/ios`: Explore, Trips, and a Connectivity area that is the eSIM tab already planned | Rust core owns trips and the API calls; SwiftUI presents (Forge rules) |

No new crate or package depends on the billing package. `travel-partners` depends on `config` only.

## Core concepts

These follow Reuben's list, with the live/link split made part of the types so the UI cannot blur it.

| Concept | What it holds | Notes |
|---|---|---|
| `TravelPartner` | id, display name, network (direct, Travelpayouts, Awin, ...), categories, markets, integration type (`link` or `live`), disclosure text, status (`draft`, `approved`, `paused`) | Seeded from config; a partner is `approved` only once its programme has accepted us and its terms were read |
| `TravelOffer` | partner, category, title, price and currency, `fetchedAt`, `expiresAt`, deep link | Only from a `live` adapter. Shown with "found at 14:05, the partner's price may change". Never cached past `expiresAt` |
| `ReferralLink` | partner, category, destination, campaign id, tracking parameters, attribution metadata (our sub-id, placement) | Built only by the adapter. Never shows a price |
| `Trip` | owner, destination, dates (optional), notes, items | Saved destinations and plans. Items point to an eSIM order, a saved `TravelOffer` snapshot, or a free-text booking the person typed in |
| `PartnerEvent` | `outbound_click` (ours), `conversion`/`commission` (from a network report, where offered) | Click records hold partner, placement, category, destination and an anonymous click id. No search text, no names, no trip contents |

Outbound clicks go through `/go/<linkId>` on our server, which records the click and redirects. That keeps every partner URL in one place, lets a partner be paused instantly, and gives one place for the disclosure and consent checks.

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
| Trip.com | Flights, hotels, trains, activities; advertises hotel data feeds and API | Programme approval; the feed is our best early chance of live results |
| Skyscanner | Flight, hotel, car search referrals | Reuben's research: a website with more than 5,000 unique monthly visitors for affiliate links, about 100,000 monthly active users for the Travel API. So: later, and nothing depends on its API |

Recommendation: start with **Travelpayouts** (widest coverage from one account) plus **Holiday Extras** (UK airport services), all as `link` partners. Look at Trip.com's feed as the first `live` adapter. Re-check every programme's criteria before applying; the numbers above are from Reuben's research and change.

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
| 1 | Travel host on the web, destination pages for ~10 countries from curated data, saved trips (web + API), Explore and Trips tabs in the iPhone app. Mock partner only | A signed-in person can open Japan, see our eSIM packages, save the trip on the web and see it on the phone | Which ~10 destinations first |
| 2 | `travel-partners` package, `/go/` redirect and click records, disclosure component, consent and policy page updates, first `link` partners (flights, hotels) | A real partner link works end to end in test, with a recorded click and visible disclosure | Programme sign-ups (he applies, or says go) |
| 3 | eSIM in journeys: trip-aware package suggestions, "connectivity" item on a trip, activation guidance; reads the eSIM product, changes nothing in its checkout | Starting from a trip, a person reaches eSIM checkout in one tap | eSIM launch stream finished first |
| 4 | Travel essentials: parking, transfers, car hire, activities as `link` partners | Two essentials categories live | Partner approvals |
| 5 | Insurance as a reviewed referral | Built to the reviewer's wording only | Compliance review result |
| 6 | Live comparison where a partner gives real inventory (`live` adapters), alerts, richer trip planning | Live results show their fetch time and source | Feed/API access |

Phase 1 can start alongside the eSIM stream because it touches neither payments nor provisioning. Phases 3 onward wait for the eSIM launch.

## Revenue

- Affiliate commission on referred bookings (reported by each network, often weeks later and only for some partners).
- Direct eSIM sales, our own margin.
- Later, maybe: premium trip tools (alerts, shared trips). Not planned in detail; nothing gets paywalled in phases 1 to 4.

## Open questions for Reuben

1. Should Travel Hub get its own web host and brand, or live on the eSIM host to start? (Recommended: its own host on the same deploy, so its marketing and cookies stay separate.)
2. Which destinations first? Suggested: Japan, USA, Spain, France, Italy, Greece, Portugal, Turkey, Thailand, UAE.
3. Who will run the insurance compliance review, and when?
