import { eq } from "drizzle-orm";
import { subscriptions } from "@northstar/db";
import { requireUser, writeAudit } from "@/lib/auth";
import { getBillingProvider, getDb, getEmailProvider } from "@/lib/providers";
import { correlationId } from "@/lib/utils";

export async function POST() {
  try {
    const user = await requireUser();
    const db = getDb();
    const rows = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id));
    const sub = rows.find((s) => s.status === "active" || s.status === "trialing" || s.status === "cancelling");
    if (!sub?.providerSubscriptionId) {
      return Response.json({ error: "No active subscription" }, { status: 404 });
    }
    const updated = await getBillingProvider().cancelSubscription(sub.providerSubscriptionId, true);
    await db
      .update(subscriptions)
      .set({
        status: updated.status,
        cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, sub.id));
    await getEmailProvider().send({
      to: user.email,
      template: "subscription_cancelled",
      vars: { name: user.name ?? "there" },
      correlationId: correlationId(),
    });
    await writeAudit(db, {
      actorId: user.id,
      actorType: "user",
      action: "subscription.cancel_requested",
      targetType: "subscription",
      targetId: sub.id,
    });
    return Response.json({ ok: true, status: updated.status });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}
