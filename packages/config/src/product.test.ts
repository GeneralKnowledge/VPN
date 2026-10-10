import { describe, expect, it } from "vitest";
import {
  getBrand,
  hostWithoutPort,
  isProduct,
  resolveProductFromHost,
  resolveRequestHost,
} from "./product";

describe("product helpers", () => {
  it("identifies product ids", () => {
    expect(isProduct("vpn")).toBe(true);
    expect(isProduct("esim")).toBe(true);
    expect(isProduct("other")).toBe(false);
  });

  it("returns distinct brands", () => {
    expect(getBrand("vpn").name).toContain("VPN");
    expect(getBrand("esim").name).toContain("SIM");
    expect(getBrand("vpn").name).not.toBe(getBrand("esim").name);
  });

  it("strips ports from hosts", () => {
    expect(hostWithoutPort("sim.localhost:3000")).toBe("sim.localhost");
    expect(hostWithoutPort("VPN.Example.COM")).toBe("vpn.example.com");
  });

  it("resolves product from host maps", () => {
    const config = {
      vpnHosts: ["vpn.localhost", "vpn.example.com"],
      esimHosts: ["sim.localhost", "sim.example.com"],
      defaultProduct: "vpn" as const,
    };
    expect(resolveProductFromHost("sim.localhost:3000", config)).toBe("esim");
    expect(resolveProductFromHost("vpn.example.com", config)).toBe("vpn");
    expect(resolveProductFromHost("localhost:3000", config)).toBe("vpn");
  });

  it("ignores x-forwarded-host unless trust is enabled", () => {
    const headers = {
      get(name: string) {
        if (name === "x-forwarded-host") return "sim.localhost";
        if (name === "host") return "vpn.example.com";
        return null;
      },
    };
    expect(resolveRequestHost(headers)).toBe("vpn.example.com");
    expect(resolveRequestHost(headers, { trustForwardedHost: true })).toBe("sim.localhost");
  });
});
