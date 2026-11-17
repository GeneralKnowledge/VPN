import { describe, expect, it } from "vitest";
import { entryRequirementsUrl, getDestination, isReviewed, listDestinations } from "./index";

describe("destinations", () => {
  it("holds the first ten destinations", () => {
    expect(listDestinations().map((d) => d.slug)).toEqual([
      "japan",
      "usa",
      "spain",
      "france",
      "italy",
      "greece",
      "portugal",
      "turkey",
      "thailand",
      "uae",
    ]);
  });

  it("has unique slugs and country codes", () => {
    const all = listDestinations();
    expect(new Set(all.map((d) => d.slug)).size).toBe(all.length);
    expect(new Set(all.map((d) => d.countryCode)).size).toBe(all.length);
  });

  it("lists the country itself first among its eSIM codes", () => {
    for (const d of listDestinations()) {
      expect(d.esimCodes[0]).toBe(d.countryCode);
    }
  });

  it("finds a destination by slug", () => {
    expect(getDestination("japan")?.countryCode).toBe("JP");
    expect(getDestination("nowhere")).toBeNull();
  });

  it("links to the FCDO entry requirements page", () => {
    const japan = getDestination("japan")!;
    expect(entryRequirementsUrl(japan)).toBe(
      "https://www.gov.uk/foreign-travel-advice/japan/entry-requirements",
    );
  });

  it("marks unchecked facts as a draft", () => {
    expect(isReviewed(getDestination("japan")!)).toBe(false);
  });
});
