import { describe, expect, it } from "vitest";
import { flagEmoji, formatDate, formatDateTime, formatMoney } from "./format";
import { activityLabel, invoiceStatus, subscriptionStatus } from "./labels";

describe("format helpers", () => {
  it("renders flags for valid codes and a globe otherwise", () => {
    expect(flagEmoji("gb")).toBe("🇬🇧");
    expect(flagEmoji("")).toBe("🌐");
    expect(flagEmoji(undefined)).toBe("🌐");
    expect(flagEmoji("1!")).toBe("🌐");
  });

  it("formats dates deterministically in UTC and tolerates missing values", () => {
    expect(formatDate(new Date("2026-03-04T23:30:00Z"))).toBe("4 Mar 2026");
    expect(formatDate(null)).toBe("—");
    expect(formatDate("not a date")).toBe("—");
    expect(formatDateTime(new Date("2026-03-04T09:05:00Z"))).toContain("4 Mar 2026");
  });

  it("formats minor units as currency", () => {
    expect(formatMoney(499, "GBP")).toBe("£4.99");
    expect(formatMoney(1200, "gbp")).toBe("£12.00");
  });
});

describe("labels", () => {
  it("maps known audit actions and falls back to readable text", () => {
    expect(activityLabel("auth.login")).toBe("Signed in");
    expect(activityLabel("some.new_action")).toBe("Some new action");
  });

  it("maps subscription and invoice statuses to labels and tones", () => {
    expect(subscriptionStatus("past_due")).toEqual({ label: "Payment overdue", tone: "danger" });
    expect(subscriptionStatus("weird").label).toBe("weird");
    expect(invoiceStatus("paid").tone).toBe("success");
  });
});
