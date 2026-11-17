import { and, eq, isNull } from "drizzle-orm";
import { isLiveSubscriptionStatus } from "@northstar/billing";
import { getPlan } from "@northstar/config";
import { devices, subscriptions, vpnAccounts } from "@northstar/db";
import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/http";
import { getDb } from "@/lib/providers";
import { getDeviceLimit } from "@/lib/services";

/**
 * Everything the app's home screen needs in one call: who is signed in, their plan, whether the
 * VPN account is ready, and how many devices they can still add. No provider ids or secrets.
 */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const db = getDb();
    const subs = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id));
    const live = subs.find((s) => isLiveSubscriptionStatus(s.status));
    const plan = live ? getPlan(live.planId) : undefined;
    const [account] = await db.select().from(vpnAccounts).where(eq(vpnAccounts.userId, user.id)).limit(1);
    const active = await db
      .select({ id: devices.id })
      .from(devices)
      .where(and(eq(devices.userId, user.id), isNull(devices.revokedAt)));

    return Response.json(
      {
        user: { username: user.username, email: user.email, name: user.name },
        subscription: live
          ? {
              planId: live.planId,
              planName: plan?.name ?? live.planId,
              status: live.status,
              billingMode: live.billingMode,
              renews: live.billingMode === "subscription" && !live.cancelAtPeriodEnd,
              currentPeriodEnd: live.currentPeriodEnd?.toISOString() ?? null,
            }
          : null,
        vpn: { status: account?.status ?? "none", ready: account?.status === "active" },
        devices: { active: active.length, limit: await getDeviceLimit(db, user.id) },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  });
}
