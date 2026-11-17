import { describe, expect, it } from "vitest";
import {
  StripeBillingProvider,
  mapStripeSubscriptionStatus,
  parseStripeSubscription,
  paymentIntentFromInvoice,
} from "./stripe";
import type { CreateCheckoutInput } from "./types";

type Call = { url: string; method: string; body: string; headers: Record<string, string> };

function fakeFetch(responses: Array<{ status: number; body: unknown }>) {
  const calls: Call[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      method: String(init.method),
      body: String(init.body ?? ""),
      headers: init.headers as Record<string, string>,
    });
    const r = responses.shift() ?? { status: 500, body: {} };
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const priceMap = { "platinum-monthly": "price_sub_m", "gold-annual": "price_once_y" };

function provider(fn: typeof fetch, secretKey = "sk_test_x", allowLiveKeys = false) {
  return new StripeBillingProvider({ secretKey, webhookSecret: "whsec", priceMap, fetchFn: fn, allowLiveKeys });
}

const input: CreateCheckoutInput = {
  customerId: "u1",
  customerEmail: "a@test.local",
  planId: "platinum-monthly",
  billingMode: "subscription",
  billingInterval: "month",
  amount: 499,
  paymentRail: "stripe",
  successUrl: "https://vpn.example.com/ok",
  cancelUrl: "https://vpn.example.com/no",
  idempotencyKey: "checkout_u1_k",
};

describe("StripeBillingProvider subscriptions", () => {
  it("creates a subscription-mode Checkout with the configured price and tagged metadata", async () => {
    const { fn, calls } = fakeFetch([{ status: 200, body: { id: "cs_test_1", url: "https://checkout.stripe.com/c/1" } }]);
    const session = await provider(fn).createCheckout(input);
    expect(session).toMatchObject({ id: "cs_test_1", url: "https://checkout.stripe.com/c/1", status: "open" });
    const form = new URLSearchParams(calls[0]!.body);
    expect(calls[0]!.url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(calls[0]!.headers["Idempotency-Key"]).toBe("checkout_u1_k");
    expect(form.get("mode")).toBe("subscription");
    expect(form.get("line_items[0][price]")).toBe("price_sub_m");
    expect(form.get("metadata[kind]")).toBe("vpn");
    expect(form.get("metadata[userId]")).toBe("u1");
    expect(form.get("subscription_data[metadata][planId]")).toBe("platinum-monthly");
    expect(form.get("client_reference_id")).toBe("u1");
    // The browser never chooses an amount: only the price id is sent.
    expect(form.get("line_items[0][price_data][unit_amount]")).toBeNull();
  });

  it("uses payment mode for prepaid plans and omits the email for username-only accounts", async () => {
    const { fn, calls } = fakeFetch([{ status: 200, body: { id: "cs_test_2", url: "https://checkout.stripe.com/c/2" } }]);
    await provider(fn).createCheckout({ ...input, planId: "gold-annual", billingMode: "prepaid", customerEmail: null });
    const form = new URLSearchParams(calls[0]!.body);
    expect(form.get("mode")).toBe("payment");
    expect(form.get("payment_intent_data[metadata][kind]")).toBe("vpn");
    expect(form.get("customer_email")).toBeNull();
  });

  it("puts the VPN statement suffix on one-off plans only", async () => {
    const { fn, calls } = fakeFetch([
      { status: 200, body: { id: "cs_test_3", url: "https://checkout.stripe.com/c/3" } },
      { status: 200, body: { id: "cs_test_4", url: "https://checkout.stripe.com/c/4" } },
    ]);
    const stripe = new StripeBillingProvider({ secretKey: "sk_test_x", webhookSecret: "w", priceMap, fetchFn: fn, statementSuffix: "VPN" });
    await stripe.createCheckout({ ...input, planId: "gold-annual", billingMode: "prepaid" });
    await stripe.createCheckout(input);
    expect(new URLSearchParams(calls[0]!.body).get("payment_intent_data[statement_descriptor_suffix]")).toBe("VPN");
    // Subscription mode takes no payment_intent_data; renewals use the Product's descriptor.
    expect(new URLSearchParams(calls[1]!.body).get("payment_intent_data[statement_descriptor_suffix]")).toBeNull();
  });

  it("refuses a plan with no configured price, and live keys without the launch gate", async () => {
    const { fn, calls } = fakeFetch([]);
    await expect(provider(fn).createCheckout({ ...input, planId: "diamond-monthly" })).rejects.toThrow(/No Stripe price/);
    await expect(provider(fn, "sk_live_x").createCheckout(input)).rejects.toThrow(/STRIPE_ALLOW_LIVE_PAYMENTS/);
    expect(calls).toHaveLength(0);
    expect((await provider(fn, "sk_live_x").getProviderStatus()).ok).toBe(false);
  });

  it("allows live keys once the launch gate is open", async () => {
    const { fn, calls } = fakeFetch([{ status: 200, body: { id: "cs_live_1", url: "https://checkout.stripe.com/c/3" } }]);
    await provider(fn, "sk_live_x", true).createCheckout(input);
    expect(calls).toHaveLength(1);
  });

  it("cancels at period end, cancels now, and resumes", async () => {
    const sub = { id: "sub_1", status: "active", cancel_at_period_end: true, current_period_end: 1_900_000_000 };
    const { fn, calls } = fakeFetch([
      { status: 200, body: sub },
      { status: 200, body: { ...sub, status: "canceled", cancel_at_period_end: false } },
      { status: 200, body: { ...sub, cancel_at_period_end: false } },
    ]);
    const stripe = provider(fn);
    expect((await stripe.cancelSubscription("sub_1", true)).status).toBe("cancelling");
    expect(calls[0]).toMatchObject({ method: "POST", body: "cancel_at_period_end=true" });
    expect((await stripe.cancelSubscription("sub_1", false)).status).toBe("cancelled");
    expect(calls[1]).toMatchObject({ method: "DELETE", url: "https://api.stripe.com/v1/subscriptions/sub_1" });
    expect((await stripe.resumeSubscription("sub_1")).status).toBe("active");
    expect(calls[2]!.body).toBe("cancel_at_period_end=false");
  });

  it("does not call Stripe to cancel prepaid access", async () => {
    const { fn, calls } = fakeFetch([]);
    const result = await provider(fn).cancelSubscription("cs_test_prepaid", true);
    expect(result).toMatchObject({ status: "cancelling", billingMode: "prepaid" });
    expect(calls).toHaveLength(0);
  });
});

describe("Stripe object parsing", () => {
  it("maps Stripe statuses", () => {
    expect(mapStripeSubscriptionStatus("active", false)).toBe("active");
    expect(mapStripeSubscriptionStatus("active", true)).toBe("cancelling");
    expect(mapStripeSubscriptionStatus("unpaid", false)).toBe("past_due");
    expect(mapStripeSubscriptionStatus("canceled", false)).toBe("cancelled");
    expect(mapStripeSubscriptionStatus("incomplete_expired", false)).toBe("expired");
    expect(mapStripeSubscriptionStatus("incomplete", false)).toBe("incomplete");
  });

  it("reads the period end from the subscription or, on newer API versions, its items", () => {
    const old = parseStripeSubscription({ id: "sub_1", status: "active", current_period_end: 1_900_000_000 });
    const neu = parseStripeSubscription({
      id: "sub_1",
      status: "active",
      items: { data: [{ current_period_end: 1_900_000_000 }] },
    });
    expect(old.currentPeriodEnd).toBe(new Date(1_900_000_000_000).toISOString());
    expect(neu.currentPeriodEnd).toBe(old.currentPeriodEnd);
  });

  it("finds an invoice's payment intent on old and new API versions", () => {
    expect(paymentIntentFromInvoice({ payment_intent: "pi_1" })).toBe("pi_1");
    expect(paymentIntentFromInvoice({ payments: { data: [{ payment: { payment_intent: { id: "pi_2" } } }] } })).toBe(
      "pi_2",
    );
    expect(paymentIntentFromInvoice({})).toBeNull();
  });
});
