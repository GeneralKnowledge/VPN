import { HttpError, handle } from "@/lib/http";
import { getBillingProvider, getDb, getVpnProvider } from "@/lib/providers";
import { resumeSubscriptionForUser, syncProviderExpiry } from "@/lib/services";
import { requireUser } from "@/lib/auth";
import { correlationId } from "@/lib/utils";

export async function POST() {
  return handle(async () => {
    const user = await requireUser();
    const cid = correlationId();
    const updated = await resumeSubscriptionForUser(getDb(), getBillingProvider(), user, cid);
    if (!updated) throw new HttpError(404, "No cancelling subscription");
    // Renewing again: restore the grace window on the provider-side expiry.
    await syncProviderExpiry(getDb(), getVpnProvider(), user.id, cid);
    return Response.json({ ok: true, status: updated.status });
  });
}
