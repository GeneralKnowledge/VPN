import { describe, expect, it } from "vitest";
import {
  classifyIssueError,
  createEsimProvider,
  EsimProviderError,
  MOCK_ESIM_PACKAGES,
  ResellPortalEsimProvider,
} from "./index";

describe("MockEsimProvider", () => {
  it("lists and issues a package", async () => {
    const provider = createEsimProvider("mock");
    const packages = await provider.listPackages({ country: "GB" });
    expect(packages.length).toBeGreaterThan(0);
    expect(packages.every((p) => p.countryCode === "GB")).toBe(true);

    const pkg = MOCK_ESIM_PACKAGES[0]!;
    const order = await provider.createOrder({
      clientRef: "user_1",
      email: "a@example.com",
      packageCode: pkg.code,
    });
    expect(order.providerOrderId).toBeTruthy();
    expect(order.qrCodeUrl).toMatch(/^data:image\/png;base64,/);
    expect(order.iccid).toBeTruthy();
  });

  it("rejects unknown packages", async () => {
    const provider = createEsimProvider("mock");
    await expect(
      provider.createOrder({
        clientRef: "u",
        email: "a@example.com",
        packageCode: "NOPE",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("ResellPortalEsimProvider", () => {
  it("maps package list and order responses", async () => {
    const fetchFn: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.includes("/esim-packages")) {
        return new Response(
          JSON.stringify([
            {
              package_code: "CKH104",
              name: "United States 1GB 7Days",
              location: "US",
              data_volume: "1 GB",
              validity: "7 day",
              price: 1.8,
            },
          ]),
          { status: 200 },
        );
      }
      if (url.endsWith("/clients") && init?.method === "POST") {
        return new Response(JSON.stringify({ client_id: 123 }), { status: 200 });
      }
      if (url.endsWith("/orders") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            success: true,
            service_id: 789,
            package: { code: "CKH104", name: "United States 1GB 7Days" },
            esim_details: {
              qr_code_url: "https://example.com/qr.png",
              activation_url: "LPA:1$example$abc",
              iccid: "8901234567890123456",
              esim_status: "AVAILABLE",
            },
          }),
          { status: 200 },
        );
      }
      return new Response("not found", { status: 404 });
    };

    const provider = new ResellPortalEsimProvider({
      apiUrl: "https://panel.resellportal.com/wp-json/resellportal/v1",
      apiKey: "k",
      apiSecret: "s",
      fetchFn,
    });

    const packages = await provider.listPackages({ country: "US" });
    expect(packages[0]?.code).toBe("CKH104");
    expect(packages[0]?.price).toBeGreaterThan(0);

    const issued = await provider.createOrder({
      clientRef: "user_x",
      email: "x@example.com",
      packageCode: "CKH104",
    });
    expect(issued.providerOrderId).toBe("789");
    expect(issued.iccid).toBe("8901234567890123456");
    expect(issued.status).toBe("available");
  });
});

describe("ResellPortal order safety", () => {
  function provider(handler: (url: string, init?: RequestInit) => Response, testMode = false) {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchFn = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return handler(url, init);
    }) as unknown as typeof fetch;
    return {
      calls,
      rp: new ResellPortalEsimProvider({ apiUrl: "https://rp.test/v1", apiKey: "k", apiSecret: "s", fetchFn, testMode }),
    };
  }

  it("does not place an order when the client cannot be created", async () => {
    const { rp, calls } = provider(() => new Response(JSON.stringify({ message: "bad email" }), { status: 422 }));
    const err = await rp.createOrder({ clientRef: "eso_1", email: "x", packageCode: "P" }).catch((e) => e);
    expect(classifyIssueError(err)).toBe("rejected");
    expect(calls.map((c) => c.url)).toEqual(["https://rp.test/v1/clients"]);
  });

  it("treats timeouts and 5xx on the order call as unknown outcomes", async () => {
    const { rp } = provider((url) =>
      url.endsWith("/clients")
        ? new Response(JSON.stringify({ client_id: 1 }), { status: 200 })
        : new Response("{}", { status: 502 }),
    );
    const err = await rp.createOrder({ clientRef: "eso_1", email: "x@y.z", packageCode: "P" }).catch((e) => e);
    expect(classifyIssueError(err)).toBe("unknown");
    expect(classifyIssueError(new Error("boom"))).toBe("unknown");
    expect(classifyIssueError(new EsimProviderError("x", "insufficient_balance"))).toBe("not_created");
  });

  it("sends the test-mode header and maps GOT_RESOURCE to available", async () => {
    const { rp, calls } = provider(
      (url) =>
        new Response(
          JSON.stringify(
            url.endsWith("/clients")
              ? { client_id: "test_cli_1" }
              : { service_id: "test_svc_1", esim_details: { esim_status: "GOT_RESOURCE" } },
          ),
          { status: 200 },
        ),
      true,
    );
    const issued = await rp.createOrder({ clientRef: "eso_1", email: "x@y.z", packageCode: "P" });
    expect(issued.status).toBe("available");
    expect(issued.providerOrderId).toBe("test_svc_1");
    expect((calls[1]!.init!.headers as Record<string, string>)["X-RP-Test-Mode"]).toBe("1");
    expect(JSON.parse(String(calls[1]!.init!.body))).toMatchObject({ client_id: "test_cli_1", product_key: "esim" });
  });
});
