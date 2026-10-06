import { describe, expect, it } from "vitest";
import { formatPrice, getPlan, plans, purchasablePlans, referralProgram } from "./index";

describe("plans", () => {
  it("exposes active monthly and annual plans", () => {
    expect(plans.filter((p) => p.active).length).toBeGreaterThanOrEqual(2);
    expect(getPlan("premium-monthly")?.billingInterval).toBe("month");
    expect(getPlan("premium-annual")?.billingInterval).toBe("year");
  });

  it("formats GBP prices without fake discounts", () => {
    expect(formatPrice(getPlan("premium-monthly")!)).toBe("£4.99/month");
    expect(formatPrice(getPlan("premium-annual")!)).toBe("£39.99/year");
  });

  it("hides zero-price referral plan from purchasable list", () => {
    expect(purchasablePlans().every((p) => p.price > 0)).toBe(true);
    expect(getPlan("premium-referral")?.price).toBe(0);
  });

  it("configures referral threshold", () => {
    expect(referralProgram.payingReferralsRequired).toBeGreaterThan(0);
    expect(referralProgram.rewardPlanId).toBe("premium-referral");
  });
});
