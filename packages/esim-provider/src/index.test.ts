import { describe, expect, it } from "vitest";
import { createEsimProvider, MOCK_ESIM_PACKAGES, ResellPortalEsimProvider } from "./index";

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
    expect(order.qrCodeUrl).toContain("mock");
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
