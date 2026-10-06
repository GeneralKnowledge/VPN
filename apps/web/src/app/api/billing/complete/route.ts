import { getPlan } from "@northstar/config";
import { checkoutSessions } from "@northstar/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser, writeAudit } from "@/lib/auth";
import { getBillingProvider, getDb, getEmailProvider, getVpnProvider, track } from "@/lib/providers";
import { activateSubscription } from "@/lib/services";
import { correlationId } from "@/lib/utils";

const schema = z.object({ sessionId: z.string() });

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = schema.safeParse(await req.json());
    if (!body.success) return Response.json({ error: "Invalid session" }, { status: 400 });

    const db = getDb();
    const rows = await db
      .select()
      .from(checkoutSessions)
      .where(eq(checkoutSessions.providerSessionId, body.data.sessionId))
      .limit(1);
    const checkout = rows[0];
    if (!checkout || checkout.userId !== user.id) {
      return Response.json({ error: "Checkout not found" }, { status: 404 });
    }

    const billing = getBillingProvider();
    // Prefer DB plan id — mock provider may have reconstructed a placeholder session
    let sub;
    try {
      sub = await billing.completeCheckout(body.data.sessionId);
    } catch {
      // Recreate checkout in mock provider from persisted DB row, then complete
      const recreated = await billing.createCheckout({
        customerId: user.id,
        customerEmail: user.email,
        planId: checkout.planId,
        successUrl: "http://localhost/success",
        cancelUrl: "http://localhost/cancel",
        idempotencyKey: `recover_${checkout.providerSessionId}`,
      });
      // Force-complete using recovered session; activate uses DB planId below
      sub = await billing.completeCheckout(recreated.id).catch(async () =>
        billing.completeCheckout(body.data.sessionId),
      );
    }
    sub = { ...sub, planId: checkout.planId, customerId: user.id };
    await db
      .update(checkoutSessions)
      .set({ status: "complete", updatedAt: new Date() })
      .where(eq(checkoutSessions.id, checkout.id));

    const plan = getPlan(checkout.planId);
    const corr = correlationId();
    await activateSubscription(db, getVpnProvider(), getEmailProvider(), {
      userId: user.id,
      planId: checkout.planId,
      providerSubscriptionId: sub.id,
      provider: "mock",
      amount: plan?.price ?? 0,
      correlationId: corr,
    });

    await writeAudit(db, {
      actorId: user.id,
      actorType: "user",
      action: "checkout.completed",
      targetType: "subscription",
      targetId: sub.id,
      correlationId: corr,
    });
    track({ name: "subscription_created", userId: user.id });
    track({ name: "vpn_provisioned", userId: user.id });
    return Response.json({ ok: true, redirectTo: "/dashboard/get-connected" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Completion failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
