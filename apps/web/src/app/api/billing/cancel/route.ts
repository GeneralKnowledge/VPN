import { eq } from "drizzle-orm";
import { nextLifecycleAfterCancel, type CustomerLifecycle } from "@northstar/billing";
import { subscriptions, users } from "@northstar/db";
import { requireUser, writeAudit } from "@/lib/auth";
import { customerErrorResponse } from "@/lib/http";
import { getBillingProvider, getDb, getEmailProvider, getVpnProvider } from "@/lib/providers";
import { suspendVpnForUser } from "@/lib/services";
import { correlationId } from "@/lib/utils";

/**
 * Cancel at period end by default (access until expiry).
 * Immediate cancel (cancelAtPeriodEnd=false from provider) suspends VPN.
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as { immediate?: boolean };
    const db = getDb();
    const rows = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id));
    const sub = rows.find((s) => s.status === "active" || s.status === "trialing" || s.status === "cancelling");
    if (!sub?.providerSubscriptionId) {
      return Response.json({ error: "No active subscription" }, { status: 404 });
    }
    const cancelAtPeriodEnd = !body.immediate;
    const updated = await getBillingProvider().cancelSubscription(sub.providerSubscriptionId, cancelAtPeriodEnd);
    await db
      .update(subscriptions)
      .set({
        status: updated.status,
        cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, sub.id));

    const cid = correlationId();
    if (!updated.cancelAtPeriodEnd || updated.status === "cancelled" || updated.status === "expired") {
      await suspendVpnForUser(db, getVpnProvider(), user.id, cid, "system");
    } else {
      // Access continues until period end — mark lifecycle cancelled but keep VPN active
      await db
        .update(users)
        .set({
          lifecycle: nextLifecycleAfterCancel(user.lifecycle as CustomerLifecycle),
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
    }

    await getEmailProvider().send({
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
      metadata: { cancelAtPeriodEnd: updated.cancelAtPeriodEnd },
    });
    return Response.json({ ok: true, status: updated.status, cancelAtPeriodEnd: updated.cancelAtPeriodEnd });
  } catch (err) {
    return customerErrorResponse(err, "generic");
  }
}
