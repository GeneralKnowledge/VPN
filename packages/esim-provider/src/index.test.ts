import { describe, expect, it } from "vitest";
import {
  classifyIssueError,
  createEsimProvider,
  EsimProviderError,
  MOCK_ESIM_PACKAGES,
  ResellPortalEsimProvider,
  retailPricePence,
  validatePricing,
  wholesaleCostPence,
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
      pricing: { wholesaleCurrency: "USD", usdToGbp: 0.8, markup: 1.4, minPricePence: 99 },
    });

    const packages = await provider.listPackages({ country: "US" });
    expect(packages[0]?.code).toBe("CKH104");
    // $1.80 × 0.8 = £1.44 cost; × 1.4 = 201.6p, rounded up.
    expect(packages[0]?.price).toBe(202);

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

describe("eSIM retail pricing", () => {
  const usd = { wholesaleCurrency: "USD" as const, usdToGbp: 0.79, markup: 1.4, minPricePence: 99 };

  it("converts USD to GBP before the markup and rounds up", () => {
    // $10 → £7.90 → × 1.4 = £11.06
    expect(retailPricePence(10, usd)).toBe(1106);
    // Never below cost × markup through rounding.
    expect(retailPricePence(1.01, usd)! / 100).toBeGreaterThanOrEqual(1.01 * 0.79 * 1.4);
  });

  it("uses GBP prices as they are, and applies the floor", () => {
    expect(retailPricePence(5, { ...usd, wholesaleCurrency: "GBP", usdToGbp: undefined })).toBe(700);
    expect(retailPricePence(0.2, usd)).toBe(99);
  });

  it("refuses to price without a rate or a usable amount", () => {
    expect(validatePricing({ ...usd, usdToGbp: undefined })).toHaveLength(1);
    expect(validatePricing({ ...usd, markup: 0.9 })).toHaveLength(1);
    expect(retailPricePence(Number.NaN, usd)).toBeNull();
    expect(retailPricePence(0, usd)).toBeNull();
    expect(wholesaleCostPence(10, usd)).toBeCloseTo(790);
  });

  it("hides packages without a price and refuses to list without a USD rate", async () => {
    const fetchFn = (async () =>
      new Response(JSON.stringify([{ package_code: "A", price: 2 }, { package_code: "B" }]), {
        status: 200,
      })) as unknown as typeof fetch;
    const priced = new ResellPortalEsimProvider({ apiUrl: "https://rp.test", apiKey: "k", apiSecret: "s", fetchFn, pricing: usd });
    expect((await priced.listPackages()).map((p) => p.code)).toEqual(["A"]);
    const unpriced = new ResellPortalEsimProvider({ apiUrl: "https://rp.test", apiKey: "k", apiSecret: "s", fetchFn });
    await expect(unpriced.listPackages()).rejects.toThrow(/ESIM_USD_TO_GBP/);
  });
});
