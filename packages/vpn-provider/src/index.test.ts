import { describe, expect, it, vi } from "vitest";
import {
  createVPNProvider,
  MockVPNProvider,
  VPNResellersProvider,
  VpnProviderError,
} from "./index";

describe("MockVPNProvider", () => {
  it("provisions account, lists locations, suspends, reactivates, and returns mock configs", async () => {
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
      locationId: locations[0]!.providerId,
      protocol: "wireguard",
    });
    expect(config.isMock).toBe(true);
    expect(config.content).toContain("MOCK CONFIGURATION");

    await provider.suspendAccount(account.providerAccountId);
    expect((await provider.getAccount(account.providerAccountId)).status).toBe("disabled");
    await provider.reactivateAccount(account.providerAccountId);
    expect((await provider.getAccount(account.providerAccountId)).status).toBe("active");

    expect(await provider.findAccountByUsername("northstar_user")).not.toBeNull();
    await provider.deleteAccount(account.providerAccountId);
    await expect(provider.getAccount(account.providerAccountId)).rejects.toBeInstanceOf(VpnProviderError);
  });

  it("rejects duplicate usernames with conflict", async () => {
    const provider = new MockVPNProvider();
    await provider.createAccount({
      username: "dup_user",
      password: "secret-pass",
      externalCustomerId: "u1",
    });
    await expect(
      provider.createAccount({
        username: "dup_user",
        password: "secret-pass",
        externalCustomerId: "u2",
      }),
    ).rejects.toMatchObject({ code: "conflict" });
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("VPNResellersProvider", () => {
  it("paginates servers and maps locations", async () => {
    const pageOf = (href: string) => {
      const m = href.match(/[?&]page=(\d+)/);
      return m ? Number(m[1]) : null;
    };
    const fetchFn = vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (href.includes("/vless-servers")) {
        return jsonResponse({ data: [], meta: { current_page: 1, last_page: 1 } });
      }
      if (href.includes("/servers")) {
        const page = pageOf(href);
        if (page === 1) {
          return jsonResponse({
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
            meta: { current_page: 1, last_page: 2 },
          });
        }
        if (page === 2) {
          return jsonResponse({
            data: [
              {
                id: 2,
                name: "lon-s01.example.net",
                ip: "5.6.7.8",
                country_code: "GB",
                city: "London",
              },
            ],
            meta: { current_page: 2, last_page: 2 },
          });
        }
      }
      return jsonResponse({ message: "not found", code: 404 }, 404);
    });

    const provider = new VPNResellersProvider({
      apiUrl: "https://api.vpnresellers.com/v4_1",
      apiToken: "test-token",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const locations = await provider.listLocations();
    expect(locations.map((l) => l.city).sort()).toEqual(["Amsterdam", "London"]);
  });

  it("creates account, gets, suspends, reactivates, deletes", async () => {
    const fetchFn = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      const method = init?.method ?? "GET";
      if (method === "POST" && href.endsWith("/accounts")) {
        expect(init?.headers).toMatchObject(
          expect.objectContaining({ Authorization: "Bearer test-token" }),
        );
        return jsonResponse(
          {
            data: {
              id: 99,
              username: "ns_abc",
              status: "Active",
              created: "2024-01-01 00:00:00",
            },
            code: 201,
          },
          201,
        );
      }
      if (method === "GET" && href.endsWith("/accounts/99")) {
        return jsonResponse({
          data: { id: 99, username: "ns_abc", status: "Active", created: "2024-01-01 00:00:00" },
        });
      }
      if (method === "PUT" && href.endsWith("/accounts/99/disable")) {
        return jsonResponse({ code: 200 });
      }
      if (method === "PUT" && href.endsWith("/accounts/99/enable")) {
        return jsonResponse({ code: 200 });
      }
      if (method === "DELETE" && href.endsWith("/accounts/99")) {
        return jsonResponse({ code: 200 });
      }
      if (href.includes("/accounts?username=")) {
        return jsonResponse({ data: [] });
      }
      return jsonResponse({ message: "not found", code: 404 }, 404);
    });

    const provider = new VPNResellersProvider({
      apiUrl: "https://api.vpnresellers.com/v4_1",
      apiToken: "test-token",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const created = await provider.createAccount({
      username: "ns_abc",
      password: "secret12",
      externalCustomerId: "user_1",
    });
    expect(created.providerAccountId).toBe("99");

    const got = await provider.getAccount("99");
    expect(got.username).toBe("ns_abc");

    // After disable, getAccount still called — mock returns Active; just ensure no throw
    await provider.suspendAccount("99");
    await provider.reactivateAccount("99");
    await provider.deleteAccount("99");
  });

  it("expires account after create when expiresAt set", async () => {
    const fetchFn = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      const method = init?.method ?? "GET";
      if (method === "POST" && href.endsWith("/accounts")) {
        return jsonResponse(
          { data: { id: 7, username: "exp_user", status: "Active" }, code: 201 },
          201,
        );
      }
      if (method === "PUT" && href.endsWith("/accounts/7/expire")) {
        const body = JSON.parse(String(init?.body)) as { expire_at: string };
        expect(body.expire_at).toBe("2025-12-31");
        return jsonResponse({
          data: { id: 7, username: "exp_user", status: "Active", expired_at: "2025-12-31T00:00:00.000000Z" },
        });
      }
      if (method === "GET" && href.endsWith("/accounts/7")) {
        return jsonResponse({
          data: { id: 7, username: "exp_user", status: "Active", expired_at: "2025-12-31T00:00:00.000000Z" },
        });
      }
      if (href.includes("/accounts?username=")) return jsonResponse({ data: [] });
      return jsonResponse({ message: "nope" }, 404);
    });

    const provider = new VPNResellersProvider({
      apiUrl: "https://api.vpnresellers.com/v4_1",
      apiToken: "t",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const account = await provider.createAccount({
      username: "exp_user",
      password: "secret12",
      externalCustomerId: "u",
      expiresAt: "2025-12-31T12:00:00.000Z",
    });
    expect(account.expiresAt).toContain("2025-12-31");
  });

  it("resolves openvpn port via /ports", async () => {
    const fetchFn = vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (href.includes("/ports")) {
        return jsonResponse({
          data: [
            { id: 5, protocol: "udp", number: 1194, default: 1 },
            { id: 6, protocol: "udp", number: 443, default: 0 },
          ],
        });
      }
      if (href.includes("/configuration/openvpn")) {
        expect(href).toContain("port_id=5");
        expect(href).toContain("server_id=12");
        return new Response("client\ndev tun\n", { status: 200 });
      }
      return jsonResponse({ message: "nope" }, 404);
    });

    const provider = new VPNResellersProvider({
      apiUrl: "https://api.vpnresellers.com/v4_1",
      apiToken: "t",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const cfg = await provider.getConnectionConfig({
      accountId: "99",
      locationId: "12",
      protocol: "openvpn",
    });
    expect(cfg.content).toContain("client");
    expect(cfg.isMock).toBe(false);
  });

  it.each([
    [401, "unauthorized", false],
    [403, "unauthorized", false],
    [404, "not_found", false],
    [422, "validation", false],
    [429, "rate_limited", true],
    [500, "unknown", true],
  ] as const)("maps HTTP %i to %s", async (status, code, retryable) => {
    const fetchFn = vi.fn(async () => jsonResponse({ message: "err", code: status }, status));
    const provider = new VPNResellersProvider({
      apiUrl: "https://api.vpnresellers.com/v4_1",
      apiToken: "t",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(provider.getAccount("1")).rejects.toMatchObject({ code, retryable, httpStatus: status });
  });

  it("maps username taken to conflict and finds existing account", async () => {
    const fetchFn = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const href = String(url);
      const method = init?.method ?? "GET";
      if (method === "POST" && href.endsWith("/accounts")) {
        return jsonResponse(
          {
            message: "The given data was invalid.",
            errors: { username: ["The username has already been taken."] },
            code: 422,
          },
          422,
        );
      }
      if (href.includes("/accounts?username=")) {
        return jsonResponse({
          data: [{ id: 42, username: "taken_user", status: "Active" }],
        });
      }
      return jsonResponse({ message: "nope" }, 404);
    });

    const provider = new VPNResellersProvider({
      apiUrl: "https://api.vpnresellers.com/v4_1",
      apiToken: "t",
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    const account = await provider.createAccount({
      username: "taken_user",
      password: "secret12",
      externalCustomerId: "u",
    });
    expect(account.providerAccountId).toBe("42");
  });

  it("handles timeout", async () => {
    const fetchFn = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      await new Promise<void>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("Aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
      return jsonResponse({});
    });

    const provider = new VPNResellersProvider({
      apiUrl: "https://api.vpnresellers.com/v4_1",
      apiToken: "t",
      timeoutMs: 10,
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    await expect(provider.getAccount("1")).rejects.toMatchObject({ code: "timeout", retryable: true });
  });

  it("handles malformed JSON on error", async () => {
    const fetchFn = vi.fn(async () => new Response("not-json", { status: 500 }));
    const provider = new VPNResellersProvider({
      apiUrl: "https://api.vpnresellers.com/v4_1",
      apiToken: "t",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    await expect(provider.getAccount("1")).rejects.toMatchObject({ code: "unknown", retryable: true });
  });

  it("createVPNProvider selects implementations", () => {
    expect(createVPNProvider("mock")).toBeInstanceOf(MockVPNProvider);
    expect(createVPNProvider("vpnresellers", { apiToken: "x" })).toBeInstanceOf(VPNResellersProvider);
  });
});

describe("VPNResellersProvider lookups and credentials", () => {
  function provider(fetchFn: ReturnType<typeof vi.fn>) {
    return new VPNResellersProvider({
      apiUrl: "https://api.vpnresellers.com/v4_1",
      apiToken: "test-token",
      fetchFn: fetchFn as unknown as typeof fetch,
    });
  }

  it("does not scan every account page when the filtered lookup returns a short page", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ data: [], meta: { last_page: 1 } }));
    expect(await provider(fetchFn).findAccountByUsername("ns_new_customer")).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("falls back to scanning when the filter appears to be ignored (full page, no match)", async () => {
    const full = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, username: `other_${i}`, status: "active" }));
    const fetchFn = vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (href.includes("per_page=50") && !href.includes("page=")) return jsonResponse({ data: full });
      return jsonResponse({
        data: [...full, { id: 99, username: "ns_target", status: "active" }],
        meta: { current_page: 1, last_page: 1 },
      });
    });
    const found = await provider(fetchFn).findAccountByUsername("ns_target");
    expect(found?.providerAccountId).toBe("99");
  });

  it("changes an account password via the documented endpoint", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ code: 200 }));
    await provider(fetchFn).changePassword("42", "a-strong-password");
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.vpnresellers.com/v4_1/accounts/42/change_password");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({ password: "a-strong-password" });
  });

  it("refuses to hand a JSON blob to the customer as a config file", async () => {
    const fetchFn = vi.fn(async () => jsonResponse({ unexpected: true }));
    await expect(
      provider(fetchFn).getConnectionConfig({ accountId: "1", locationId: "2", protocol: "wireguard" }),
    ).rejects.toBeInstanceOf(VpnProviderError);
  });
});
