import { listDestinations } from "@northstar/destinations";
import { describe, expect, it } from "vitest";
import {
  EstimateError,
  airports,
  dayValue,
  destinationAirports,
  distanceKm,
  estimateCars,
  estimateFlights,
  estimatePackages,
  estimatePriceMap,
  estimateStays,
  flightQuerySchema,
  getAirport,
  originAirports,
  todayInUk,
  type FlightQuery,
} from "./index";

const today = "2026-11-22";
const query = (over: Partial<FlightQuery> = {}): FlightQuery => ({
  from: "EDI",
  to: "BCN",
  depart: "2026-12-22",
  returnDate: "2026-12-29",
  adults: 1,
  cabin: "economy",
  sort: "best",
  ...over,
});

describe("airports", () => {
  it("has unique codes", () => {
    expect(new Set(airports.map((a) => a.code)).size).toBe(airports.length);
  });

  it("serves every Travel Hub destination, and only those", () => {
    const slugs = new Set(listDestinations().map((d) => d.slug));
    const served = new Set(destinationAirports().map((a) => a.destinationSlug));
    expect(served).toEqual(slugs);
    for (const a of destinationAirports()) {
      const destination = listDestinations().find((d) => d.slug === a.destinationSlug)!;
      expect(a.countryCode).toBe(destination.countryCode);
    }
  });

  it("departs from the UK", () => {
    expect(originAirports().map((a) => a.code)).toContain("EDI");
    expect(originAirports().every((a) => a.countryCode === "GB")).toBe(true);
  });

  it("measures real distances", () => {
    // London Heathrow to New York JFK is about 5,540 km.
    expect(distanceKm(getAirport("LHR")!, getAirport("JFK")!)).toBeGreaterThan(5450);
    expect(distanceKm(getAirport("LHR")!, getAirport("JFK")!)).toBeLessThan(5650);
  });
});

describe("flights", () => {
  it("gives the same answer for the same search", () => {
    expect(estimateFlights(query(), today)).toEqual(estimateFlights(query(), today));
  });

  it("offers nonstop and one-stop options for a short trip, each tagged once", () => {
    const options = estimateFlights(query(), today);
    expect(options.length).toBeGreaterThanOrEqual(4);
    expect(options.some((o) => o.outbound.via.length === 0)).toBe(true);
    expect(options.some((o) => o.outbound.via.length === 1)).toBe(true);
    for (const tag of ["best", "cheapest", "fastest"] as const) {
      expect(options.filter((o) => o.tags.includes(tag))).toHaveLength(1);
    }
    for (const o of options) {
      expect(o.inbound?.from).toBe("BCN");
      expect(o.inbound?.via).toEqual(o.outbound.via.slice().reverse());
    }
  });

  it("gives nonstop departures different times", () => {
    const nonstop = estimateFlights(query(), today).filter((o) => o.outbound.via.length === 0);
    expect(new Set(nonstop.map((o) => o.outbound.departs)).size).toBe(nonstop.length);
  });

  it("has no nonstop from a regional airport to Japan", () => {
    const options = estimateFlights(query({ to: "HND" }), today);
    expect(options.every((o) => o.outbound.via.length === 1)).toBe(true);
    expect(estimateFlights(query({ from: "LHR", to: "HND" }), today).some((o) => o.outbound.via.length === 0)).toBe(true);
  });

  it("sorts as asked", () => {
    const cheapest = estimateFlights(query({ sort: "cheapest" }), today).map((o) => o.pricePerPersonMinor);
    expect(cheapest).toEqual([...cheapest].sort((a, b) => a - b));
    const fastest = estimateFlights(query({ sort: "fastest" }), today).map(
      (o) => o.outbound.durationMinutes + (o.inbound?.durationMinutes ?? 0),
    );
    expect(fastest).toEqual([...fastest].sort((a, b) => a - b));
  });

  it("prices plausibly: Europe cheaper than Japan, business dearer than economy", () => {
    const min = (q: FlightQuery) => Math.min(...estimateFlights(q, today).map((o) => o.pricePerPersonMinor));
    const spain = min(query());
    const japan = min(query({ to: "HND" }));
    expect(spain).toBeGreaterThan(50_00);
    expect(spain).toBeLessThan(400_00);
    expect(japan).toBeGreaterThan(spain * 3);
    expect(min(query({ cabin: "business" }))).toBeGreaterThan(spain * 2);
  });

  it("multiplies by travellers", () => {
    const one = estimateFlights(query({ sort: "cheapest" }), today)[0]!;
    const three = estimateFlights(query({ adults: 3, sort: "cheapest" }), today)[0]!;
    expect(three.totalMinor).toBe(one.pricePerPersonMinor * 3);
  });

  it("turns arrival into local time at the destination", () => {
    // Bangkok is 7 hours ahead: a 12-hour nonstop leaving at 10:10 lands after 05:00 the next day.
    const options = estimateFlights(query({ from: "LHR", to: "BKK", returnDate: null }), today);
    const nonstop = options.find((o) => o.outbound.via.length === 0)!;
    expect(nonstop.inbound).toBeNull();
    const [h, m] = nonstop.outbound.departs.split(":").map(Number);
    const local = h! * 60 + m! + nonstop.outbound.durationMinutes + 7 * 60;
    expect(nonstop.outbound.arrivesDayOffset).toBe(Math.floor(local / 1440));
  });

  it("refuses searches it can't estimate", () => {
    expect(() => estimateFlights(query({ to: "EDI" }), today)).toThrow(EstimateError);
    expect(() => estimateFlights(query({ to: "XXX" }), today)).toThrow(EstimateError);
    expect(() => estimateFlights(query({ depart: "2026-11-01" }), today)).toThrow(/past/);
    expect(() => estimateFlights(query({ depart: "2028-01-01", returnDate: null }), today)).toThrow(/year/);
    expect(() => estimateFlights(query({ returnDate: "2026-12-20" }), today)).toThrow(/before/);
    expect(() => estimateFlights(query({ depart: "2027-02-30" }), today)).toThrow(/date/);
    expect(() => estimateFlights(query({ adults: 10 }), today)).toThrow(/travellers/);
  });
});

describe("stays", () => {
  const stays = (over = {}) =>
    estimateStays({ city: "BCN", checkIn: "2026-12-22", checkOut: "2026-12-29", guests: 2, sort: "cheapest", ...over }, today);

  it("lists each kind in two areas, cheapest first", () => {
    const options = stays();
    expect(options).toHaveLength(12);
    expect(options.every((o) => o.nights === 7 && o.rooms === 1 && o.totalMinor === o.nightlyMinor * 7)).toBe(true);
    const totals = options.map((o) => o.totalMinor);
    expect(totals).toEqual([...totals].sort((a, b) => a - b));
    expect(options[0]!.kind).toBe("hostel");
  });

  it("puts the most comfortable first when asked", () => {
    expect(stays({ sort: "comfort" })[0]!.kind).toBe("hotel5");
  });

  it("books more rooms for more guests", () => {
    expect(stays({ guests: 5 })[0]!.rooms).toBe(3);
  });

  it("only stays at our destinations", () => {
    expect(() => stays({ city: "AMS" })).toThrow(/destinations/);
    expect(() => stays({ checkOut: "2026-12-22" })).toThrow(/after/);
    expect(() => stays({ checkOut: "2027-02-01" })).toThrow(/30 nights/);
  });
});

describe("cars", () => {
  it("lists five classes cheapest first, automatic where that's normal", () => {
    const spain = estimateCars({ city: "AGP", pickUpDate: "2026-12-22", dropOffDate: "2026-12-29" }, today);
    expect(spain).toHaveLength(5);
    expect(spain[0]!.carClass).toBe("small");
    expect(spain[0]!.automatic).toBe(false);
    expect(spain.every((c) => c.days === 7 && c.pickUp === "AGP")).toBe(true);
    const usa = estimateCars({ city: "MCO", pickUpDate: "2026-12-22", dropOffDate: "2026-12-29" }, today);
    expect(usa.every((c) => c.automatic)).toBe(true);
  });
});

describe("flight + hotel", () => {
  it("adds the cheapest flight to each stay", () => {
    const { flight, options } = estimatePackages(
      { from: "EDI", to: "BCN", depart: "2026-12-22", returnDate: "2026-12-29", adults: 2 },
      today,
    );
    expect(flight.tags).toContain("cheapest");
    expect(options.every((o) => o.totalMinor === flight.totalMinor + o.stay.totalMinor)).toBe(true);
    expect(options.some((o) => o.stay.kind === "hostel")).toBe(false);
  });
});

describe("price map", () => {
  it("has a price for every destination airport", () => {
    const pins = estimatePriceMap("EDI", "2026-12", today);
    expect(pins).toHaveLength(destinationAirports().length);
    expect(pins.every((p) => Number.isFinite(p.pricePerPersonMinor) && p.pricePerPersonMinor > 0)).toBe(true);
    const price = (c: string) => pins.find((p) => p.code === c)!.pricePerPersonMinor;
    expect(price("BCN")).toBeLessThan(price("HND"));
  });

  it("refuses months it can't estimate", () => {
    expect(() => estimatePriceMap("EDI", "2026-10", today)).toThrow(/year/);
    expect(() => estimatePriceMap("BCN", "2026-12", today)).toThrow(/departure/);
    expect(() => estimatePriceMap("EDI", "2026-13", today)).toThrow(/month/);
  });
});

describe("queries", () => {
  it("reads a flight search from a query string", () => {
    const parsed = flightQuerySchema.parse({ from: "edi", to: "BCN", depart: "2026-12-22", adults: "2" });
    expect(parsed).toMatchObject({ from: "EDI", adults: 2, cabin: "economy", sort: "best" });
    expect(parsed.return).toBeUndefined();
    expect(flightQuerySchema.safeParse({ from: "EDIN", to: "BCN", depart: "2026-12-22" }).success).toBe(false);
  });

  it("knows today's date in the UK", () => {
    expect(todayInUk(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
    expect(Number.isNaN(dayValue("2027-02-29"))).toBe(true);
  });
});
