import { z } from "zod";
import { requireUser, writeAudit } from "@/lib/auth";
import { createEsimCheckoutOrder } from "@/lib/esim-services";
import { HttpError, handle, parseBody } from "@/lib/http";
import {
  appUrl,
  emailVerificationRequired,
  getDb,
  getEnv,
  getEsimProvider,
  getOneTimePayments,
  track,
} from "@/lib/providers";
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
    const base = appUrl("esim");
    // Stripe: hosted Checkout in payment mode; the signed webhook confirms payment and issues.
    // Mock: the in-app mock checkout page. Relative mock URLs keep the browser on the same host.
    const created = await createEsimCheckoutOrder(getDb(), getEsimProvider(), {
      userId: user.id,
      packageCode: body.packageCode,
      billingProvider: env.BILLING_PROVIDER,
      esimProviderKind: env.ESIM_PROVIDER,
      correlationId: corr,
      payments: env.BILLING_PROVIDER === "stripe" ? getOneTimePayments() : undefined,
      successUrl: `${base}/dashboard/esim?checkout=success`,
      cancelUrl: `${base}/pricing?checkout=cancelled`,
    });
    const url = created.url;

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
