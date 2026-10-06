import { describe, expect, it, vi } from "vitest";
import { createVPNProvider, MockVPNProvider, VPNResellersProvider } from "./index";

describe("MockVPNProvider", () => {
  it("provisions account, lists locations, and returns marked mock configs", async () => {
    const provider = new MockVPNProvider();
    const account = await provider.createAccount({
      username: "northstar_user",
      password: "secret-pass",
      externalCustomerId: "user_1",
    });
    expect(account.status).toBe("active");

    const locations = await provider.listLocations();
    expect(locations.length).toBeGreaterThanOrEqual(8);

    const config = await provider.getConnectionConfig({
      accountId: account.providerAccountId,
      locationId: locations[0]!.id,
      protocol: "wireguard",
    });
    expect(config.isMock).toBe(true);
    expect(config.content).toContain("MOCK CONFIGURATION");

    await provider.suspendAccount(account.providerAccountId);
    expect((await provider.getAccount(account.providerAccountId)).status).toBe("disabled");
    await provider.reactivateAccount(account.providerAccountId);
    expect((await provider.getAccount(account.providerAccountId)).status).toBe("active");
  });
});

describe("VPNResellersProvider", () => {
  it("maps list servers response without inventing endpoints", async () => {
    const fetchFn = vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (href.endsWith("/servers")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 1,
                name: "ams-s02.example.net",
                ip: "1.2.3.4",
                country_code: "NL",
                city: "Amsterdam",
                capacity: 10,
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (href.endsWith("/vless-servers")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ message: "not found", code: 404 }), { status: 404 });
    });

    const provider = new VPNResellersProvider({
      apiUrl: "https://api.vpnresellers.com/v4_1",
      apiToken: "test-token",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const locations = await provider.listLocations();
    expect(locations).toHaveLength(1);
    expect(locations[0]?.city).toBe("Amsterdam");
    expect(fetchFn).toHaveBeenCalled();
    const firstUrl = String(fetchFn.mock.calls[0]![0]);
    expect(firstUrl).toContain("/v4_1/servers");
  });

  it("createVPNProvider selects implementations", () => {
    expect(createVPNProvider("mock")).toBeInstanceOf(MockVPNProvider);
    expect(createVPNProvider("vpnresellers", { apiToken: "x" })).toBeInstanceOf(VPNResellersProvider);
  });
});
