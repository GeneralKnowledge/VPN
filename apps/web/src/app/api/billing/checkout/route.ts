import { getPlan } from "@northstar/config";
import { checkoutSessions, subscriptions } from "@northstar/db";
import { isLiveSubscriptionStatus } from "@northstar/billing";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser, writeAudit } from "@/lib/auth";
import { HttpError, handle, parseBody } from "@/lib/http";
import { appUrl, emailVerificationRequired, getBillingProviderForPlan, getDb, track } from "@/lib/providers";
import { enforceRateLimit } from "@/lib/rate-limit";
import { correlationId, newId } from "@/lib/utils";

const schema = z.object({ planId: z.string().min(1).max(100) });

export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await parseBody(req, schema);
    const plan = getPlan(body.planId);
    if (!plan) throw new HttpError(404, "Plan not found");

    if (plan.identityMode === "email") {
      if (!user.email) {
        throw new HttpError(400, "This plan needs an email on your account. Register with email or choose a username-only plan.");
      }
      if (emailVerificationRequired() && !user.emailVerifiedAt) {
        throw new HttpError(403, "Please verify your email address before paying.");
      }
    }

    enforceRateLimit("checkout", [`user:${user.id}`], 10, 15 * 60_000);

    const db = getDb();
    const existing = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id));
    if (existing.some((s) => isLiveSubscriptionStatus(s.status))) {
      throw new HttpError(409, "You already have an active subscription.");
    }

    const idempotencyKey = `checkout_${user.id}_${plan.id}_${newId("k")}`;
    const session = await getBillingProviderForPlan(plan).createCheckout({
      customerId: user.id,
      customerEmail: user.email,
      planId: plan.id,
      billingMode: plan.billingMode,
      billingInterval: plan.billingInterval,
      amount: plan.price,
      paymentRail: plan.paymentRail,
      successUrl: `${appUrl()}/dashboard?checkout=success`,
      cancelUrl: `${appUrl()}/dashboard/billing?checkout=cancel`,
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
      metadata: {
        planId: plan.id,
        tier: plan.tier,
        billingMode: plan.billingMode,
        paymentRail: plan.paymentRail,
      },
    });
    track({
      name: "checkout_started",
      userId: user.id,
      properties: { planId: plan.id, tier: plan.tier, billingMode: plan.billingMode },
    });
    return Response.json({ url: session.url, sessionId: session.id });
  });
}
