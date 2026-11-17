import { requireUser } from "@/lib/auth";
import { handle, parseBody } from "@/lib/http";
import { requireProductOrApp } from "@/lib/product";
import { getDb } from "@/lib/providers";
import { createTrip, createTripSchema, listTrips } from "@/lib/trips";

/** This person's saved trips, on the Travel host or from the signed-in app. */
export async function GET() {
  return handle(async () => {
    await requireProductOrApp("travel");
    const user = await requireUser();
    return Response.json({ trips: await listTrips(getDb(), user.id) });
  });
}

export async function POST(req: Request) {
  return handle(async () => {
    await requireProductOrApp("travel");
    const user = await requireUser();
    const input = await parseBody(req, createTripSchema);
    const trip = await createTrip(getDb(), user.id, input);
    return Response.json({ trip }, { status: 201 });
  });
}
