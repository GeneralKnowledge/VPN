import { describe, expect, it } from "vitest";
import { addDays } from "@northstar/travel-search";
import { duration, runWebSearch, searchHref, searchType } from "./web-search";

const today = "2027-01-10";
const depart = addDays(today, 30);
const back = addDays(depart, 7);

describe("the Travel site's search page", () => {
  it("shows only the form until a search has what it needs", () => {
    expect(runWebSearch("flights", {}, today)).toEqual({ kind: "empty" });
    expect(runWebSearch("flights", { from: "EDI", to: "BCN" }, today)).toEqual({ kind: "empty" });
    expect(runWebSearch("surprise", { from: "EDI" }, today)).toEqual({ kind: "empty" });
  });

  it("runs each kind of search on the same estimates as the app", () => {
    const flights = runWebSearch("flights", { from: "edi", to: "BCN", depart, return: back, sort: "cheapest" }, today);
    expect(flights.kind).toBe("flights");
    if (flights.kind === "flights") expect(flights.options.length).toBeGreaterThan(0);

    const stays = runWebSearch("stays", { city: "BCN", checkIn: depart, checkOut: back }, today);
    expect(stays.kind === "stays" && stays.options.length > 0).toBe(true);

    const cars = runWebSearch("cars", { city: "BCN", pickUp: depart, dropOff: back }, today);
    expect(cars.kind === "cars" && cars.options.length > 0).toBe(true);

    const packages = runWebSearch("packages", { from: "EDI", to: "BCN", depart, return: back }, today);
    expect(packages.kind === "packages" && packages.options.length > 0).toBe(true);

    const surprise = runWebSearch("surprise", { from: "EDI", seed: "abc123", region: "europe" }, today);
    expect(surprise.kind).toBe("surprise");
  });

  it("explains a search it can't run, in a sentence", () => {
    const bad = runWebSearch("flights", { from: "EDINBURGH", to: "BCN", depart }, today);
    expect(bad).toEqual({ kind: "error", message: expect.stringMatching(/three-letter codes\.$/) });
    const past = runWebSearch("stays", { city: "BCN", checkIn: "2020-01-01", checkOut: "2020-01-05" }, today);
    expect(past.kind).toBe("error");
  });

  it("re-rolls with links that keep the rest of the search", () => {
    expect(searchHref({ type: "surprise", from: "EDI", seed: "s1", month: "" }, { rollStay: "1" })).toBe(
      "/search?type=surprise&from=EDI&seed=s1&rollStay=1",
    );
  });

  it("falls back to flights for an unknown tab, and writes durations for people", () => {
    expect(searchType("hotels")).toBe("flights");
    expect(searchType("cars")).toBe("cars");
    expect(duration(125)).toBe("2h 05m");
  });
});
