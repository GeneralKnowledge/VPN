import { requireUser } from "@/lib/auth";
import { handle, parseBody } from "@/lib/http";
import { requireProductOrApp } from "@/lib/product";
import { getDb } from "@/lib/providers";
import { deleteTrip, getTrip, updateTrip, updateTripSchema } from "@/lib/trips";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireProductOrApp("travel");
    const user = await requireUser();
    return Response.json({ trip: await getTrip(getDb(), user.id, (await params).id) });
  });
}

export async function PATCH(req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireProductOrApp("travel");
    const user = await requireUser();
    const input = await parseBody(req, updateTripSchema);
    return Response.json({ trip: await updateTrip(getDb(), user.id, (await params).id, input) });
  });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    await requireProductOrApp("travel");
    const user = await requireUser();
    await deleteTrip(getDb(), user.id, (await params).id);
    return Response.json({ ok: true });
  });
}
