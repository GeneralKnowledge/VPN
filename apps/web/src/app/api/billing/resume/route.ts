import { HttpError, handle } from "@/lib/http";
import { getBillingProvider, getDb } from "@/lib/providers";
import { resumeSubscriptionForUser } from "@/lib/services";
import { requireUser } from "@/lib/auth";
import { correlationId } from "@/lib/utils";

export async function POST() {
  return handle(async () => {
    const user = await requireUser();
    const updated = await resumeSubscriptionForUser(getDb(), getBillingProvider(), user, correlationId());
    if (!updated) throw new HttpError(404, "No cancelling subscription");
    return Response.json({ ok: true, status: updated.status });
  });
}
