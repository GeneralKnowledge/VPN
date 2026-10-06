import { describe, expect, it } from "vitest";
import {
  canProvisionVpn,
  nextLifecycleAfterPayment,
  nextLifecycleAfterPaymentFailed,
} from "@northstar/billing";

describe("permissions & lifecycle gates", () => {
  it("does not allow VPN provision when past_due", () => {
    expect(canProvisionVpn("subscribed", "past_due")).toBe(false);
  });

  it("allows provision when subscribed + active", () => {
    expect(canProvisionVpn("subscribed", "active")).toBe(true);
  });

  it("moves active to grace_period on payment failure", () => {
    expect(nextLifecycleAfterPaymentFailed("active")).toBe("grace_period");
  });

  it("payment success from lead yields subscribed", () => {
    expect(nextLifecycleAfterPayment("lead")).toBe("subscribed");
  });
});
