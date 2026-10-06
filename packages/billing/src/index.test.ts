import { describe, expect, it } from "vitest";
import {
  canProvisionVpn,
  createBillingProvider,
  MockBillingProvider,
  nextLifecycleAfterCancel,
  nextLifecycleAfterPayment,
  nextLifecycleAfterPaymentFailed,
  nextLifecycleAfterVpnProvisioned,
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
    const billing = new MockBillingProvider();
    const a = await billing.createCheckout({
      customerId: "u1",
      customerEmail: "a@test.local",
      planId: "premium-monthly",
      successUrl: "http://localhost/success",
      cancelUrl: "http://localhost/cancel",
      idempotencyKey: "key-1",
    });
    const b = await billing.createCheckout({
      customerId: "u1",
      customerEmail: "a@test.local",
      planId: "premium-monthly",
      successUrl: "http://localhost/success",
      cancelUrl: "http://localhost/cancel",
      idempotencyKey: "key-1",
    });
    expect(a.id).toBe(b.id);
    const sub = await billing.completeCheckout(a.id);
    expect(sub.status).toBe("active");
    const cancelled = await billing.cancelSubscription(sub.id, true);
    expect(cancelled.status).toBe("cancelling");
  });

  it("selects providers", () => {
    expect(createBillingProvider("mock")).toBeInstanceOf(MockBillingProvider);
  });
});
