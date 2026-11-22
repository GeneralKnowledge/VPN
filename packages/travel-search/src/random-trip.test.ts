import { describe, expect, it } from "vitest";
import {
  EstimateError,
  planRandomTrip,
  randomTripQuerySchema,
  regionOf,
  type RandomTripCriteria,
  type RandomTripRequest,
} from "./index";

const today = "2026-11-22";
const criteria = (over: Partial<RandomTripCriteria> = {}): RandomTripCriteria => ({
  from: "EDI",
  region: "europe",
  month: "2026-12",
  budgetPerPersonMinor: 500_00,
  nights: 7,
  adults: 1,
  ...over,
});
const request = (over: Partial<RandomTripRequest> = {}, c: Partial<RandomTripCriteria> = {}): RandomTripRequest => ({
  criteria: criteria(c),
  seed: "abc",
  rolls: { where: 0, when: 0, flight: 0, stay: 0 },
  locks: {},
  ...over,
});

describe("random trip", () => {
  it("gives the same trip for the same request", () => {
    expect(planRandomTrip(request(), today)).toEqual(planRandomTrip(request(), today));
  });

  it("keeps to the criteria: Europe in December under £500", () => {
    for (const seed of ["a", "b", "c", "d", "e", "f"]) {
      const trip = planRandomTrip(request({ seed }), today);
      expect(regionOf(trip.destination.countryCode)).toBe("europe");
      expect(trip.depart.startsWith("2026-12")).toBe(true);
      expect(trip.returnDate).toBe(new Date(Date.parse(`${trip.depart}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10));
      expect(trip.perPersonMinor).toBeLessThanOrEqual(500_00);
      expect(trip.overBudgetByMinor).toBe(0);
      expect(trip.totalMinor).toBe(trip.flight.totalMinor + trip.stay.totalMinor);
    }
  });

  it("warns when a busy period leaves only hostels in the budget", () => {
    const hostelOnly = ["a", "b", "c", "d", "e", "f", "g", "h"]
      .map((seed) => planRandomTrip(request({ seed }), today))
      .filter((t) => t.stay.kind === "hostel" && t.warnings[0]?.includes("only hostels"));
    expect(hostelOnly.length).toBeGreaterThan(0);
    expect(hostelOnly[0]!.warnings[0]).toMatch(
      /^December is a busy period, so only hostels fit £500 per person on these dates\. Anything else starts at about £[\d,]+ per person est\.$/,
    );
  });

  it("doesn't say hostels fit when a kept hostel trip is over the budget", () => {
    const hostel = ["a", "b", "c", "d", "e", "f", "g", "h"]
      .map((seed) => planRandomTrip(request({ seed }), today))
      .find((t) => t.stay.kind === "hostel")!;
    const kept = planRandomTrip(request({ locks: hostel.current }, { budgetPerPersonMinor: 1_00 }), today);
    expect(kept.overBudgetByMinor).toBe(kept.perPersonMinor - 1_00);
    expect(kept.warnings.join(" ")).not.toContain("only hostels");
  });

  it("says a month is busy without a budget, and says nothing in a quiet month", () => {
    const busy = planRandomTrip(request({}, { budgetPerPersonMinor: null }), today);
    expect(busy.warnings).toEqual(["December is a busy period, so prices are higher than usual."]);
    const quiet = planRandomTrip(request({}, { month: "2027-02", budgetPerPersonMinor: null }), today);
    expect(quiet.warnings).toEqual([]);
  });

  it("finds different trips for different seeds", () => {
    const places = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map((seed) => planRandomTrip(request({ seed }), today).destination.code));
    expect(places.size).toBeGreaterThan(2);
  });

  it("re-rolls one section and keeps what's locked", () => {
    const roomy = { budgetPerPersonMinor: 900_00 };
    const first = planRandomTrip(request({}, roomy), today);
    const locked = { where: first.current.where, when: first.current.when, flight: first.current.flight };
    const stays = new Set<string>();
    for (let roll = 0; roll < 8; roll++) {
      const next = planRandomTrip(request({ locks: locked, rolls: { where: 0, when: 0, flight: 0, stay: roll } }, roomy), today);
      expect(next.perPersonMinor).toBeLessThanOrEqual(900_00);
      expect(next.destination.code).toBe(first.destination.code);
      expect(next.depart).toBe(first.depart);
      expect(next.flight.id).toBe(first.flight.id);
      stays.add(next.current.stay);
    }
    expect(stays.size).toBeGreaterThan(1);

    const places = new Set<string>();
    for (let roll = 0; roll < 8; roll++) {
      places.add(planRandomTrip(request({ rolls: { where: roll, when: 0, flight: 0, stay: 0 } }), today).destination.code);
    }
    expect(places.size).toBeGreaterThan(1);
  });

  it("works with no criteria but a home airport", () => {
    const trip = planRandomTrip(request({}, { region: null, month: null, budgetPerPersonMinor: null }), today);
    expect(trip.destination.code).toMatch(/^[A-Z]{3}$/);
    expect(trip.depart > today).toBe(true);
  });

  it("offers upgrades that are locks the app can apply", () => {
    const trip = planRandomTrip(request({ locks: { stay: "guesthouse|City centre" } }, { budgetPerPersonMinor: null }), today);
    const nicer = trip.upgrades.find((u) => u.kind === "nicer-stay")!;
    expect(nicer.deltaPerPersonMinor).toBeGreaterThan(0);
    const upgraded = planRandomTrip(request({ locks: nicer.locks }, { budgetPerPersonMinor: null }), today);
    expect(upgraded.stay.kind).toBe("apartment");
    expect(upgraded.destination.code).toBe(trip.destination.code);
    expect(upgraded.perPersonMinor - trip.perPersonMinor).toBe(nicer.deltaPerPersonMinor);

    for (const u of trip.upgrades.filter((x) => x.kind === "cheaper-dates")) {
      expect(u.deltaPerPersonMinor).toBeLessThanOrEqual(-10_00);
      const moved = planRandomTrip(request({ locks: u.locks }, { budgetPerPersonMinor: null }), today);
      expect(moved.perPersonMinor - trip.perPersonMinor).toBe(u.deltaPerPersonMinor);
    }
  });

  it("shows a locked upgrade over budget and says by how much", () => {
    const trip = planRandomTrip(request(), today);
    const top = { ...trip.current, stay: `hotel5|${trip.stay.area}` };
    const pricey = planRandomTrip(request({ locks: top }, { budgetPerPersonMinor: 100_00 }), today);
    expect(pricey.stay.kind).toBe("hotel5");
    expect(pricey.overBudgetByMinor).toBe(pricey.perPersonMinor - 100_00);
  });

  it("says the cheapest it found when nothing fits", () => {
    expect(() => planRandomTrip(request({}, { budgetPerPersonMinor: 20_00 }), today)).toThrow(/cheapest trip we found .* est\./);
    expect(() => planRandomTrip(request({}, { region: "asia", budgetPerPersonMinor: 150_00 }), today)).toThrow(EstimateError);
  });

  it("refuses criteria it can't use", () => {
    expect(() => planRandomTrip(request({}, { from: "BCN" }), today)).toThrow(/UK airport/);
    expect(() => planRandomTrip(request({}, { nights: 1 }), today)).toThrow(/nights/);
    expect(() => planRandomTrip(request({}, { month: "2026-10" }), today)).toThrow(/month/);
    expect(() => planRandomTrip(request({ locks: { where: "EDI" } }), today)).toThrow(/destination/);
  });

  it("reads its query string", () => {
    const parsed = randomTripQuerySchema.parse({ from: "edi", region: "europe", month: "2026-12", budget: "500", seed: "x1" });
    expect(parsed).toMatchObject({ from: "EDI", budget: 500, nights: 7, adults: 1, rollStay: 0 });
    expect(randomTripQuerySchema.safeParse({ from: "EDI", seed: "x y" }).success).toBe(false);
  });
});
