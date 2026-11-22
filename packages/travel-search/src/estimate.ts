/**
 * The estimate model (docs/TRAVEL-HUB.md, phase 1b). Every figure here is our own simulation,
 * not a price from an airline, hotel or rental company. It is deterministic: the same search
 * gives the same answer, so results don't jump about between refreshes and tests are exact.
 *
 * Money is GBP in pence. Dates are `YYYY-MM-DD`; times are local `HH:MM`.
 */
import { distanceKm, getAirport, airports, destinationAirports, type Airport } from "./airports";

export type Cabin = "economy" | "premium" | "business" | "first";
export type FlightSort = "best" | "cheapest" | "fastest";
export type FlightTag = "best" | "cheapest" | "fastest";

export interface Leg {
  from: string;
  to: string;
  /** Local time at `from`. */
  departs: string;
  /** Local time at `to`. */
  arrives: string;
  /** Days after departure (by local dates) that it arrives: 0, 1 or occasionally -1. */
  arrivesDayOffset: number;
  durationMinutes: number;
  /** Stop-over airport codes; empty for nonstop. */
  via: string[];
}

export interface FlightOption {
  id: string;
  outbound: Leg;
  inbound: Leg | null;
  pricePerPersonMinor: number;
  totalMinor: number;
  tags: FlightTag[];
}

export interface FlightQuery {
  from: string;
  to: string;
  depart: string;
  returnDate: string | null;
  adults: number;
  cabin: Cabin;
  sort: FlightSort;
}

export type StayKind = "hostel" | "guesthouse" | "apartment" | "hotel3" | "hotel4" | "hotel5";
export type StaySort = "cheapest" | "comfort";

export interface StayOption {
  id: string;
  kind: StayKind;
  /** "4-star hotel". */
  label: string;
  /** "City centre". */
  area: string;
  city: string;
  nightlyMinor: number;
  nights: number;
  rooms: number;
  totalMinor: number;
}

export interface StayQuery {
  /** The destination airport whose city to stay in. */
  city: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  sort: StaySort;
}

export type CarClass = "small" | "medium" | "estate" | "suv" | "people-carrier";

export interface CarOption {
  id: string;
  carClass: CarClass;
  /** "Medium car". */
  label: string;
  seats: number;
  bags: number;
  automatic: boolean;
  dailyMinor: number;
  days: number;
  totalMinor: number;
  /** Where it's collected: the destination airport. */
  pickUp: string;
}

export interface CarQuery {
  city: string;
  pickUpDate: string;
  dropOffDate: string;
}

export interface PackageOption {
  id: string;
  stay: StayOption;
  totalMinor: number;
}

export interface PackageQuery {
  from: string;
  to: string;
  depart: string;
  returnDate: string;
  adults: number;
}

export interface PricePin {
  code: string;
  city: string;
  countryCode: string;
  destinationSlug: string;
  lat: number;
  lon: number;
  /** Cheapest estimated economy return per person in the month. */
  pricePerPersonMinor: number;
}

/** A search that can't be estimated, with a message a customer can read. */
export class EstimateError extends Error {}

// ---------------------------------------------------------------------------
// Shared pieces

/** A number in [0, 1) from a string: FNV-1a, so the same input always gives the same value. */
export function unit(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 0x100000000;
}

function between(key: string, low: number, high: number): number {
  return low + unit(key) * (high - low);
}

const DAY_MS = 86_400_000;

/** Milliseconds since the epoch for a `YYYY-MM-DD` date, or NaN. */
export function dayValue(iso: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return NaN;
  const value = Date.parse(`${iso}T00:00:00Z`);
  // Date.parse rolls 2027-02-30 over to March; refuse that.
  return Number.isNaN(value) || new Date(value).toISOString().slice(0, 10) !== iso ? NaN : value;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((dayValue(to) - dayValue(from)) / DAY_MS);
}

export function addDays(iso: string, days: number): string {
  return new Date(dayValue(iso) + days * DAY_MS).toISOString().slice(0, 10);
}

function month(iso: string): number {
  return Number(iso.slice(5, 7));
}

/** Busier, dearer months: school holidays and Christmas. */
const SEASON = [0.85, 0.85, 0.95, 1.05, 1.05, 1.15, 1.3, 1.3, 1.0, 0.95, 0.85, 1.15];

function season(iso: string): number {
  return SEASON[month(iso) - 1] ?? 1;
}

/** Fares rise as the date gets close. */
function notice(today: string, date: string): number {
  const ahead = daysBetween(today, date);
  if (ahead < 7) return 1.6;
  if (ahead < 21) return 1.3;
  if (ahead < 45) return 1.1;
  return 1;
}

/** Fridays and Sundays cost a little more. */
function weekday(iso: string): number {
  const day = new Date(dayValue(iso)).getUTCDay();
  return day === 5 || day === 0 ? 1.08 : 1;
}

function pounds(value: number): number {
  return Math.max(1, Math.round(value)) * 100;
}

/** The longest a search may look ahead. */
export const MAX_DAYS_AHEAD = 365;

function checkDate(today: string, date: string, what: string): void {
  if (Number.isNaN(dayValue(date))) throw new EstimateError(`${what} isn't a date`);
  const ahead = daysBetween(today, date);
  if (ahead < 0) throw new EstimateError(`${what} is in the past`);
  if (ahead > MAX_DAYS_AHEAD) throw new EstimateError(`${what} is more than a year away`);
}

function airport(code: string): Airport {
  const found = getAirport(code);
  if (!found) throw new EstimateError(`${code} isn't an airport we know`);
  return found;
}

function destinationCity(code: string): Airport {
  const found = airport(code);
  if (!found.destinationSlug) throw new EstimateError(`${found.city} isn't one of our destinations`);
  return found;
}

// ---------------------------------------------------------------------------
// Flights

/** Origins with long-haul nonstop flights. */
const LONG_HAUL_ORIGINS = new Set(["LHR", "LGW", "MAN"]);
/** Destinations that get long-haul nonstop flights from the UK. */
const LONG_HAUL_NONSTOP = new Set(["HND", "JFK", "MCO", "LAX", "SFO", "BKK", "DXB", "AUH"]);
/** Below this, any UK airport may plausibly fly nonstop. */
const SHORT_HAUL_KM = 3800;

const CABIN: Record<Cabin, number> = { economy: 1, premium: 1.8, business: 3.6, first: 6.5 };

/** Departure times the model picks from. */
const SLOTS = [
  "06:05", "07:20", "08:45", "10:10", "11:35", "13:00", "14:25", "15:50", "17:15", "18:40", "20:05", "21:30",
];

function nonstopPossible(a: Airport, b: Airport): boolean {
  if (distanceKm(a, b) < SHORT_HAUL_KM) return true;
  const [uk, away] = a.countryCode === "GB" ? [a, b] : [b, a];
  return LONG_HAUL_ORIGINS.has(uk.code) && LONG_HAUL_NONSTOP.has(away.code);
}

/** One-way economy fare in pounds by distance, before the other factors. */
function baseFare(km: number): number {
  if (km < 2000) return 18 + 0.045 * km;
  if (km < 5000) return 50 + 0.05 * km;
  return 120 + 0.055 * km;
}

/** Flying time for one leg: cruising speed plus taxi, climb and descent, to 5 minutes. */
function legMinutes(a: Airport, b: Airport): number {
  return Math.round(((distanceKm(a, b) / 800) * 60 + 35) / 5) * 5;
}

/** Stop-over hubs that don't take the trip far out of its way, best first. */
function hubsFor(a: Airport, b: Airport): Airport[] {
  const direct = distanceKm(a, b);
  const limit = direct < 2000 ? 1.45 : 1.25;
  const scored = airports
    .filter((h) => h.roles.includes("hub") && h.code !== a.code && h.code !== b.code)
    .filter((h) => distanceKm(h, a) > 150 && distanceKm(h, b) > 150)
    .map((h) => ({ hub: h, detour: (distanceKm(a, h) + distanceKm(h, b)) / direct }))
    .sort((x, y) => x.detour - y.detour);
  const near = scored.filter((s) => s.detour <= limit).slice(0, 3);
  return (near.length > 0 ? near : scored.slice(0, 1)).map((s) => s.hub);
}

function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function clock(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * `spread` moves options on the same routing apart, so they don't all leave at the same time.
 * `earliest` (local minutes after midnight) moves the departure to the first slot at or after it,
 * for a return on the day the outbound lands.
 */
function makeLeg(a: Airport, b: Airport, via: Airport | null, key: string, spread: number, earliest = 0): Leg {
  const slot = Math.floor(unit(`${key}:time`) * SLOTS.length) + spread * 4;
  const picked = SLOTS[slot % SLOTS.length] ?? "10:10";
  const departs = minutesOf(picked) >= earliest ? picked : (SLOTS.find((s) => minutesOf(s) >= earliest) ?? picked);
  const [h, m] = departs.split(":").map(Number);
  const start = (h ?? 0) * 60 + (m ?? 0);
  const duration = via
    ? legMinutes(a, via) + Math.round(between(`${key}:layover`, 75, 300) / 5) * 5 + legMinutes(via, b)
    : legMinutes(a, b);
  const arrival = start + duration + (b.utcOffset - a.utcOffset) * 60;
  return {
    from: a.code,
    to: b.code,
    departs,
    arrives: clock(arrival),
    arrivesDayOffset: Math.floor(arrival / 1440),
    durationMinutes: duration,
    via: via ? [via.code] : [],
  };
}

function legFare(a: Airport, b: Airport, via: Airport | null, date: string, today: string, cabin: Cabin, key: string): number {
  const km = distanceKm(a, b);
  const stops = via ? (km < 2000 ? 1.15 : 0.85) : 1;
  return (
    baseFare(km) * season(date) * notice(today, date) * weekday(date) * CABIN[cabin] * stops * between(`${key}:fare`, 0.88, 1.18)
  );
}

/** The "best" mix: price and duration relative to the cheapest and quickest. */
export const BEST_DURATION_WEIGHT = 0.6;

function totalDuration(o: FlightOption): number {
  return o.outbound.durationMinutes + (o.inbound?.durationMinutes ?? 0);
}

function tagAndSort(options: FlightOption[], sort: FlightSort): FlightOption[] {
  if (options.length === 0) return options;
  const minPrice = Math.min(...options.map((o) => o.pricePerPersonMinor));
  const minTime = Math.min(...options.map(totalDuration));
  const score = (o: FlightOption) => o.pricePerPersonMinor / minPrice + (BEST_DURATION_WEIGHT * totalDuration(o)) / minTime;
  const pick = (better: (x: FlightOption, y: FlightOption) => number) => [...options].sort(better)[0];
  const byPrice = (x: FlightOption, y: FlightOption) => x.pricePerPersonMinor - y.pricePerPersonMinor || totalDuration(x) - totalDuration(y);
  const byTime = (x: FlightOption, y: FlightOption) => totalDuration(x) - totalDuration(y) || x.pricePerPersonMinor - y.pricePerPersonMinor;
  const byScore = (x: FlightOption, y: FlightOption) => score(x) - score(y) || byPrice(x, y);
  pick(byScore)?.tags.push("best");
  pick(byPrice)?.tags.push("cheapest");
  pick(byTime)?.tags.push("fastest");
  const order = sort === "cheapest" ? byPrice : sort === "fastest" ? byTime : byScore;
  return [...options].sort(order);
}

/** Estimated flights for a search, tagged and sorted. */
export function estimateFlights(query: FlightQuery, today: string): FlightOption[] {
  const from = airport(query.from);
  const to = airport(query.to);
  if (from.code === to.code) throw new EstimateError("choose two different airports");
  checkDate(today, query.depart, "the departure date");
  if (query.returnDate !== null) {
    checkDate(today, query.returnDate, "the return date");
    if (daysBetween(query.depart, query.returnDate) < 0) throw new EstimateError("the return can't be before the departure");
  }
  if (!Number.isInteger(query.adults) || query.adults < 1 || query.adults > 9) {
    throw new EstimateError("travellers must be between 1 and 9");
  }

  const routes: (Airport | null)[] = [];
  if (nonstopPossible(from, to)) routes.push(null, null, null);
  routes.push(...hubsFor(from, to));

  const options = routes.slice(0, 6).map((via, i): FlightOption => {
    const key = `${from.code}-${to.code}-${query.depart}-${query.returnDate ?? ""}-${query.cabin}-${via?.code ?? "direct"}`;
    const spread = via ? 0 : i;
    const outbound = makeLeg(from, to, via, `${key}:out`, spread);
    let fare = legFare(from, to, via, query.depart, today, query.cabin, `${key}:out:${spread}`);
    let inbound: Leg | null = null;
    if (query.returnDate !== null) {
      // On the day the outbound lands, the return leaves at least an hour after it.
      const landed = outbound.arrivesDayOffset * 1440 + minutesOf(outbound.arrives);
      const earliest = landed + 60 - daysBetween(query.depart, query.returnDate) * 1440;
      inbound = makeLeg(to, from, via, `${key}:in`, spread, earliest);
      fare += legFare(to, from, via, query.returnDate, today, query.cabin, `${key}:in:${spread}`);
    }
    const perPerson = pounds(fare);
    return { id: `f${i}`, outbound, inbound, pricePerPersonMinor: perPerson, totalMinor: perPerson * query.adults, tags: [] };
  });
  // Any return that still can't leave after the outbound lands (no slot late enough) is dropped.
  const possible = options.filter((o) => {
    if (!o.inbound || query.returnDate === null) return true;
    const landed = o.outbound.arrivesDayOffset * 1440 + minutesOf(o.outbound.arrives);
    const leaves = daysBetween(query.depart, query.returnDate) * 1440 + minutesOf(o.inbound.departs);
    return leaves >= landed + 60;
  });
  if (possible.length === 0) throw new EstimateError("the return is before you'd arrive; choose a later return date");
  return tagAndSort(possible, query.sort);
}

// ---------------------------------------------------------------------------
// Stays

/** A typical 3-star hotel night, in pounds, by country. */
const NIGHTLY: Record<string, number> = { JP: 95, US: 150, ES: 85, FR: 110, IT: 100, GR: 80, PT: 80, TR: 60, TH: 45, AE: 120 };
/** Countries where "near the beach" is a sensible area for most destination cities. */
const BEACH = new Set(["US", "ES", "GR", "PT", "TR", "TH", "AE"]);

const STAY_KINDS: { kind: StayKind; label: string; factor: number }[] = [
  { kind: "hostel", label: "Hostel, private room", factor: 0.4 },
  { kind: "guesthouse", label: "Guest house", factor: 0.7 },
  { kind: "apartment", label: "Apartment", factor: 0.95 },
  { kind: "hotel3", label: "3-star hotel", factor: 1 },
  { kind: "hotel4", label: "4-star hotel", factor: 1.55 },
  { kind: "hotel5", label: "5-star hotel", factor: 2.7 },
];

const AREAS: { name: string; factor: number }[] = [
  { name: "City centre", factor: 1.15 },
  { name: "Quieter neighbourhood", factor: 0.9 },
  { name: "Near the airport", factor: 0.85 },
];
const BEACH_AREA = { name: "Near the beach", factor: 1.1 };

export const MAX_NIGHTS = 30;

/** Estimated places to stay, cheapest first (or most comfortable first). */
export function estimateStays(query: StayQuery, today: string): StayOption[] {
  const city = destinationCity(query.city);
  checkDate(today, query.checkIn, "the check-in date");
  checkDate(today, query.checkOut, "the check-out date");
  const nights = daysBetween(query.checkIn, query.checkOut);
  if (nights < 1) throw new EstimateError("check-out must be after check-in");
  if (nights > MAX_NIGHTS) throw new EstimateError(`stays can be up to ${MAX_NIGHTS} nights`);
  if (!Number.isInteger(query.guests) || query.guests < 1 || query.guests > 9) {
    throw new EstimateError("guests must be between 1 and 9");
  }
  const areas = BEACH.has(city.countryCode) ? [...AREAS, BEACH_AREA] : AREAS;
  const base = NIGHTLY[city.countryCode] ?? 90;
  const rooms = Math.ceil(query.guests / 2);

  const options: StayOption[] = [];
  for (const kind of STAY_KINDS) {
    // Two different areas per kind, chosen per city so each city looks a little different.
    const first = Math.floor(unit(`${city.code}:${kind.kind}:area`) * areas.length);
    for (const offset of [0, 1]) {
      const area = areas[(first + offset) % areas.length] ?? AREAS[0]!;
      const key = `${city.code}-${kind.kind}-${area.name}-${query.checkIn}`;
      const nightly = pounds(base * kind.factor * area.factor * season(query.checkIn) * between(key, 0.9, 1.15)) * rooms;
      options.push({
        id: `s${options.length}`,
        kind: kind.kind,
        label: kind.label,
        area: area.name,
        city: city.city,
        nightlyMinor: nightly,
        nights,
        rooms,
        totalMinor: nightly * nights,
      });
    }
  }
  const rank = (o: StayOption) => STAY_KINDS.findIndex((k) => k.kind === o.kind);
  return options.sort((x, y) =>
    query.sort === "comfort" ? rank(y) - rank(x) || x.totalMinor - y.totalMinor : x.totalMinor - y.totalMinor,
  );
}

// ---------------------------------------------------------------------------
// Cars

/** A small car for a day, in pounds, by country. */
const DAILY: Record<string, number> = { JP: 45, US: 50, ES: 25, FR: 35, IT: 35, GR: 30, PT: 25, TR: 25, TH: 25, AE: 35 };
/** Where manual gearboxes are the cheap default. */
const MANUAL_COUNTRIES = new Set(["ES", "FR", "IT", "GR", "PT", "TR"]);

const CARS: { carClass: CarClass; label: string; seats: number; bags: number; factor: number }[] = [
  { carClass: "small", label: "Small car", seats: 4, bags: 1, factor: 1 },
  { carClass: "medium", label: "Medium car", seats: 5, bags: 2, factor: 1.3 },
  { carClass: "estate", label: "Estate", seats: 5, bags: 4, factor: 1.6 },
  { carClass: "suv", label: "SUV", seats: 5, bags: 3, factor: 2 },
  { carClass: "people-carrier", label: "People carrier", seats: 7, bags: 3, factor: 2.5 },
];

export const MAX_RENTAL_DAYS = 30;

/** Estimated car hire at the destination airport, cheapest first. */
export function estimateCars(query: CarQuery, today: string): CarOption[] {
  const city = destinationCity(query.city);
  checkDate(today, query.pickUpDate, "the pick-up date");
  checkDate(today, query.dropOffDate, "the drop-off date");
  const days = Math.max(1, daysBetween(query.pickUpDate, query.dropOffDate));
  if (daysBetween(query.pickUpDate, query.dropOffDate) < 0) throw new EstimateError("drop-off must be after pick-up");
  if (days > MAX_RENTAL_DAYS) throw new EstimateError(`car hire can be up to ${MAX_RENTAL_DAYS} days`);
  const base = DAILY[city.countryCode] ?? 35;
  return CARS.map((car, i) => {
    const automatic = !MANUAL_COUNTRIES.has(city.countryCode) || car.factor >= 1.6;
    const daily = pounds(base * car.factor * season(query.pickUpDate) * between(`${city.code}-${car.carClass}-${query.pickUpDate}`, 0.9, 1.15));
    return {
      id: `c${i}`,
      carClass: car.carClass,
      label: car.label,
      seats: car.seats,
      bags: car.bags,
      automatic,
      dailyMinor: daily,
      days,
      totalMinor: daily * days,
      pickUp: city.code,
    };
  }).sort((x, y) => x.totalMinor - y.totalMinor);
}

// ---------------------------------------------------------------------------
// Flight + hotel

/** The cheapest estimated return flight plus each place to stay, cheapest total first. */
export function estimatePackages(query: PackageQuery, today: string): { flight: FlightOption; options: PackageOption[] } {
  destinationCity(query.to);
  const flights = estimateFlights(
    { from: query.from, to: query.to, depart: query.depart, returnDate: query.returnDate, adults: query.adults, cabin: "economy", sort: "cheapest" },
    today,
  );
  const flight = flights[0];
  if (!flight) throw new EstimateError("no flights to estimate");
  const stays = estimateStays(
    { city: query.to, checkIn: query.depart, checkOut: query.returnDate, guests: query.adults, sort: "cheapest" },
    today,
  );
  const options = stays
    .filter((s) => s.kind !== "hostel")
    .map((stay, i) => ({ id: `p${i}`, stay, totalMinor: flight.totalMinor + stay.totalMinor }))
    .sort((x, y) => x.totalMinor - y.totalMinor);
  return { flight, options };
}

// ---------------------------------------------------------------------------
// Price map

/** Days of the month the map samples, each with a week-long return. */
const MAP_DAYS = [5, 12, 19, 26];

/** The cheapest estimated economy return per person to each destination airport in `month` (`YYYY-MM`). */
export function estimatePriceMap(from: string, monthIso: string, today: string): PricePin[] {
  const origin = airport(from);
  if (!origin.roles.includes("origin")) throw new EstimateError(`${origin.city} isn't a departure airport we know`);
  if (!/^\d{4}-\d{2}$/.test(monthIso) || Number.isNaN(dayValue(`${monthIso}-01`))) {
    throw new EstimateError("the month isn't a month");
  }
  const usable = (date: string) => {
    const ahead = daysBetween(today, date);
    return ahead >= 0 && ahead + 7 <= MAX_DAYS_AHEAD;
  };
  const dates = MAP_DAYS.map((d) => `${monthIso}-${String(d).padStart(2, "0")}`).filter(usable);
  // Late in the month every sample day may have passed: use today instead.
  if (dates.length === 0 && today.startsWith(monthIso) && usable(today)) dates.push(today);
  if (dates.length === 0) throw new EstimateError("choose a month in the next year");

  return destinationAirports().map((dest) => {
    let cheapest = Infinity;
    for (const depart of dates) {
      const options = estimateFlights(
        { from: origin.code, to: dest.code, depart, returnDate: addDays(depart, 7), adults: 1, cabin: "economy", sort: "cheapest" },
        today,
      );
      cheapest = Math.min(cheapest, options[0]?.pricePerPersonMinor ?? Infinity);
    }
    return {
      code: dest.code,
      city: dest.city,
      countryCode: dest.countryCode,
      destinationSlug: dest.destinationSlug ?? "",
      lat: dest.lat,
      lon: dest.lon,
      pricePerPersonMinor: cheapest,
    };
  });
}
