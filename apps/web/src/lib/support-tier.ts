import { desc, eq } from "drizzle-orm";
import {
  getPlan,
  supportTicketLimitPerHour,
  tierMeta,
  type SupportLevel,
} from "@northstar/config";
import { subscriptions, type Db } from "@northstar/db";
import { isLiveSubscriptionStatus } from "@northstar/billing";

/** Resolve support level from the customer's live plan (default: basic for unpaid). */
export async function supportLevelForUser(db: Db, userId: string): Promise<{
  level: SupportLevel;
  note: string;
  planId: string | null;
}> {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .orderBy(desc(subscriptions.createdAt));
  const live = rows.find((s) => isLiveSubscriptionStatus(s.status));
  const plan = live ? getPlan(live.planId) : undefined;
  if (!plan) {
    return {
      level: "basic",
      note: "Without a paid plan, ticket help is limited. Guides cover most setup questions.",
      planId: null,
    };
  }
  return {
    level: plan.supportLevel,
    note: tierMeta[plan.tier].supportNote,
    planId: plan.id,
  };
}

export function ticketLimitForLevel(level: SupportLevel): number {
  return supportTicketLimitPerHour[level];
}
