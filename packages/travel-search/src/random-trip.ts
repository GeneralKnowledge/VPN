/**
 * The random trip planner (docs/TRAVEL-HUB.md, phase 1c): pick a whole trip from a few optional
 * criteria, on the same simulated estimates as the searches. Stateless and deterministic: the
 * same request (criteria, seed, re-roll counters, locks) always gives the same trip.
 */
import { destinationAirports, getAirport, type Airport } from "./airports";
import {
  EstimateError,
  MAX_DAYS_AHEAD,
  addDays,
  dayValue,
  daysBetween,
  estimateFlights,
  estimateStays,
  unit,
  type FlightOption,
  type StayKind,
  type StayOption,
} from "./estimate";

export const regions = ["europe", "asia", "americas", "middle-east"] as const;
export type Region = (typeof regions)[number];

const REGION_OF: Record<string, Region> = {
  ES: "europe",
  FR: "europe",
  IT: "europe",
  GR: "europe",
  PT: "europe",
  TR: "europe",
  JP: "asia",
  TH: "asia",
  US: "americas",
  AE: "middle-east",
};

export function regionOf(countryCode: string): Region | null {
  return REGION_OF[countryCode] ?? null;
}

export const MIN_TRIP_NIGHTS = 2;
export const MAX_TRIP_NIGHTS = 14;
/** How many departure dates are tried per destination before moving on. */
const DATES_PER_DESTINATION = 4;
/** Cheaper dates are offered only when they save at least this much per person (minor units). */
export const MIN_DATE_SAVING_MINOR = 10_00;
/** Departures at least this many days ahead, so a random trip is never next week by accident. */
const MIN_DAYS_AHEAD = 7;

export interface RandomTripCriteria {
  /** UK departure airport. */
  from: string;
  region: Region | null;
  /** `YYYY-MM`, or any of the next twelve months. */
  month: string | null;
  /** For flights and the stay together, per person, in minor units. */
  budgetPerPersonMinor: number | null;
  nights: number;
  adults: number;
}

/** Re-roll counters, one per section. Changing one changes only that section where it can. */
export interface RandomTripRolls {
  where: number;
  when: number;
  flight: number;
  stay: number;
}

/** Sections the person kept. A flight lock only applies with `where` and `when` locked too. */
export interface RandomTripLocks {
  /** Destination airport code. */
  where?: string;
  /** Departure date. */
  when?: string;
  /** Flight option id, for the locked route and dates. */
  flight?: string;
  /** `kind|area`, see stayKey. */
  stay?: string;
}

export interface RandomTripRequest {
  criteria: RandomTripCriteria;
  /** Any string the app picks once per "Surprise me"; the same seed gives the same trip. */
  seed: string;
  rolls: RandomTripRolls;
  locks: RandomTripLocks;
}

export type UpgradeKind = "nicer-stay" | "quicker-flight" | "cheaper-dates";

export interface TripUpgrade {
  kind: UpgradeKind;
  /** "4-star hotel", "Nonstop, 2h 10m quicker", "Leave 2026-12-15". */
  title: string;
  /** Positive costs more, negative saves, per person. */
  deltaPerPersonMinor: number;
  /** Apply these locks to take the upgrade. */
  locks: RandomTripLocks;
}

export interface RandomTrip {
  destination: Pick<Airport, "code" | "city" | "countryCode" | "destinationSlug">;
  depart: string;
  returnDate: string;
  nights: number;
  adults: number;
  flight: FlightOption;
  stay: StayOption;
  perPersonMinor: number;
  totalMinor: number;
  /** How far over the budget the trip is (only when a lock or upgrade forced it), else 0. */
  overBudgetByMinor: number;
  /** The trip's current values, for the app to lock any section. */
  current: Required<RandomTripLocks>;
  upgrades: TripUpgrade[];
}

export function stayKey(stay: Pick<StayOption, "kind" | "area">): string {
  return `${stay.kind}|${stay.area}`;
}

const STAY_ORDER: StayKind[] = ["hostel", "guesthouse", "apartment", "hotel3", "hotel4", "hotel5"];

/** Stays are priced per room; share them, rounding up to whole pounds. */
function stayShare(stay: StayOption, adults: number): number {
  return Math.ceil(stay.totalMinor / adults / 100) * 100;
}

function perPerson(flight: FlightOption, stay: StayOption, adults: number): number {
  return flight.pricePerPersonMinor + stayShare(stay, adults);
}

/**
 * A number in [0, 1) for a key. FNV-1a moves little when only the last character changes (as a
 * re-roll counter does), so a fixed tail is hashed after the key to spread that change.
 */
function chance(key: string): number {
  return unit(`${key}|spread the last change`);
}

function shuffled<T>(items: readonly T[], key: (item: T) => string): T[] {
  return [...items]
    .map((item) => ({ item, order: chance(key(item)) }))
    .sort((a, b) => a.order - b.order)
    .map((x) => x.item);
}

function pick<T>(items: readonly T[], key: string): T {
  return items[Math.floor(chance(key) * items.length)]!;
}

function checkCriteria(c: RandomTripCriteria, today: string): void {
  const from = getAirport(c.from);
  if (!from || !from.roles.includes("origin")) throw new EstimateError("random trips leave from a UK airport");
  if (!Number.isInteger(c.nights) || c.nights < MIN_TRIP_NIGHTS || c.nights > MAX_TRIP_NIGHTS) {
    throw new EstimateError(`trips are ${MIN_TRIP_NIGHTS} to ${MAX_TRIP_NIGHTS} nights`);
  }
  if (!Number.isInteger(c.adults) || c.adults < 1 || c.adults > 9) {
    throw new EstimateError("travellers must be between 1 and 9");
  }
  if (c.budgetPerPersonMinor !== null && (!Number.isInteger(c.budgetPerPersonMinor) || c.budgetPerPersonMinor < 1)) {
    throw new EstimateError("the budget must be a whole amount above zero");
  }
  if (c.month !== null) {
    if (Number.isNaN(dayValue(`${c.month}-01`))) throw new EstimateError("the month isn't a month");
    if (departureDates(c, today).length === 0) {
      throw new EstimateError("that month is in the past or more than a year away");
    }
  }
}

/** Every departure date the criteria allow, in date order. */
function departureDates(c: RandomTripCriteria, today: string): string[] {
  const first = c.month !== null ? `${c.month}-01` : addDays(today, MIN_DAYS_AHEAD);
  const dates: string[] = [];
  for (let i = 0; i < 366; i++) {
    const d = addDays(first, i);
    if (c.month !== null && !d.startsWith(c.month)) break;
    const ahead = daysBetween(today, d);
    if (ahead < MIN_DAYS_AHEAD) continue;
    if (ahead + c.nights > MAX_DAYS_AHEAD) break;
    dates.push(d);
  }
  return dates;
}

type Candidate = { airport: Airport; depart: string; returnDate: string; flights: FlightOption[]; stays: StayOption[] };

function candidate(c: RandomTripCriteria, airport: Airport, depart: string, today: string): Candidate | null {
  const returnDate = addDays(depart, c.nights);
  try {
    const flights = estimateFlights(
      { from: c.from, to: airport.code, depart, returnDate, adults: c.adults, cabin: "economy", sort: "cheapest" },
      today,
    );
    const stays = estimateStays(
      { city: airport.code, checkIn: depart, checkOut: returnDate, guests: c.adults, sort: "cheapest" },
      today,
    );
    return { airport, depart, returnDate, flights, stays };
  } catch (err) {
    if (err instanceof EstimateError) return null;
    throw err;
  }
}

function pounds(minor: number): string {
  return `£${Math.round(minor / 100).toLocaleString("en-GB")}`;
}

/** Pick a whole trip. Throws EstimateError with a readable reason when nothing fits. */
export function planRandomTrip(request: RandomTripRequest, today: string): RandomTrip {
  const { criteria: c, seed, rolls, locks } = request;
  checkCriteria(c, today);

  let destinations: Airport[];
  if (locks.where) {
    const locked = getAirport(locks.where);
    if (!locked || !locked.roles.includes("destination")) throw new EstimateError("that destination isn't one of ours");
    destinations = [locked];
  } else {
    const pool = destinationAirports().filter((a) => c.region === null || regionOf(a.countryCode) === c.region);
    destinations = shuffled(pool, (a) => `${seed}:where:${rolls.where}:${a.code}`);
  }

  let dates: string[];
  if (locks.when) {
    if (Number.isNaN(dayValue(locks.when))) throw new EstimateError("the departure date isn't a date");
    dates = [locks.when];
  } else {
    dates = shuffled(departureDates(c, today), (d) => `${seed}:when:${rolls.when}:${d}`).slice(0, DATES_PER_DESTINATION);
  }

  // A flight id only means something on one route and date.
  const flightLock = locks.flight && locks.where && locks.when ? locks.flight : undefined;
  const budget = c.budgetPerPersonMinor;
  let cheapest: number | null = null;

  for (const airport of destinations) {
    for (const depart of dates) {
      const found = candidate(c, airport, depart, today);
      if (!found) continue;
      const flights = flightLock ? found.flights.filter((f) => f.id === flightLock) : found.flights;
      const stays = locks.stay ? found.stays.filter((s) => stayKey(s) === locks.stay) : found.stays;
      if (flights.length === 0 || stays.length === 0) continue;

      const cheapestStay = Math.min(...stays.map((s) => stayShare(s, c.adults)));
      for (const f of flights) {
        const cost = f.pricePerPersonMinor + cheapestStay;
        cheapest = cheapest === null ? cost : Math.min(cheapest, cost);
      }

      // Everything is locked: show it even when it's over the budget, and say by how much.
      const forced = Boolean(flightLock && locks.stay);
      const affordableFlights =
        budget === null || forced ? flights : flights.filter((f) => f.pricePerPersonMinor + cheapestStay <= budget);
      if (affordableFlights.length === 0) continue;
      const slot = `${seed}:${airport.code}:${depart}`;
      const flight = pick(
        [...affordableFlights].sort((a, b) => a.id.localeCompare(b.id)),
        `${slot}:flight:${rolls.flight}`,
      );
      const affordableStays =
        budget === null || forced ? stays : stays.filter((s) => perPerson(flight, s, c.adults) <= budget);
      const stay = pick(affordableStays.length > 0 ? affordableStays : stays, `${slot}:stay:${rolls.stay}`);

      return finish(c, found, flight, stay, today);
    }
  }

  if (budget !== null && cheapest !== null) {
    throw new EstimateError(
      `nothing fits ${pounds(budget)} per person; the cheapest trip we found for these choices is about ${pounds(cheapest)} per person est.`,
    );
  }
  throw new EstimateError("we couldn't put a trip together for these choices; try another month or region");
}

function finish(c: RandomTripCriteria, found: Candidate, flight: FlightOption, stay: StayOption, today: string): RandomTrip {
  const cost = perPerson(flight, stay, c.adults);
  const current = {
    where: found.airport.code,
    when: found.depart,
    flight: flight.id,
    stay: stayKey(stay),
  };
  return {
    destination: {
      code: found.airport.code,
      city: found.airport.city,
      countryCode: found.airport.countryCode,
      destinationSlug: found.airport.destinationSlug,
    },
    depart: found.depart,
    returnDate: found.returnDate,
    nights: c.nights,
    adults: c.adults,
    flight,
    stay,
    perPersonMinor: cost,
    totalMinor: flight.totalMinor + stay.totalMinor,
    overBudgetByMinor: c.budgetPerPersonMinor === null ? 0 : Math.max(0, cost - c.budgetPerPersonMinor),
    current,
    upgrades: upgrades(c, found, flight, stay, cost, today),
  };
}

function totalMinutes(f: FlightOption): number {
  return f.outbound.durationMinutes + (f.inbound?.durationMinutes ?? 0);
}

function hoursAndMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

function upgrades(
  c: RandomTripCriteria,
  found: Candidate,
  flight: FlightOption,
  stay: StayOption,
  cost: number,
  today: string,
): TripUpgrade[] {
  const out: TripUpgrade[] = [];
  const base = { where: found.airport.code, when: found.depart };

  // A nicer stay: the next kind up, in the same area where there is one.
  const nextKind = STAY_ORDER[STAY_ORDER.indexOf(stay.kind) + 1];
  if (nextKind) {
    const nicer =
      found.stays.find((s) => s.kind === nextKind && s.area === stay.area) ?? found.stays.find((s) => s.kind === nextKind);
    if (nicer) {
      out.push({
        kind: "nicer-stay",
        title: nicer.area === stay.area ? nicer.label : `${nicer.label}, ${nicer.area.toLowerCase()}`,
        deltaPerPersonMinor: perPerson(flight, nicer, c.adults) - cost,
        locks: { ...base, flight: flight.id, stay: stayKey(nicer) },
      });
    }
  }

  // A quicker flight, if this isn't the quickest.
  const quickest = [...found.flights].sort((a, b) => totalMinutes(a) - totalMinutes(b) || a.pricePerPersonMinor - b.pricePerPersonMinor)[0]!;
  const saved = totalMinutes(flight) - totalMinutes(quickest);
  if (saved > 0) {
    const nonstop = quickest.outbound.via.length === 0 && flight.outbound.via.length > 0;
    out.push({
      kind: "quicker-flight",
      title: `${nonstop ? "Nonstop, " : ""}${hoursAndMinutes(saved)} quicker there and back`,
      deltaPerPersonMinor: quickest.pricePerPersonMinor - flight.pricePerPersonMinor,
      locks: { ...base, flight: quickest.id, stay: stayKey(stay) },
    });
  }

  // Cheaper dates: up to a week either way, the same stay, the cheapest flight that day.
  let best: { depart: string; flight: FlightOption; cost: number } | null = null;
  for (let shift = -7; shift <= 7; shift++) {
    if (shift === 0) continue;
    const depart = addDays(found.depart, shift);
    const ahead = daysBetween(today, depart);
    if (ahead < MIN_DAYS_AHEAD || ahead + c.nights > MAX_DAYS_AHEAD) continue;
    const other = candidate(c, found.airport, depart, today);
    if (!other) continue;
    const sameStay = other.stays.find((s) => stayKey(s) === stayKey(stay));
    const cheapestFlight = [...other.flights].sort((a, b) => a.pricePerPersonMinor - b.pricePerPersonMinor)[0];
    if (!sameStay || !cheapestFlight) continue;
    const otherCost = perPerson(cheapestFlight, sameStay, c.adults);
    if (!best || otherCost < best.cost) best = { depart, flight: cheapestFlight, cost: otherCost };
  }
  if (best && cost - best.cost >= MIN_DATE_SAVING_MINOR) {
    out.push({
      kind: "cheaper-dates",
      title: `Leave ${best.depart}, back ${addDays(best.depart, c.nights)}`,
      deltaPerPersonMinor: best.cost - cost,
      locks: { where: found.airport.code, when: best.depart, flight: best.flight.id, stay: stayKey(stay) },
    });
  }
  return out;
}
