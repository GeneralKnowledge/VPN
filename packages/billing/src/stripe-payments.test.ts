import { describe, expect, it } from "vitest";
import {
  MockOneTimePayments,
  StripeOneTimePayments,
  parseCheckoutSession,
  signStripePayload,
  toStripeForm,
  verifyStripeSignature,
} from "./stripe-payments";

describe("verifyStripeSignature", () => {
  const secret = "whsec_abc";
  const payload = '{"id":"evt_1"}';

  it("accepts a fresh signature and any matching v1 among several", () => {
    const now = 1_800_000_000;
    const header = signStripePayload(payload, secret, now);
    expect(verifyStripeSignature(payload, header, secret, { nowSeconds: now })).toBe(true);
    const rotated = `${header},v1=${"0".repeat(64)}`;
    expect(verifyStripeSignature(payload, rotated, secret, { nowSeconds: now })).toBe(true);
  });

  it("rejects a tampered body, wrong secret, stale timestamp and junk", () => {
    const now = 1_800_000_000;
    const header = signStripePayload(payload, secret, now);
    expect(verifyStripeSignature('{"id":"evt_2"}', header, secret, { nowSeconds: now })).toBe(false);
    expect(verifyStripeSignature(payload, header, "whsec_other", { nowSeconds: now })).toBe(false);
    expect(verifyStripeSignature(payload, header, secret, { nowSeconds: now + 301 })).toBe(false);
    expect(verifyStripeSignature(payload, "t=1,v1=zz", secret, { nowSeconds: now })).toBe(false);
    expect(verifyStripeSignature(payload, null, secret)).toBe(false);
    expect(verifyStripeSignature(payload, header, "", { nowSeconds: now })).toBe(false);
  });
});

describe("StripeOneTimePayments", () => {
  function fakeFetch(responses: Array<{ status: number; body: unknown }>) {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fn = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const r = responses.shift() ?? { status: 500, body: {} };
      return new Response(JSON.stringify(r.body), { status: r.status });
    }) as unknown as typeof fetch;
    return { fn, calls };
  }

  it("creates a payment-mode session with server amount, metadata and idempotency key", async () => {
    const { fn, calls } = fakeFetch([{ status: 200, body: { id: "cs_test_1", url: "https://checkout.stripe.com/c/1" } }]);
    const stripe = new StripeOneTimePayments({ secretKey: "sk_test_x", fetchFn: fn });
    const session = await stripe.createOneTimeCheckout({
      orderId: "eso_1",
      amount: 1299,
      currency: "GBP",
      productName: "UK 5GB",
      customerEmail: "a@test.local",
      successUrl: "https://sim.example.com/ok",
      cancelUrl: "https://sim.example.com/no",
      idempotencyKey: "esim_key_1",
      kind: "esim",
    });
    expect(session).toEqual({ id: "cs_test_1", url: "https://checkout.stripe.com/c/1" });
    const form = new URLSearchParams(String(calls[0]!.init.body));
    expect(calls[0]!.url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(form.get("mode")).toBe("payment");
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("1299");
    expect(form.get("line_items[0][price_data][currency]")).toBe("gbp");
    expect(form.get("metadata[orderId]")).toBe("eso_1");
    expect(form.get("metadata[kind]")).toBe("esim");
    expect(form.get("payment_intent_data[metadata][orderId]")).toBe("eso_1");
    expect((calls[0]!.init.headers as Record<string, string>)["Idempotency-Key"]).toBe("esim_key_1");
  });

  it("refuses live keys unless explicitly allowed", async () => {
    const { fn, calls } = fakeFetch([]);
    const stripe = new StripeOneTimePayments({ secretKey: "sk_live_x", fetchFn: fn });
    await expect(stripe.refund("pi_1", "k")).rejects.toThrow(/Live Stripe keys/);
    expect(calls).toHaveLength(0);
  });

  it("maps a missing session to null and refunds by payment intent", async () => {
    const { fn, calls } = fakeFetch([
      { status: 404, body: { error: { message: "No such session" } } },
      { status: 200, body: { id: "re_1", status: "succeeded" } },
    ]);
    const stripe = new StripeOneTimePayments({ secretKey: "sk_test_x", fetchFn: fn });
    expect(await stripe.getCheckoutSession("cs_missing")).toBeNull();
    expect(await stripe.refund("pi_1", "refund_eso_1")).toEqual({ id: "re_1", status: "succeeded" });
    expect(new URLSearchParams(String(calls[1]!.init.body)).get("payment_intent")).toBe("pi_1");
  });
});

describe("helpers", () => {
  it("form-encodes nested values", () => {
    expect(toStripeForm({ a: { b: [{ c: 1 }] }, skip: undefined }).toString()).toBe("a%5Bb%5D%5B0%5D%5Bc%5D=1");
  });

  it("parses checkout sessions from webhooks", () => {
    expect(
      parseCheckoutSession({
        id: "cs_1",
        status: "complete",
        payment_status: "paid",
        payment_intent: "pi_1",
        amount_total: 999,
        currency: "gbp",
        metadata: { orderId: "eso_1" },
      }),
    ).toEqual({
      id: "cs_1",
      status: "complete",
      paymentStatus: "paid",
      paymentIntentId: "pi_1",
      amountTotal: 999,
      currency: "gbp",
      orderId: "eso_1",
    });
  });

  it("mock refunds are idempotent per key", async () => {
    const mock = new MockOneTimePayments();
    await mock.refund("pi", "k1");
    await mock.refund("pi", "k1");
    expect(mock.refunds).toHaveLength(1);
  });
});
