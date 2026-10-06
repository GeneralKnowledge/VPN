import { getPlan } from "@northstar/config";
import { checkoutSessions } from "@northstar/db";
import { z } from "zod";
import { requireUser, writeAudit } from "@/lib/auth";
import { getBillingProvider, getDb, track } from "@/lib/providers";
import { correlationId, newId } from "@/lib/utils";

const schema = z.object({ planId: z.string() });

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = schema.safeParse(await req.json());
    if (!body.success) return Response.json({ error: "Invalid plan" }, { status: 400 });
    const plan = getPlan(body.data.planId);
    if (!plan) return Response.json({ error: "Plan not found" }, { status: 404 });

    const billing = getBillingProvider();
    const db = getDb();
    const idempotencyKey = `checkout_${user.id}_${plan.id}`;
    const session = await billing.createCheckout({
      customerId: user.id,
      customerEmail: user.email,
      planId: plan.id,
      successUrl: `${process.env.APP_URL ?? "http://localhost:3000"}/dashboard?checkout=success`,
      cancelUrl: `${process.env.APP_URL ?? "http://localhost:3000"}/dashboard/billing?checkout=cancel`,
      idempotencyKey,
    });

    await db.insert(checkoutSessions).values({
      id: newId("chk"),
      userId: user.id,
      planId: plan.id,
      providerSessionId: session.id,
      status: "open",
      idempotencyKey,
    });

    await writeAudit(db, {
      actorId: user.id,
      actorType: "user",
      action: "checkout.started",
      targetType: "checkout_session",
      targetId: session.id,
      correlationId: correlationId(),
      metadata: { planId: plan.id },
    });
    track({ name: "checkout_started", userId: user.id, properties: { planId: plan.id } });
    return Response.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Checkout failed";
    return Response.json({ error: message }, { status: 401 });
  }
}
