import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { middleware } from "./middleware";

function req(path: string, host: string, init?: { method?: string }) {
  return new NextRequest(new URL(path, `http://${host}`), {
    method: init?.method ?? "GET",
    headers: { host },
  });
}

const saved = { ...process.env };

beforeEach(() => {
  process.env.PRODUCT_HOST_VPN = "vpn.localhost";
  process.env.PRODUCT_HOST_ESIM = "sim.localhost";
  process.env.PRODUCT_HOST_TRAVEL = "travel.localhost";
  process.env.APP_URL = "http://vpn.localhost";
  delete process.env.TRUST_FORWARDED_HOST;
});

afterEach(() => {
  process.env = { ...saved };
});

describe("travel host routing", () => {
  it("rewrites home and destination pages under /travel", () => {
    const home = middleware(req("/", "travel.localhost"));
    expect(home.headers.get("x-middleware-rewrite")).toBe("http://travel.localhost/travel");
    expect(home.headers.get("x-northstar-product")).toBe("travel");

    const japan = middleware(req("/destinations/japan", "travel.localhost"));
    expect(japan.headers.get("x-middleware-rewrite")).toBe(
      "http://travel.localhost/travel/destinations/japan",
    );
  });

  it("sends pages Travel doesn't have back to its home", () => {
    for (const path of ["/dashboard", "/dashboard/esim", "/pricing", "/sim", "/download"]) {
      const res = middleware(req(path, "travel.localhost"));
      expect(res.status, path).toBe(307);
      expect(res.headers.get("location"), path).toBe("http://travel.localhost/");
    }
  });

  it("serves sign-in pages and rewrites trips", () => {
    expect(middleware(req("/login", "travel.localhost")).headers.get("x-middleware-next")).toBe("1");
    expect(middleware(req("/register", "travel.localhost")).headers.get("x-northstar-product")).toBe("travel");
    expect(middleware(req("/trips", "travel.localhost")).headers.get("x-middleware-rewrite")).toBe(
      "http://travel.localhost/travel/trips",
    );
    expect(middleware(req("/go/lnk_0", "travel.localhost")).headers.get("x-middleware-rewrite")).toBe(
      "http://travel.localhost/travel/go/lnk_0",
    );
    expect(middleware(req("/partner-preview", "travel.localhost")).headers.get("x-middleware-rewrite")).toBe(
      "http://travel.localhost/travel/partner-preview",
    );
    // Referral links also work where there is no Travel hostname yet.
    expect(middleware(req("/go/lnk_0", "vpn.localhost")).headers.get("x-middleware-rewrite")).toBe(
      "http://vpn.localhost/travel/go/lnk_0",
    );
    expect(middleware(req("/go", "vpn.localhost")).headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("sends admin to the VPN host and hides admin APIs", async () => {
    const admin = middleware(req("/admin/users", "travel.localhost"));
    expect(admin.headers.get("location")).toBe("http://vpn.localhost/admin/users");
    const api = middleware(req("/api/admin/users", "travel.localhost"));
    expect(api.status).toBe(404);
  });

  it("lets API calls through with the travel product", () => {
    const res = middleware(req("/api/travel/destinations", "travel.localhost"));
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(res.headers.get("x-northstar-product")).toBe("travel");
  });

  it("keeps /travel pages off the VPN and eSIM hosts", () => {
    for (const host of ["vpn.localhost", "sim.localhost", "localhost"]) {
      const res = middleware(req("/travel/destinations/japan", host));
      expect(res.status, host).toBe(307);
      expect(res.headers.get("location"), host).toBe(`http://${host}/`);
    }
  });

  it("ignores a client-sent x-forwarded-host unless trusted", () => {
    const r = new NextRequest(new URL("/", "http://vpn.localhost"), {
      headers: { host: "vpn.localhost", "x-forwarded-host": "travel.localhost" },
    });
    expect(middleware(r).headers.get("x-northstar-product")).toBe("vpn");
  });
});
