import { describe, expect, it } from "vitest";
import {
  freeMonthsEarned,
  referralsConsumedForReward,
  remainingTowardNextReward,
} from "./referrals";

describe("referral reward math", () => {
  it("grants a free month every 3 paying referrals", () => {
    expect(freeMonthsEarned(0, 3)).toBe(0);
    expect(freeMonthsEarned(2, 3)).toBe(0);
    expect(freeMonthsEarned(3, 3)).toBe(1);
    expect(freeMonthsEarned(5, 3)).toBe(1);
    expect(freeMonthsEarned(6, 3)).toBe(2);
  });

  it("consumes referrals in threshold batches", () => {
    expect(referralsConsumedForReward(1, 3)).toBe(3);
    expect(referralsConsumedForReward(2, 3)).toBe(6);
  });

  it("tracks remaining toward next reward", () => {
    expect(remainingTowardNextReward(0, 3)).toBe(3);
    expect(remainingTowardNextReward(1, 3)).toBe(2);
    expect(remainingTowardNextReward(3, 3)).toBe(3);
  });
});
