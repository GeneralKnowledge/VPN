import { describe, expect, it } from "vitest";
import { formatPrice, getPlan, plans, plansForTier, resolvePlanId, tierMeta } from "./index";

describe("plans", () => {
  it("exposes every access tier with month and year options", () => {
    for (const tier of Object.keys(tierMeta) as Array<keyof typeof tierMeta>) {
      expect(plansForTier(tier).map((p) => p.billingInterval).sort()).toEqual(["month", "year"]);
    }
    expect(plans.filter((p) => p.active).length).toBe(10);
  });

  it("keeps Platinum Stripe as renewing subscriptions", () => {
    expect(getPlan("platinum-monthly")).toMatchObject({
      billingMode: "subscription",
      paymentRail: "stripe",
      identityMode: "email",
      supportLevel: "full",
    });
    expect(getPlan("platinum-annual")?.billingMode).toBe("subscription");
  });

  it("treats crypto year as prepaid one-off, distinct from Stripe year", () => {
    const stripeYear = getPlan("platinum-annual")!;
    const cryptoYear = getPlan("bronze-annual")!;
    expect(stripeYear.billingMode).toBe("subscription");
    expect(cryptoYear.billingMode).toBe("prepaid");
    expect(cryptoYear.paymentRail).toBe("crypto");
    expect(formatPrice(stripeYear)).toBe("£39.99/year");
    expect(formatPrice(cryptoYear)).toBe("£39.99 for 1 year");
  });

  it("resolves legacy premium ids to Platinum", () => {
    expect(resolvePlanId("premium-monthly")).toBe("platinum-monthly");
    expect(getPlan("premium-annual")?.id).toBe("platinum-annual");
  });

  it("formats subscription GBP prices without fake discounts", () => {
    expect(formatPrice(getPlan("platinum-monthly")!)).toBe("£4.99/month");
  });

  it("marks Iron as self-serve username + crypto", () => {
    expect(getPlan("iron-annual")).toMatchObject({
      identityMode: "username",
      paymentRail: "crypto",
      billingMode: "prepaid",
      supportLevel: "self_serve",
    });
  });
});
