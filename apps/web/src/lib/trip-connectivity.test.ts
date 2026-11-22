import { describe, expect, it } from "vitest";
import { MOCK_ESIM_PACKAGES, type EsimPackage } from "@northstar/esim-provider";
import { suggestEsim, tripDays, validityDays } from "./trip-connectivity";

const pkg = (code: string, countryCode: string, validity: string, price: number): EsimPackage => ({
  code,
  name: code,
  countryCode,
  countryName: countryCode,
  dataVolume: "3 GB",
  validity,
  price,
  currency: "GBP",
});

describe("trip connectivity", () => {
  it("reads the provider's validity wording", () => {
    expect(validityDays("15 days")).toBe(15);
    expect(validityDays("7 day")).toBe(7);
    expect(validityDays("30")).toBe(30);
    expect(validityDays("2 weeks")).toBe(14);
    expect(validityDays("1 month")).toBe(30);
    expect(validityDays("unlimited")).toBeNull();
    expect(validityDays("0 days")).toBeNull();
  });

  it("counts both the first and last day of a trip", () => {
    expect(tripDays("2027-04-01", "2027-04-21")).toBe(21);
    expect(tripDays("2027-04-01", "2027-04-01")).toBe(1);
    expect(tripDays("2027-04-01", null)).toBeNull();
    expect(tripDays(null, null)).toBeNull();
  });

  it("suggests the cheapest plan that lasts the whole trip", () => {
    const plans = [pkg("US-7", "US", "7 days", 449), pkg("US-30", "US", "30 days", 1499), pkg("NA-30", "NA", "30 days", 1299)];
    const week = suggestEsim(plans, 6, "US");
    expect(week).toMatchObject({ covers: true, tripDays: 6 });
    expect(week.suggested?.code).toBe("US-7");
    expect(week.others.map((p) => p.code)).toEqual(["NA-30", "US-30"]);

    const fortnight = suggestEsim(plans, 14, "US");
    expect(fortnight.suggested?.code).toBe("NA-30");
    expect(fortnight.note).toMatch(/whole 14-day trip/);
  });

  it("prefers the country's own plan at the same price", () => {
    const plans = [pkg("EU-30", "EU", "30 days", 999), pkg("ES-30", "ES", "30 days", 999)];
    expect(suggestEsim(plans, 10, "ES").suggested?.code).toBe("ES-30");
  });

  it("says so when no plan lasts the whole trip", () => {
    const japan = MOCK_ESIM_PACKAGES.filter((p) => p.countryCode === "JP");
    const result = suggestEsim(japan, 21, "JP");
    expect(result.covers).toBe(false);
    expect(result.suggested?.validity).toBe("15 days");
    expect(result.note).toMatch(/No single plan lasts your whole 21-day trip/);
  });

  it("asks for dates before suggesting, and lists the plans meanwhile", () => {
    const plans = [pkg("A", "GB", "30 days", 799), pkg("B", "GB", "7 days", 399)];
    const result = suggestEsim(plans, null, "GB");
    expect(result.suggested).toBeNull();
    expect(result.note).toMatch(/Add the trip's dates/);
    expect(result.others.map((p) => p.code)).toEqual(["B", "A"]);
  });

  it("handles a destination with no plans", () => {
    expect(suggestEsim([], 5, "TH")).toMatchObject({ suggested: null, others: [], covers: false });
  });
});
