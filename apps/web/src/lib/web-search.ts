import {
  addDays,
  carQuerySchema,
  estimateCars,
  estimateFlights,
  estimatePackages,
  estimateStays,
  EstimateError,
  flightQuerySchema,
  getAirport,
  packageQuerySchema,
  planRandomTrip,
  randomTripQuerySchema,
  stayQuerySchema,
  todayInUk,
  type CarOption,
  type FlightOption,
  type PackageOption,
  type RandomTrip,
  type StayOption,
} from "@northstar/travel-search";
import type { z } from "zod";

/**
 * The Travel site's search page (docs/TRAVEL-HUB.md, phase 1b on the web): the same estimate model
 * and query strings as the app's `/api/travel/search/*`, run on the server for a plain GET form.
 * Every figure is our estimate; nothing here is a partner's price or can be booked.
 */

export const searchTypes = ["flights", "stays", "cars", "packages", "surprise"] as const;
export type SearchType = (typeof searchTypes)[number];

export const SEARCH_TAB_LABELS: Record<SearchType, string> = {
  flights: "Flights",
  stays: "Stays",
  cars: "Cars",
  packages: "Flight + hotel",
  surprise: "Surprise me",
};

export function searchType(value: string | undefined): SearchType {
  return (searchTypes as readonly string[]).includes(value ?? "") ? (value as SearchType) : "flights";
}

export type Params = Record<string, string | undefined>;

export type WebSearchResult =
  | { kind: "empty" }
  | { kind: "error"; message: string }
  | { kind: "flights"; options: FlightOption[] }
  | { kind: "stays"; options: StayOption[] }
  | { kind: "cars"; options: CarOption[] }
  | { kind: "packages"; flight: FlightOption; options: PackageOption[] }
  | { kind: "surprise"; trip: RandomTrip };

/** The fields a search needs before it runs; until they're all there, the page shows only the form. */
const REQUIRED: Record<SearchType, string[]> = {
  flights: ["from", "to", "depart"],
  stays: ["city", "checkIn", "checkOut"],
  cars: ["city", "pickUp", "dropOff"],
  packages: ["from", "to", "depart", "return"],
  surprise: ["from", "seed"],
};

/** Form defaults: a month ahead, for a week. */
export function defaultDates(today: string = todayInUk()): { start: string; end: string } {
  const start = addDays(today, 30);
  return { start, end: addDays(start, 7) };
}

function parse<S extends z.ZodTypeAny>(schema: S, params: Params): z.output<S> | string {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ""));
  const parsed = schema.safeParse(clean);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  return issue ? `${issue.path.join(".")}: ${issue.message}` : "invalid search";
}

function sentence(text: string): string {
  const t = text.trim();
  return `${t.charAt(0).toUpperCase()}${t.slice(1)}${/[.!?]$/.test(t) ? "" : "."}`;
}

export function runWebSearch(type: SearchType, params: Params, today: string = todayInUk()): WebSearchResult {
  if (REQUIRED[type].some((key) => !params[key])) return { kind: "empty" };
  try {
    switch (type) {
      case "flights": {
        const q = parse(flightQuerySchema, params);
        if (typeof q === "string") return { kind: "error", message: sentence(q) };
        return {
          kind: "flights",
          options: estimateFlights(
            { from: q.from, to: q.to, depart: q.depart, returnDate: q.return ?? null, adults: q.adults, cabin: q.cabin, sort: q.sort },
            today,
          ),
        };
      }
      case "stays": {
        const q = parse(stayQuerySchema, params);
        if (typeof q === "string") return { kind: "error", message: sentence(q) };
        return { kind: "stays", options: estimateStays(q, today) };
      }
      case "cars": {
        const q = parse(carQuerySchema, params);
        if (typeof q === "string") return { kind: "error", message: sentence(q) };
        return { kind: "cars", options: estimateCars({ city: q.city, pickUpDate: q.pickUp, dropOffDate: q.dropOff }, today) };
      }
      case "packages": {
        const q = parse(packageQuerySchema, params);
        if (typeof q === "string") return { kind: "error", message: sentence(q) };
        const result = estimatePackages({ from: q.from, to: q.to, depart: q.depart, returnDate: q.return, adults: q.adults }, today);
        return { kind: "packages", ...result };
      }
      case "surprise": {
        const q = parse(randomTripQuerySchema, params);
        if (typeof q === "string") return { kind: "error", message: sentence(q) };
        const trip = planRandomTrip(
          {
            criteria: {
              from: q.from,
              region: q.region ?? null,
              month: q.month ?? null,
              budgetPerPersonMinor: q.budget === undefined ? null : q.budget * 100,
              nights: q.nights,
              adults: q.adults,
            },
            seed: q.seed,
            rolls: { where: q.rollWhere, when: q.rollWhen, flight: q.rollFlight, stay: q.rollStay },
            locks: { where: q.lockWhere, when: q.lockWhen, flight: q.lockFlight, stay: q.lockStay },
          },
          today,
        );
        return { kind: "surprise", trip };
      }
    }
  } catch (err) {
    if (err instanceof EstimateError) return { kind: "error", message: sentence(err.message) };
    throw err;
  }
}

/** "2h 05m". */
export function duration(minutes: number): string {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

/** "Edinburgh (EDI)", or the code alone if it isn't one of ours. */
export function place(code: string): string {
  const airport = getAirport(code);
  return airport ? `${airport.city} (${code})` : code;
}

/** This page's URL with some parameters changed; empty values drop out. */
export function searchHref(params: Params, changes: Params): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...changes })) {
    if (v !== undefined && v !== "") next.set(k, v);
  }
  return `/search?${next.toString()}`;
}
