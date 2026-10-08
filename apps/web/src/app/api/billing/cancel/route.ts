import { eq } from "drizzle-orm";
import { nextLifecycleAfterCancel, type CustomerLifecycle } from "@northstar/billing";
import { subscriptions, users } from "@northstar/db";
import { z } from "zod";
import { requireUser, writeAudit } from "@/lib/auth";
import { HttpError, handle, readJson } from "@/lib/http";
import { sendEmailSafe } from "@/lib/notify";
import { getBillingProvider, getDb, getEmailProvider, getVpnProvider } from "@/lib/providers";
import { endSubscription } from "@/lib/services";
import { correlationId } from "@/lib/utils";

const schema = z.object({ immediate: z.boolean().optional() });

/**
 * Cancel at period end by default (access until expiry).
 * `immediate: true` ends the subscription now and suspends VPN access.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = schema.parse(await readJson(req).catch(() => ({})));
    const db = getDb();
    const rows = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id));
    const sub = rows.find((s) => ["active", "trialing", "past_due", "cancelling"].includes(s.status));
    if (!sub?.providerSubscriptionId) throw new HttpError(404, "No active subscription");

    const cid = correlationId();
    const atPeriodEnd = !body.immediate;
    if (sub.status === "cancelling" && atPeriodEnd) {
      return Response.json({ ok: true, status: "cancelling", cancelAtPeriodEnd: true });
    }

    const updated = await getBillingProvider().cancelSubscription(sub.providerSubscriptionId, atPeriodEnd);
    if (atPeriodEnd) {
      // Access continues until period end, so the VPN stays on; only the customer lifecycle changes.
      await db
        .update(subscriptions)
        .set({ status: "cancelling", cancelAtPeriodEnd: true, updatedAt: new Date() })
        .where(eq(subscriptions.id, sub.id));
      await db
        .update(users)
        .set({
          lifecycle: nextLifecycleAfterCancel(user.lifecycle as CustomerLifecycle),
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
    } else {
      await endSubscription(db, getVpnProvider(), sub, "cancelled", cid);
    }

    await sendEmailSafe(getEmailProvider(), {
      to: user.email,
      template: "subscription_cancelled",
      vars: { name: user.name ?? "there" },
      correlationId: cid,
    });
    await writeAudit(db, {
      actorId: user.id,
      actorType: "user",
      action: "subscription.cancel_requested",
      targetType: "subscription",
      targetId: sub.id,
      correlationId: cid,
      metadata: { cancelAtPeriodEnd: atPeriodEnd, providerStatus: updated.status },
    });
    return Response.json({
      ok: true,
      status: atPeriodEnd ? "cancelling" : "cancelled",
      cancelAtPeriodEnd: atPeriodEnd,
    });
  });
}
