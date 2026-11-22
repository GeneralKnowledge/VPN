import { getDestination } from "@northstar/destinations";
import type { EsimPackage } from "@northstar/esim-provider";
import { esimPlansUrl, packagesForDestination } from "./travel";
import type { TripView } from "./trips";

/**
 * Travel Hub phase 3 (docs/TRAVEL-HUB.md): a saved trip's "Stay connected" item. It reads the eSIM
 * catalogue and links to the eSIM product's own checkout; it changes nothing in eSIM checkout,
 * payments or provisioning.
 */

/** How many days a package lasts, from the provider's wording ("15 days", "1 month", "30"). */
export function validityDays(validity: string): number | null {
  const match = /^\s*(\d{1,4})\s*(d|days?|w|weeks?|m|months?)?\s*$/i.exec(validity);
  if (!match) return null;
  const n = Number(match[1]);
  if (n <= 0) return null;
  const unit = (match[2] ?? "d").toLowerCase();
  if (unit.startsWith("w")) return n * 7;
  if (unit.startsWith("m")) return n * 30;
  return n;
}

/** Days away, counting both the first and the last day; null without both dates. */
export function tripDays(startDate: string | null, endDate: string | null): number | null {
  if (!startDate || !endDate) return null;
  const ms = Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round(ms / 86_400_000) + 1;
}

export type EsimSuggestion = {
  tripDays: number | null;
  /** The plan we'd pick for this trip, or null when there are no dates or no plans. */
  suggested: EsimPackage | null;
  /** True when the suggested plan lasts the whole trip. */
  covers: boolean;
  /** One plain sentence on why this plan, or what's missing. */
  note: string;
  /** Every other plan that works there, cheapest first. */
  others: EsimPackage[];
};

const byPrice = (a: EsimPackage, b: EsimPackage) => a.price - b.price || a.code.localeCompare(b.code);

/**
 * The plan to suggest for a trip of `days` to a country: the cheapest one that lasts the whole stay
 * (the country's own plan before a regional one at the same price). When none lasts that long, the
 * longest-lasting one, saying how much of the trip it covers. Commission plays no part: these are
 * our own plans, and the cheapest that fits wins.
 */
export function suggestEsim(packages: readonly EsimPackage[], days: number | null, countryCode: string): EsimSuggestion {
  const all = [...packages].sort(byPrice);
  if (all.length === 0) {
    return { tripDays: days, suggested: null, covers: false, note: "We don't have an eSIM plan for this destination yet.", others: [] };
  }
  if (days === null) {
    return {
      tripDays: null,
      suggested: null,
      covers: false,
      note: "Add the trip's dates and we'll suggest a plan that lasts the whole stay.",
      others: all,
    };
  }
  const dated = all
    .map((pkg) => ({ pkg, days: validityDays(pkg.validity) }))
    .filter((x): x is { pkg: EsimPackage; days: number } => x.days !== null);
  const own = (p: EsimPackage) => (p.countryCode === countryCode ? 0 : 1);
  const covering = dated
    .filter((x) => x.days >= days)
    .sort((a, b) => a.pkg.price - b.pkg.price || own(a.pkg) - own(b.pkg) || a.days - b.days);
  const span = `${days}-day trip`;
  if (covering[0]) {
    const pick = covering[0];
    return {
      tripDays: days,
      suggested: pick.pkg,
      covers: true,
      note: `The cheapest plan that lasts your whole ${span} (it's valid for ${pick.days} days).`,
      others: all.filter((p) => p.code !== pick.pkg.code),
    };
  }
  const longest = [...dated].sort((a, b) => b.days - a.days || a.pkg.price - b.pkg.price)[0];
  if (!longest) {
    return { tripDays: days, suggested: null, covers: false, note: "Pick a plan below; check how long each one lasts.", others: all };
  }
  return {
    tripDays: days,
    suggested: longest.pkg,
    covers: false,
    note: `No single plan lasts your whole ${span}. This one lasts ${longest.days} days, so you'd need a second plan for the rest.`,
    others: all.filter((p) => p.code !== longest.pkg.code),
  };
}

/** Setting up a travel eSIM on an iPhone, in the order you'd do it. General guidance, not the provider's. */
export const ESIM_SETUP_STEPS: readonly string[] = [
  "Check your phone is unlocked and supports eSIM.",
  "Install the eSIM before you leave, on Wi-Fi, from the QR code or install link in your order.",
  "Keep the new line switched off until you land, then turn it on and turn on data roaming for that line only.",
  "Leave data roaming off on your home SIM so it doesn't charge you abroad.",
];

export type TripConnectivity = EsimSuggestion & {
  /** False when the eSIM catalogue couldn't be loaded just now. */
  available: boolean;
  /** The eSIM site's plans page for this country; checkout happens there. */
  plansUrl: string;
  steps: readonly string[];
};

export async function tripConnectivity(trip: TripView, esimBase: string): Promise<TripConnectivity> {
  const destination = getDestination(trip.destination.slug);
  const countryCode = destination?.countryCode ?? trip.destination.countryCode;
  const plansUrl = esimPlansUrl(esimBase, countryCode);
  if (!destination) {
    return {
      ...suggestEsim([], null, countryCode),
      available: true,
      plansUrl,
      steps: ESIM_SETUP_STEPS,
    };
  }
  const esim = await packagesForDestination(destination);
  if (!esim.ok) {
    return {
      tripDays: tripDays(trip.startDate, trip.endDate),
      suggested: null,
      covers: false,
      note: "We couldn't load eSIM plans just now. Try again in a minute.",
      others: [],
      available: false,
      plansUrl,
      steps: ESIM_SETUP_STEPS,
    };
  }
  const suggestion = suggestEsim(esim.packages, tripDays(trip.startDate, trip.endDate), countryCode);
  return {
    ...suggestion,
    available: true,
    // The suggested plan's own country or region, so a regional plan (EU) is listed on the page.
    plansUrl: suggestion.suggested ? esimPlansUrl(esimBase, suggestion.suggested.countryCode) : plansUrl,
    steps: ESIM_SETUP_STEPS,
  };
}
