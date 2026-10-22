import { describe, expect, it } from "vitest";
import { isCrossSiteWrite } from "./csrf";

function h(values: Record<string, string>) {
  return new Headers(values);
}

const hosts = ["vpn.example.com", "localhost:3000"];

describe("isCrossSiteWrite", () => {
  it("never blocks safe methods", () => {
    expect(isCrossSiteWrite("GET", h({ origin: "https://evil.test", "sec-fetch-site": "cross-site" }), hosts)).toBe(false);
  });

  it("allows same-origin writes", () => {
    expect(isCrossSiteWrite("POST", h({ origin: "https://vpn.example.com", "sec-fetch-site": "same-origin" }), hosts)).toBe(false);
    expect(isCrossSiteWrite("DELETE", h({ origin: "http://localhost:3000" }), hosts)).toBe(false);
  });

  it("blocks writes from another site or a sibling subdomain", () => {
    expect(isCrossSiteWrite("POST", h({ origin: "https://evil.test" }), hosts)).toBe(true);
    expect(isCrossSiteWrite("POST", h({ origin: "https://sim.example.com", "sec-fetch-site": "same-site" }), hosts)).toBe(true);
    expect(isCrossSiteWrite("PATCH", h({ "sec-fetch-site": "cross-site" }), hosts)).toBe(true);
  });

  it("blocks an opaque origin", () => {
    expect(isCrossSiteWrite("POST", h({ origin: "null" }), hosts)).toBe(true);
  });

  it("lets server-to-server calls without browser metadata through to their own auth", () => {
    expect(isCrossSiteWrite("POST", h({ "stripe-signature": "t=1" }), hosts)).toBe(false);
  });

  it("compares hosts case-insensitively and ignores empty entries", () => {
    expect(isCrossSiteWrite("POST", h({ origin: "https://VPN.example.com" }), [null, undefined, "vpn.example.com"])).toBe(false);
  });
});
