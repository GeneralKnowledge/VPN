import { requireUser } from "@/lib/auth";
import { handle } from "@/lib/http";
import { requireProductOrApp } from "@/lib/product";
import { appUrl, getDb } from "@/lib/providers";
import { tripConnectivity } from "@/lib/trip-connectivity";
import { getTrip } from "@/lib/trips";

/**
 * A saved trip's "Stay connected" item (docs/TRAVEL-HUB.md, phase 3): the eSIM plan we'd suggest
 * for its dates, the others, and how to set one up. Reads the eSIM catalogue only; buying goes
 * through the eSIM product's own checkout.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    await requireProductOrApp("travel");
    const user = await requireUser();
    const trip = await getTrip(getDb(), user.id, (await params).id);
    return Response.json({ connectivity: await tripConnectivity(trip, appUrl("esim")) });
  });
}
