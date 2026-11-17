import { describe, expect, it } from "vitest";
import { formatTripDates } from "./trip-dates";

describe("formatTripDates", () => {
  it("shows a range with nights", () => {
    expect(formatTripDates("2027-04-01", "2027-04-21")).toBe("1 Apr 2027 – 21 Apr 2027 (20 nights)");
    expect(formatTripDates("2027-04-01", "2027-04-02")).toContain("(1 night)");
  });
  it("copes with missing dates", () => {
    expect(formatTripDates("2027-04-01", null)).toBe("From 1 Apr 2027");
    expect(formatTripDates(null, null)).toBe("No dates yet");
  });
});
