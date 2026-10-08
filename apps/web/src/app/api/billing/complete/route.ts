import { getPlan } from "@northstar/config";
import { checkoutSessions } from "@northstar/db";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireUser, writeAudit } from "@/lib/auth";
import { HttpError, handle, parseBody } from "@/lib/http";
import {
  emailVerificationRequired,
  getBillingProvider,
  getDb,
  getEmailProvider,
  getEnv,
  getVpnProvider,
  track,
} from "@/lib/providers";
import { activateSubscription } from "@/lib/services";
import { correlationId } from "@/lib/utils";

const schema = z.object({ sessionId: z.string().min(1).max(200) });
const CHECKOUT_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Completes a checkout for the in-app mock payment flow only. Real providers confirm payment
 * through signed webhooks; letting a browser "complete" a real checkout would grant service for free.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const body = await parseBody(req, schema);
    if (getEnv().BILLING_PROVIDER !== "mock") {
      throw new HttpError(400, "Payments are confirmed by the payment provider.");
    }
    if (emailVerificationRequired() && !user.emailVerifiedAt) {
      throw new HttpError(403, "Please verify your email address before subscribing.");
    }

    const db = getDb();
    const [checkout] = await db
      .select()
      .from(checkoutSessions)
      .where(eq(checkoutSessions.providerSessionId, body.sessionId))
      .limit(1);
    if (!checkout || checkout.userId !== user.id) throw new HttpError(404, "Checkout not found");

    // A session can only ever activate one subscription; replays (double-click, saved request) are no-ops.
    if (checkout.status === "complete") {
      return Response.json({ ok: true, redirectTo: "/dashboard", alreadyCompleted: true });
    }
    if (checkout.status !== "open" || Date.now() - checkout.createdAt.getTime() > CHECKOUT_TTL_MS) {
      await db
        .update(checkoutSessions)
        .set({ status: "expired", updatedAt: new Date() })
        .where(and(eq(checkoutSessions.id, checkout.id), eq(checkoutSessions.status, "open")));
      throw new HttpError(400, "This checkout has expired. Please start again.");
    }

    // Claim the session atomically so concurrent requests cannot both activate.
    const claimed = await db
      .update(checkoutSessions)
      .set({ status: "complete", updatedAt: new Date() })
      .where(and(eq(checkoutSessions.id, checkout.id), eq(checkoutSessions.status, "open")))
      .returning({ id: checkoutSessions.id });
    if (claimed.length === 0) {
      return Response.json({ ok: true, redirectTo: "/dashboard", alreadyCompleted: true });
    }

    const corr = correlationId();
    try {
      const sub = await getBillingProvider().completeCheckout(body.sessionId);
      const plan = getPlan(checkout.planId);
      await activateSubscription(db, getVpnProvider(), getEmailProvider(), {
        userId: user.id,
        planId: checkout.planId,
        providerSubscriptionId: sub.id,
        provider: "mock",
        amount: plan?.price ?? 0,
        correlationId: corr,
      });
    } catch (err) {
      await db
        .update(checkoutSessions)
        .set({ status: "open", updatedAt: new Date() })
        .where(eq(checkoutSessions.id, checkout.id));
      throw err;
    }

    await writeAudit(db, {
      actorId: user.id,
      actorType: "user",
      action: "checkout.completed",
      targetType: "checkout_session",
      targetId: checkout.providerSessionId,
      correlationId: corr,
    });
    track({ name: "subscription_created", userId: user.id });
    return Response.json({ ok: true, redirectTo: "/dashboard" });
  });
}
