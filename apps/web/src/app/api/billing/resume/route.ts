import { eq } from "drizzle-orm";
import { subscriptions } from "@northstar/db";
import { requireUser, writeAudit } from "@/lib/auth";
import { getBillingProvider, getDb } from "@/lib/providers";

export async function POST() {
  try {
    const user = await requireUser();
    const db = getDb();
    const rows = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id));
    const sub = rows.find((s) => s.status === "cancelling");
    if (!sub?.providerSubscriptionId) {
      return Response.json({ error: "No cancelling subscription" }, { status: 404 });
    }
    const updated = await getBillingProvider().resumeSubscription(sub.providerSubscriptionId);
    await db
      .update(subscriptions)
      .set({ status: updated.status, cancelAtPeriodEnd: false, updatedAt: new Date() })
      .where(eq(subscriptions.id, sub.id));
    await writeAudit(db, {
      actorId: user.id,
      actorType: "user",
      action: "subscription.resumed",
      targetType: "subscription",
      targetId: sub.id,
    });
    return Response.json({ ok: true, status: updated.status });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}
