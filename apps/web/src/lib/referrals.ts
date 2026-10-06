import { getPlan, referralProgram } from "@northstar/config";
import { referrals, subscriptions, users, type Db } from "@northstar/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { EmailProvider } from "@northstar/email";
import { writeAudit } from "./auth";
import { newId } from "./utils";

export type LeaderboardEntry = {
  rank: number;
  displayName: string;
  payingReferrals: number;
  isYou?: boolean;
};

/** Pure helper — how many reward batches for N converted-not-yet-rewarded referrals. */
export function freeMonthsEarned(
  convertedUnrewarded: number,
  required = referralProgram.payingReferralsRequired,
): number {
  if (required <= 0) return 0;
  return Math.floor(convertedUnrewarded / required);
}

export function referralsConsumedForReward(
  batches: number,
  required = referralProgram.payingReferralsRequired,
): number {
  return batches * required;
}

export function remainingTowardNextReward(
  convertedUnrewarded: number,
  required = referralProgram.payingReferralsRequired,
): number {
  if (required <= 0) return 0;
  const mod = convertedUnrewarded % required;
  return mod === 0 ? required : required - mod;
}

export type ReferralRewardResult =
  | { granted: false; months: 0; remainingTowardNext: number }
  | { granted: true; months: number; subscriptionId: string; referrerUserId: string };

/**
 * When a referred user becomes a paying customer, mark their referral converted
 * and evaluate whether the referrer has earned free Premium.
 * Does not provision VPN — caller should provision the referrer if granted.
 */
export async function onReferredUserPaid(
  db: Db,
  email: EmailProvider,
  referredUserId: string,
  correlationId: string,
): Promise<{ converted: boolean; reward: ReferralRewardResult }> {
  const [row] = await db
    .select()
    .from(referrals)
    .where(and(eq(referrals.referredUserId, referredUserId), eq(referrals.status, "pending")))
    .limit(1);

  if (!row) {
    return {
      converted: false,
      reward: {
        granted: false,
        months: 0,
        remainingTowardNext: referralProgram.payingReferralsRequired,
      },
    };
  }

  await db
    .update(referrals)
    .set({
      status: "converted",
      convertedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(referrals.id, row.id));

  await writeAudit(db, {
    actorId: referredUserId,
    actorType: "user",
    action: "referral.converted",
    targetType: "referral",
    targetId: row.id,
    correlationId,
    metadata: { referrerUserId: row.referrerUserId },
  });

  const reward = await grantReferralRewardsIfEligible(db, email, row.referrerUserId, correlationId);
  return { converted: true, reward };
}

export async function grantReferralRewardsIfEligible(
  db: Db,
  email: EmailProvider,
  referrerUserId: string,
  correlationId: string,
): Promise<ReferralRewardResult> {
  const converted = await db
    .select()
    .from(referrals)
    .where(and(eq(referrals.referrerUserId, referrerUserId), eq(referrals.status, "converted")))
    .orderBy(referrals.convertedAt);

  const batches = freeMonthsEarned(converted.length);
  if (batches <= 0) {
    return {
      granted: false,
      months: 0,
      remainingTowardNext: remainingTowardNextReward(converted.length),
    };
  }

  const consume = referralsConsumedForReward(batches);
  const toReward = converted.slice(0, consume);
  const monthsGranted = batches * referralProgram.rewardMonths;
  const rewardMeta = {
    type: "free_premium_months",
    months: monthsGranted,
    planId: referralProgram.rewardPlanId,
    threshold: referralProgram.payingReferralsRequired,
  };

  for (const ref of toReward) {
    await db
      .update(referrals)
      .set({
        status: "rewarded",
        rewardJson: JSON.stringify(rewardMeta),
        updatedAt: new Date(),
      })
      .where(eq(referrals.id, ref.id));
  }

  const plan = getPlan(referralProgram.rewardPlanId);
  if (!plan) throw new Error("Referral reward plan missing from config");

  const existingSubs = await db.select().from(subscriptions).where(eq(subscriptions.userId, referrerUserId));
  const active = existingSubs.find(
    (s) => s.status === "active" || s.status === "trialing" || s.status === "cancelling",
  );

  const periodEnd = new Date(
    active?.currentPeriodEnd && active.currentPeriodEnd.getTime() > Date.now()
      ? active.currentPeriodEnd.getTime()
      : Date.now(),
  );
  periodEnd.setMonth(periodEnd.getMonth() + monthsGranted);

  let subscriptionId = active?.id;
  if (active) {
    await db
      .update(subscriptions)
      .set({
        planId: referralProgram.rewardPlanId,
        status: "active",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: periodEnd,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, active.id));
  } else {
    subscriptionId = newId("sub");
    await db.insert(subscriptions).values({
      id: subscriptionId,
      userId: referrerUserId,
      planId: referralProgram.rewardPlanId,
      status: "active",
      provider: "mock",
      providerSubscriptionId: `referral_reward_${subscriptionId}`,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    });
  }

  await db
    .update(users)
    .set({ lifecycle: "active", updatedAt: new Date() })
    .where(eq(users.id, referrerUserId));

  const [referrer] = await db.select().from(users).where(eq(users.id, referrerUserId)).limit(1);
  if (referrer) {
    await email.send({
      to: referrer.email,
      template: "subscription_started",
      vars: {
        name: referrer.name ?? "there",
        planName: `${plan.name} — ${monthsGranted} month(s) on us`,
      },
      correlationId,
    });
  }

  await writeAudit(db, {
    actorId: "system",
    actorType: "system",
    action: "referral.reward_granted",
    targetType: "user",
    targetId: referrerUserId,
    correlationId,
    metadata: { ...rewardMeta, subscriptionId },
  });

  return {
    granted: true,
    months: monthsGranted,
    subscriptionId: subscriptionId!,
    referrerUserId,
  };
}

export async function getReferralStats(db: Db, userId: string) {
  const mine = await db.select().from(referrals).where(eq(referrals.referrerUserId, userId));
  const pending = mine.filter((r) => r.status === "pending").length;
  const converted = mine.filter((r) => r.status === "converted").length;
  const rewarded = mine.filter((r) => r.status === "rewarded").length;
  const paying = converted + rewarded;
  const towardNext = converted;
  const neededForNextReward = Math.max(0, referralProgram.payingReferralsRequired - towardNext);

  return {
    pending,
    converted,
    rewarded,
    paying,
    towardNext,
    neededForNextReward,
    required: referralProgram.payingReferralsRequired,
    rewardMonths: referralProgram.rewardMonths,
  };
}

export async function getReferralLeaderboard(
  db: Db,
  opts?: { limit?: number; viewerUserId?: string },
): Promise<LeaderboardEntry[]> {
  const limit = opts?.limit ?? referralProgram.leaderboardSize;

  const rows = await db
    .select({
      referrerUserId: referrals.referrerUserId,
      payingReferrals: sql<number>`count(*)`.mapWith(Number),
    })
    .from(referrals)
    .where(inArray(referrals.status, ["converted", "rewarded"]))
    .groupBy(referrals.referrerUserId)
    .orderBy(desc(sql`count(*)`))
    .limit(limit);

  if (rows.length === 0) return [];

  const userIds = rows.map((r) => r.referrerUserId);
  const people = await db.select().from(users).where(inArray(users.id, userIds));
  const byId = new Map(people.map((u) => [u.id, u]));

  return rows.map((r, index) => {
    const u = byId.get(r.referrerUserId);
    const first = u?.name?.trim().split(/\s+/)[0];
    return {
      rank: index + 1,
      displayName: first || "Northstar member",
      payingReferrals: r.payingReferrals,
      isYou: opts?.viewerUserId === r.referrerUserId,
    };
  });
}
