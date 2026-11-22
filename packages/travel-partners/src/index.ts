import { createHash } from "node:crypto";
import { MockTravelPartner } from "./mock";
import {
  partnerCategories,
  type LinkRequest,
  type PartnerAdapter,
  type PartnerCategory,
  type TravelPartner,
} from "./types";

export * from "./types";
export { MOCK_PARTNER, MockTravelPartner } from "./mock";

/** Shown near every group of partner links (TRAVEL-HUB.md rule 4). */
export const COMMISSION_NOTICE =
  "We may earn a commission if you book through these links. It doesn't change the price you pay, and it never decides which partners we show or their order.";

/** Partner ids the code knows how to build. Real networks are added here as programmes accept us. */
export const knownPartnerIds = ["mock"] as const;
export type KnownPartnerId = (typeof knownPartnerIds)[number];

/** The adapters for the ids switched on in config (`TRAVEL_PARTNERS`), in a stable order. */
export function createPartnerAdapters(ids: readonly string[], options: { travelBaseUrl: string }): PartnerAdapter[] {
  const adapters: PartnerAdapter[] = [];
  for (const id of knownPartnerIds) {
    if (!ids.includes(id)) continue;
    if (id === "mock") adapters.push(new MockTravelPartner(options.travelBaseUrl));
  }
  return adapters;
}

/** Whether a partner may be shown for a category in a country. */
export function partnerServes(partner: TravelPartner, category: PartnerCategory, countryCode: string): boolean {
  if (partner.status !== "approved") return false;
  if (!partner.categories.includes(category)) return false;
  return partner.markets === "*" || partner.markets.includes(countryCode);
}

/**
 * The partners to offer for a category, alphabetical by name. Alphabetical on purpose: the order
 * must not depend on commission, and we have no live results to sort by price yet.
 */
export function partnersFor(
  adapters: readonly PartnerAdapter[],
  category: PartnerCategory,
  countryCode: string,
): PartnerAdapter[] {
  return adapters
    .filter((a) => partnerServes(a.partner, category, countryCode))
    .sort((a, b) => a.partner.displayName.localeCompare(b.partner.displayName));
}

/**
 * A stable id for a link: the same partner, category, destination and placement always give the
 * same id, so pages don't create a new row on every view. It's a hash of public facts only.
 */
export function linkId(partnerId: string, request: LinkRequest): string {
  const key = [partnerId, request.category, request.destination.slug, request.placement].join("|");
  return `lnk_${createHash("sha256").update(key).digest("hex").slice(0, 24)}`;
}

const CATEGORY_LABELS: Record<PartnerCategory, string> = {
  flights: "Flights",
  stays: "Places to stay",
  cars: "Car hire",
  transfers: "Transfers",
  parking: "Airport parking",
  activities: "Things to do",
};

export function categoryLabel(category: PartnerCategory): string {
  return CATEGORY_LABELS[category];
}

/** "Search flights to Japan on Test Partner": what the link does, never a price. */
export function linkLabel(partner: TravelPartner, request: LinkRequest): string {
  const name = request.destination.name;
  const what: Record<PartnerCategory, string> = {
    flights: `Search flights to ${name}`,
    stays: `Search places to stay in ${name}`,
    cars: `Search car hire in ${name}`,
    transfers: `Search transfers in ${name}`,
    parking: `Search UK airport parking`,
    activities: `Search things to do in ${name}`,
  };
  return `${what[request.category]} on ${partner.displayName}`;
}

export function isPartnerCategory(value: string): value is PartnerCategory {
  return (partnerCategories as readonly string[]).includes(value);
}
