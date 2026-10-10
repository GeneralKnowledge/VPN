import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { completeEsimOrder } from "@/lib/esim-services";
import { HttpError, handle, parseBody } from "@/lib/http";
import { emailVerificationRequired, getDb, getEmailProvider, getEnv, getEsimProvider, track } from "@/lib/providers";
import { getProduct } from "@/lib/product";
import { correlationId } from "@/lib/utils";

const schema = z.object({ sessionId: z.string().min(1).max(200) });

/** Completes a one-time eSIM purchase for the mock payment flow only. */
export async function POST(req: Request) {
  return handle(async () => {
    if ((await getProduct()) !== "esim") {
      throw new HttpError(404, "Not available on this host");
    }
    const user = await requireUser();
    const body = await parseBody(req, schema);
    if (getEnv().BILLING_PROVIDER !== "mock") {
      throw new HttpError(400, "Payments are confirmed by the payment provider.");
    }
    if (emailVerificationRequired() && !user.emailVerifiedAt) {
      throw new HttpError(403, "Please verify your email address before purchasing.");
    }

    const corr = correlationId();
    const result = await completeEsimOrder(getDb(), getEsimProvider(), getEmailProvider(), {
      checkoutId: body.sessionId,
      userId: user.id,
      correlationId: corr,
    });

    track({ name: "esim_issued", userId: user.id, properties: { orderId: result.order.id } });
    return Response.json({
      ok: true,
      redirectTo: "/dashboard/esim",
      alreadyCompleted: result.alreadyCompleted,
      orderId: result.order.id,
    });
  });
}
