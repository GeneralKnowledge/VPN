import { eq } from "drizzle-orm";
import { webhookEvents } from "@northstar/db";
import { writeAudit } from "@/lib/auth";
import { getBillingProvider, getDb, getEmailProvider, getVpnProvider } from "@/lib/providers";
import { activateSubscription } from "@/lib/services";
import { correlationId, newId } from "@/lib/utils";
import { getPlan } from "@northstar/config";

export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("stripe-signature") ?? req.headers.get("x-northstar-signature");
  const billing = getBillingProvider();
  const event = await billing.verifyWebhook(raw, signature);
  if (!event.signatureValid && process.env.APP_ENV === "production") {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const db = getDb();
  const existing = await db
    .select()
    .from(webhookEvents)
    .where(eq(webhookEvents.eventId, event.id))
    .limit(1);
  if (existing[0]?.processedAt) {
    return Response.json({ ok: true, deduped: true });
  }

  const rowId = existing[0]?.id ?? newId("wh");
  if (!existing[0]) {
    await db.insert(webhookEvents).values({
      id: rowId,
      provider: "stripe",
      eventId: event.id,
      eventType: event.type,
      payloadJson: raw,
      signatureValid: event.signatureValid,
    });
  }

  const corr = correlationId();
  try {
    const data = event.data as {
      type?: string;
      data?: { object?: { metadata?: { userId?: string; planId?: string }; id?: string; amount_paid?: number } };
      userId?: string;
      planId?: string;
      subscriptionId?: string;
    };
    const type = event.type;
    if (type === "checkout.session.completed" || type === "mock.checkout.completed") {
      const userId = data.userId ?? data.data?.object?.metadata?.userId;
      const planId = data.planId ?? data.data?.object?.metadata?.planId ?? "premium-monthly";
      const subId = data.subscriptionId ?? data.data?.object?.id ?? newId("sub_ext");
      if (userId) {
        const plan = getPlan(planId);
        await activateSubscription(db, getVpnProvider(), getEmailProvider(), {
          userId,
          planId,
          providerSubscriptionId: subId,
          provider: process.env.BILLING_PROVIDER === "stripe" ? "stripe" : "mock",
          amount: plan?.price ?? data.data?.object?.amount_paid ?? 0,
          correlationId: corr,
        });
      }
    }
    if (type === "invoice.payment_failed" || type === "mock.payment_failed") {
      // lifecycle handled by dedicated job — record audit
      await writeAudit(db, {
        actorType: "webhook",
        action: "billing.payment_failed",
        targetType: "webhook_event",
        targetId: event.id,
        correlationId: corr,
      });
    }

    await db
      .update(webhookEvents)
      .set({ processedAt: new Date(), updatedAt: new Date() })
      .where(eq(webhookEvents.id, rowId));

    return Response.json({ ok: true });
  } catch (err) {
    await db
      .update(webhookEvents)
      .set({
        processingError: err instanceof Error ? err.message : "error",
        updatedAt: new Date(),
      })
      .where(eq(webhookEvents.id, rowId));
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }
}
