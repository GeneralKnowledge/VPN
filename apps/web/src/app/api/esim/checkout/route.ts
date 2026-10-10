import { z } from "zod";
import { requireUser, writeAudit } from "@/lib/auth";
import { createEsimCheckoutOrder } from "@/lib/esim-services";
import { HttpError, handle, parseBody } from "@/lib/http";
import { emailVerificationRequired, getDb, getEnv, getEsimProvider, track } from "@/lib/providers";
import { requireProduct } from "@/lib/product";
import { enforceRateLimit } from "@/lib/rate-limit";
import { correlationId } from "@/lib/utils";

const schema = z.object({ packageCode: z.string().min(1).max(100) });

export async function POST(req: Request) {
  return handle(async () => {
    await requireProduct("esim");
    const user = await requireUser();
    const body = await parseBody(req, schema);
    if (emailVerificationRequired() && !user.emailVerifiedAt) {
      throw new HttpError(403, "Please verify your email address before purchasing.");
    }
    enforceRateLimit("esim-checkout", [`user:${user.id}`], 20, 15 * 60_000);

    const env = getEnv();
    const corr = correlationId();
    const created = await createEsimCheckoutOrder(getDb(), getEsimProvider(), {
      userId: user.id,
      packageCode: body.packageCode,
      billingProvider: env.BILLING_PROVIDER,
      esimProviderKind: env.ESIM_PROVIDER,
      correlationId: corr,
    });

    // Mock: in-app checkout. Stripe one-time Checkout is not wired yet — fail clearly.
    if (env.BILLING_PROVIDER !== "mock") {
      throw new HttpError(
        501,
        "eSIM Stripe Checkout is not wired yet. Keep BILLING_PROVIDER=mock (see docs/PRE-CUTOVER.md) or wait for payment-mode Checkout.",
      );
    }
    // Relative URL keeps the browser on the same host (important for host-scoped cookies /
    // Playwright on 127.0.0.1 vs APP_URL=localhost).
    const url = `/billing/mock-esim-checkout?session_id=${encodeURIComponent(created.checkoutId)}`;

    await writeAudit(getDb(), {
      actorId: user.id,
      actorType: "user",
      action: "esim.checkout.url",
      targetType: "esim_order",
      targetId: created.orderId,
      correlationId: corr,
    });
    track({
      name: "esim_checkout_started",
      userId: user.id,
      properties: { packageCode: body.packageCode, amount: created.amount },
    });

    return Response.json({
      url,
      sessionId: created.checkoutId,
      orderId: created.orderId,
      amount: created.amount,
      currency: created.currency,
    });
  });
}
