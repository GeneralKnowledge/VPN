import { describe, expect, it } from "vitest";
import { normaliseCityKey, projectEquirectangular, resolveLocationCoords } from "./geo";

describe("geo", () => {
  it("resolves known cities", () => {
    const london = resolveLocationCoords("GB", "London");
    expect(london.latitude).toBeCloseTo(51.5074, 2);
    expect(london.longitude).toBeCloseTo(-0.1278, 2);
  });

  it("falls back to country centroid for unknown cities", () => {
    const coords = resolveLocationCoords("JP", "SomewhereUnknown");
    expect(coords.latitude).toBeCloseTo(36.2, 1);
  });

  it("normalises city keys", () => {
    expect(normaliseCityKey("São Paulo")).toBe("sao paulo");
    expect(normaliseCityKey("New York")).toBe("new york");
  });

  it("projects equirectangular coordinates into the view box", () => {
    const origin = projectEquirectangular(0, 0, 360, 180);
    expect(origin.x).toBeCloseTo(180);
    expect(origin.y).toBeCloseTo(90);
  });
});
