import { describe, expect, it } from "vitest";
import {
  canProvisionVpn,
  createBillingProvider,
  CryptoBillingProvider,
  MockBillingProvider,
  StripeBillingProvider,
  nextLifecycleAfterCancel,
  nextLifecycleAfterPayment,
  nextLifecycleAfterPaymentFailed,
  nextLifecycleAfterVpnProvisioned,
  periodEndFrom,
} from "./index";

describe("subscription lifecycle", () => {
  it("moves lead toward subscribed then provisioned then active", () => {
    expect(nextLifecycleAfterPayment("lead")).toBe("subscribed");
    expect(nextLifecycleAfterVpnProvisioned("subscribed")).toBe("vpn_provisioned");
    expect(nextLifecycleAfterVpnProvisioned("vpn_provisioned")).toBe("active");
  });

  it("handles payment failure and cancel paths", () => {
    expect(nextLifecycleAfterPaymentFailed("active")).toBe("grace_period");
    expect(nextLifecycleAfterPaymentFailed("grace_period")).toBe("suspended");
    expect(nextLifecycleAfterCancel("active")).toBe("cancelled");
  });

  it("gates VPN provisioning on billing status", () => {
    expect(canProvisionVpn("subscribed", "active")).toBe(true);
    expect(canProvisionVpn("subscribed", "past_due")).toBe(false);
    expect(canProvisionVpn("suspended", "active")).toBe(false);
  });
});

describe("MockBillingProvider", () => {
  it("creates checkout idempotently and completes subscription", async () => {
    const billing = new MockBillingProvider("test-webhook-secret");
    const a = await billing.createCheckout({
      customerId: "u1",
      customerEmail: "a@test.local",
      planId: "platinum-monthly",
      billingMode: "subscription",
      billingInterval: "month",
      amount: 499,
      paymentRail: "stripe",
      successUrl: "http://localhost/success",
      cancelUrl: "http://localhost/cancel",
      idempotencyKey: "key-1",
    });
    const b = await billing.createCheckout({
      customerId: "u1",
      customerEmail: "a@test.local",
      planId: "platinum-monthly",
      billingMode: "subscription",
      billingInterval: "month",
      amount: 499,
      paymentRail: "stripe",
      successUrl: "http://localhost/success",
      cancelUrl: "http://localhost/cancel",
      idempotencyKey: "key-1",
    });
    expect(a.id).toBe(b.id);
    const sub = await billing.completeCheckout(a.id);
    expect(sub.status).toBe("active");
    expect(sub.billingMode).toBe("subscription");
    expect(sub.cancelAtPeriodEnd).toBe(false);
    const cancelled = await billing.cancelSubscription(sub.id, true);
    expect(cancelled.status).toBe("cancelling");
  });

  it("completes crypto year as prepaid that simply runs until period end", async () => {
    const billing = new MockBillingProvider("test-webhook-secret", "crypto");
    const session = await billing.createCheckout({
      customerId: "u2",
      customerEmail: "b@test.local",
      planId: "bronze-annual",
      billingMode: "prepaid",
      billingInterval: "year",
      amount: 3999,
      paymentRail: "crypto",
      successUrl: "http://localhost/success",
      cancelUrl: "http://localhost/cancel",
    });
    const sub = await billing.completeCheckout(session.id);
    expect(sub.billingMode).toBe("prepaid");
    expect(sub.cancelAtPeriodEnd).toBe(true);
    expect(sub.provider).toBe("crypto");
    const end = new Date(sub.currentPeriodEnd).getTime();
    const expected = periodEndFrom(new Date(), "year").getTime();
    expect(Math.abs(end - expected)).toBeLessThan(5_000);
    await expect(billing.resumeSubscription(sub.id)).rejects.toMatchObject({ code: "validation" });
  });

  it("keeps Stripe annual renewing (not the same as crypto year)", async () => {
    const billing = new MockBillingProvider("sec");
    const session = await billing.createCheckout({
      customerId: "u3",
      customerEmail: "c@test.local",
      planId: "platinum-annual",
      billingMode: "subscription",
      billingInterval: "year",
      amount: 3999,
      paymentRail: "stripe",
      successUrl: "http://localhost/success",
      cancelUrl: "http://localhost/cancel",
    });
    const sub = await billing.completeCheckout(session.id);
    expect(sub.billingMode).toBe("subscription");
    expect(sub.cancelAtPeriodEnd).toBe(false);
  });

  it("hydrates seeded sub_mock_* ids after process restart", async () => {
    const billing = new MockBillingProvider("test-webhook-secret");
    const cancelled = await billing.cancelSubscription("sub_mock_seeded_from_db", true);
    expect(cancelled.id).toBe("sub_mock_seeded_from_db");
    expect(cancelled.status).toBe("cancelling");
    const resumed = await billing.resumeSubscription("sub_mock_seeded_from_db");
    expect(resumed.status).toBe("active");
  });

  it("rejects forgeable mock webhook signatures (null / mock_ / wrong secret)", async () => {
    const locked = new MockBillingProvider("super-secret-webhook");
    const payload = JSON.stringify({
      id: "evt_forge",
      type: "mock.checkout.completed",
      userId: "victim_user",
      planId: "platinum-monthly",
    });

    expect((await locked.verifyWebhook(payload, null)).signatureValid).toBe(false);
    expect((await locked.verifyWebhook(payload, "mock_anything")).signatureValid).toBe(false);
    expect((await locked.verifyWebhook(payload, "dev")).signatureValid).toBe(false);
    expect((await locked.verifyWebhook(payload, "wrong")).signatureValid).toBe(false);
    expect((await locked.verifyWebhook(payload, "super-secret-webhook")).signatureValid).toBe(true);

    const open = new MockBillingProvider("");
    expect((await open.verifyWebhook(payload, null)).signatureValid).toBe(false);
    expect((await open.verifyWebhook(payload, "dev")).signatureValid).toBe(false);
  });

  it("selects providers", () => {
    expect(createBillingProvider("mock")).toBeInstanceOf(MockBillingProvider);
    expect(createBillingProvider("mock", { webhookSecret: "x" })).toBeInstanceOf(MockBillingProvider);
    expect(createBillingProvider("crypto")).toBeInstanceOf(CryptoBillingProvider);
    expect(createBillingProvider("stripe", { secretKey: "sk" })).toBeInstanceOf(StripeBillingProvider);
  });
});

describe("StripeBillingProvider webhook stub", () => {
  it("never marks forgeable t= signatures as valid before SDK wiring", async () => {
    const stripe = new StripeBillingProvider({
      secretKey: "sk_test",
      webhookSecret: "whsec_test",
      priceMap: {},
    });
    const event = await stripe.verifyWebhook(
      JSON.stringify({ id: "evt_1", type: "checkout.session.completed" }),
      "t=123,v1=abcdef",
    );
    expect(event.signatureValid).toBe(false);
  });
});

describe("subscription helpers", () => {
  it("keeps access for paid-through cancelling subscriptions", () => {
    expect(canProvisionVpn("cancelled", "cancelling")).toBe(true);
    expect(canProvisionVpn("cancelled", "cancelled")).toBe(false);
    expect(canProvisionVpn("subscribed", "cancelling")).toBe(true);
  });

  it("restores lifecycle when a cancelling subscription is resumed", async () => {
    const { nextLifecycleAfterResume, isLiveSubscriptionStatus } = await import("./index");
    expect(nextLifecycleAfterResume("cancelled", true)).toBe("active");
    expect(nextLifecycleAfterResume("cancelled", false)).toBe("subscribed");
    expect(nextLifecycleAfterResume("suspended", true)).toBe("suspended");
    expect(isLiveSubscriptionStatus("past_due")).toBe(true);
    expect(isLiveSubscriptionStatus("expired")).toBe(false);
  });
});
